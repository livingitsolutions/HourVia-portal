/** Server-only, connection-free protocol. No Netlify client is instantiated here. */
import type { Result } from '../src/domain/result';

export interface QueryReply { readonly command: string }
export interface TransactionConnection {
  query(text: string, parameters?: readonly unknown[]): Promise<QueryReply>;
  /** discard=true destroys a connection whose transaction state is uncertain. */
  release(discard: boolean): void;
}
export interface SecurityContext { readonly actorId: string; readonly sessionId: string; readonly organizationId: string }
export type TransactionOutcome<T> =
  | { readonly status: 'committed'; readonly value: T }
  | { readonly status: 'rejected'; readonly error: string }
  | { readonly status: 'rolled_back' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'commit_unknown' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateContext(context: SecurityContext): void {
  if (!context || ![context.actorId, context.sessionId, context.organizationId].every(v => typeof v === 'string' && uuid.test(v))) throw new Error('INVALID_SECURITY_CONTEXT');
}
const retryable = (e: unknown) => typeof e === 'object' && e !== null && 'code' in e && (e.code === '40001' || e.code === '40P01');
/** Work must recheck session/user and scoped permissions under tenant lock, on every attempt.
 * No external side effects; return a typed failure to abort. Do not swallow database errors.
 * The callback is not a business endpoint or an authorization implementation.
 */
export async function runTransaction<T>(deps: {
  connect(): Promise<TransactionConnection>;
  context: SecurityContext;
  work(connection: TransactionConnection): Promise<Result<T>>;
  maxAttempts?: number;
  pause?(attempt: number): Promise<void>;
}): Promise<TransactionOutcome<T>> {
  validateContext(deps.context);
  const attempts = deps.maxAttempts ?? 3;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3) throw new Error('INVALID_RETRY_BOUND');
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let connection: TransactionConnection;
    try { connection = await deps.connect(); } catch { return { status: 'unavailable' }; }
    let phase: 'work' | 'commit' = 'work';
    let discard = false;
    let retry = false;
    try {
      if ((await connection.query('BEGIN ISOLATION LEVEL SERIALIZABLE')).command !== 'BEGIN') throw new Error('BEGIN_NOT_ACKNOWLEDGED');
      await connection.query("SELECT set_config('hourvia.actor_id', $1, true), set_config('hourvia.session_id', $2, true), set_config('hourvia.organization_id', $3, true), set_config('TimeZone', 'UTC', true)", [deps.context.actorId, deps.context.sessionId, deps.context.organizationId]);
      const result = await deps.work(connection);
      if (!result.ok) {
        const rollback = await connection.query('ROLLBACK');
        if (rollback.command !== 'ROLLBACK') { discard = true; return { status: 'unavailable' }; }
        return { status: 'rejected', error: result.error };
      }
      phase = 'commit';
      const commit = await connection.query('COMMIT');
      if (commit.command === 'COMMIT') return { status: 'committed', value: result.value };
      if (commit.command === 'ROLLBACK') return { status: 'rolled_back' };
      discard = true;
      return { status: 'commit_unknown' };
    } catch (error) {
      // Transport loss during COMMIT may mean it succeeded. A later ROLLBACK proves nothing.
      if (phase === 'commit' && !retryable(error)) { discard = true; return { status: 'commit_unknown' }; }
      try { discard = (await connection.query('ROLLBACK')).command !== 'ROLLBACK'; } catch { discard = true; }
      retry = !discard && retryable(error) && attempt < attempts;
      if (!retry) return { status: 'unavailable' };
    } finally {
      try { connection.release(discard); } catch { /* COMMIT acknowledgement remains authoritative. */ }
    }
    if (retry) {
      try {
        if (deps.pause) await deps.pause(attempt);
        else await new Promise(resolve => setTimeout(resolve, 10 * attempt));
      } catch { return { status: 'unavailable' }; }
    }
  }
  return { status: 'unavailable' };
}
