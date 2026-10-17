/** Quarantined, server-only candidate. Uses verified pg-compatible query/release only.
 * The trusted callback must await queries and perform no external side effects.
 * No database is acquired here; the approved operator supplies a bounded pinned client.
 */
import { runTransaction, validateContext, type SecurityContext, type TransactionConnection, type TransactionOutcome, type QueryReply } from '../transaction';
import { validateClaim, type IdempotencyClaim } from '../idempotency';
import type { Result } from '../../src/domain/result';
export interface ScopedQueries { query(sql: string, parameters?: readonly unknown[]): Promise<QueryReply> }
export type Reconciliation<T> = { status: 'completed'; claim: IdempotencyClaim; value: T } | { status: 'unresolved' };
export async function runCandidate<T>(deps: {
  connect(): Promise<TransactionConnection>; context: SecurityContext; claim: IdempotencyClaim;
  work(connection: ScopedQueries): Promise<Result<T>>;
  /** Fresh trusted durable lookup, with authentication, keyed by the complete claim.
   * Absence/pending is unresolved, never proof of rollback. No automatic unknown retry.
   */
  reconcile?(claim: IdempotencyClaim): Promise<Reconciliation<T>>;
  maxAttempts?: number; pause?(attempt: number): Promise<void>;
}): Promise<TransactionOutcome<T>> {
  validateContext(deps.context); validateClaim(deps.claim);
  if (deps.claim.actorId !== deps.context.actorId || (deps.claim.organizationId !== null && deps.claim.organizationId !== deps.context.organizationId)) throw new Error('CLAIM_CONTEXT_MISMATCH');
  const context = { ...deps.context }; const claim = Object.freeze({ ...deps.claim });
  const outcome = await runTransaction({ ...deps, context,
    connect: async () => {
      const client = await deps.connect();
      let poisoned = false;
      try { await client.query('DISCARD ALL'); } catch { client.release(true); throw new Error('CONNECTION_RESET_FAILED'); }
      return {
        async query(sql, parameters) {
          const reply = await client.query(sql, parameters);
          if (sql.startsWith('SELECT set_config')) {
            await client.query("SELECT set_config('hourvia.operation', $1, true), set_config('statement_timeout','5000',true), set_config('lock_timeout','2000',true), set_config('idle_in_transaction_session_timeout','10000',true)", [claim.operation]);
          }
          if (sql === 'COMMIT' || sql === 'ROLLBACK') {
            try { await client.query('DISCARD ALL'); } catch { poisoned = true; }
          }
          return reply;
        },
        release(discard) { client.release(discard || poisoned); },
      };
    },
    work: async connection => {
      let active = true;
      const pending: Promise<QueryReply>[] = [];
      const scoped: ScopedQueries = { query(sql, parameters) {
        if (!active) return Promise.reject(new Error('EXPIRED_TRANSACTION_SCOPE'));
        const query = connection.query(sql, parameters);
        pending.push(query); void query.catch(() => {});
        return query;
      } };
      try {
        const result = await deps.work(scoped);
        active = false;
        const replies = await Promise.allSettled(pending);
        if (replies.some(r => r.status === 'rejected')) throw new Error('SCOPED_QUERY_FAILED');
        return result;
      } finally { active = false; await Promise.allSettled(pending); }
    },
  });
  if (outcome.status !== 'commit_unknown' || !deps.reconcile) return outcome;
  try {
    const recovered = await deps.reconcile(claim);
    if (recovered.status === 'completed' && (Object.keys(claim) as (keyof IdempotencyClaim)[]).every(k => recovered.claim[k] === claim[k])) return { status: 'committed', value: recovered.value };
  } catch { /* Preserve uncertainty; no driver details escape. */ }
  return { status: 'commit_unknown' };
}
