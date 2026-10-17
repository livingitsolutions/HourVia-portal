/** Server-only OFFLINE candidate. No SDK initialization, environment lookup or active composition. */
import type { DatabaseConnection } from '@netlify/database';
import { inputDigest, type Operation, type IdempotencyClaim } from '../idempotency';
import { runCandidate, type ScopedQueries } from '../verification/transaction-candidate';
import { validateContext, type SecurityContext, type TransactionConnection } from '../transaction';
import { success } from '../../src/domain/result';
import type { Organization, Membership, Invitation, Role } from '../../src/domain/organization';

export interface RowsReply { command: string; rows: readonly Record<string, unknown>[] }
export interface RowsConnection extends TransactionConnection {
  query(text: string, parameters?: readonly unknown[]): Promise<RowsReply>;
}
/** Supported pool.connect/query/release bridge; database instance must be explicitly injected.
 * Never called by runtime composition. This is not an identity or TLS verifier. */
export function nativePoolConnection(database: DatabaseConnection): () => Promise<RowsConnection> {
  return async () => {
    const client = await database.pool.connect();
    return {
      async query(text, parameters) {
        const reply = await client.query(text, parameters ? [...parameters] : undefined);
        return { command: reply.command, rows: reply.rows as Record<string, unknown>[] };
      },
      release(discard) { client.release(discard); },
    };
  };
}
export type Command =
  | { action: 'provision' | 'profile'; payload: { name: string } }
  | { action: 'membership'; payload: { targetUserId: string; role: Exclude<Role, 'OWNER'> } }
  | { action: 'revoke_member' | 'transfer'; payload: { targetUserId: string } }
  | { action: 'issue'; payload: { invitationId: string; email: string; role: Exclude<Role, 'OWNER'>; credentialDigest: string; expiresAt: string } }
  | { action: 'accept'; payload: { invitationId: string; credentialDigest: string; invitationVersion: number } }
  | { action: 'revoke_invitation'; payload: { invitationId: string; invitationVersion: number } };
const categories: Record<Command['action'], Operation> = { provision: 'provision', profile: 'membership', membership: 'membership', revoke_member: 'membership', transfer: 'transfer', issue: 'invite', accept: 'accept', revoke_invitation: 'invite' };
async function rows(q: ScopedQueries, sql: string, parameters: readonly unknown[]) {
  const reply = await q.query(sql, parameters) as Partial<RowsReply>;
  if (!Array.isArray(reply.rows)) throw new Error('ROWS_REQUIRED');
  return reply.rows;
}
function string(row: Record<string, unknown>, key: string): string {
  if (typeof row[key] !== 'string') throw new Error('INVALID_ROW');
  return row[key];
}
function number(row: Record<string, unknown>, key: string): number {
  if (typeof row[key] !== 'number' || !Number.isInteger(row[key])) throw new Error('INVALID_ROW');
  return row[key];
}
export interface Receipt { organizationId: string; targetId: string; version: number; correlationId: string }
function receipt(value: unknown, context: SecurityContext): Receipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_RECEIPT');
  const row = value as Record<string, unknown>;
  if (row.organizationId !== context.organizationId) throw new Error('CROSS_TENANT_RECEIPT');
  return { organizationId: string(row, 'organizationId'), targetId: string(row, 'targetId'), version: number(row, 'version'), correlationId: string(row, 'correlationId') };
}
/** Not a WorkflowTransaction implementation: command-level port deliberately resolves invitation
 * sequencing and audit/claim atomicity in SQL rather than exposing broad aggregate writes. */
export function createOfflineRepositories(connect: () => Promise<RowsConnection>, trusted: SecurityContext) {
  validateContext(trusted);
  const context = Object.freeze({ ...trusted });
  function claim(operation: Operation, key: string, digest: string): IdempotencyClaim {
    return { actorId: context.actorId, organizationId: operation === 'provision' ? null : context.organizationId, operation, key, inputDigest: digest };
  }
  async function transaction<T>(c: IdempotencyClaim, work: (q: ScopedQueries) => Promise<T>) {
    return runCandidate({ connect, context, claim: c, work: async q => success(await work(q)) });
  }
  // Read transactions use the wrapper's claim metadata only; they create no durable claim.
  const readClaim = () => claim('membership', 'offline_read_scope', inputDigest(['read', context.organizationId]));
  async function authorize(q: ScopedQueries, admin = false) {
    const permitted = await rows(q, `SELECT public.hv_tenant_role($1) AS role`, [context.organizationId]);
    const role = permitted[0]?.role;
    if (!['OWNER','ADMIN','MANAGER','EMPLOYEE','CONTRACTOR'].includes(String(role)) || (admin && role !== 'OWNER' && role !== 'ADMIN')) throw new Error('FORBIDDEN');
  }
  return {
    organization() {
      return transaction(readClaim(), async q => {
        await authorize(q);
        const result = await rows(q, 'SELECT id,name,status,version FROM public.organizations WHERE id = $1', [context.organizationId]);
        if (!result[0]) return null;
        const row = result[0];
        if (row.id !== context.organizationId || !['active','suspended','closed','provisioning'].includes(String(row.status))) throw new Error('INVALID_TENANT_ROW');
        return { id: string(row,'id'), name: string(row,'name'), status: row.status as Organization['status'], version: number(row,'version') } satisfies Organization;
      });
    },
    memberships() {
      return transaction(readClaim(), async q => {
        await authorize(q);
        return (await rows(q, 'SELECT user_id,organization_id,role,status,monitoring_delegated FROM public.memberships WHERE organization_id = $1 ORDER BY id', [context.organizationId])).map(row => {
          if (row.organization_id !== context.organizationId || !['OWNER','ADMIN','MANAGER','EMPLOYEE','CONTRACTOR'].includes(String(row.role)) || !['active','suspended','revoked'].includes(String(row.status)) || typeof row.monitoring_delegated !== 'boolean') throw new Error('INVALID_TENANT_ROW');
          return { userId: string(row,'user_id'), organizationId: context.organizationId, role: row.role as Role, status: row.status as Membership['status'], monitoringDelegated: row.monitoring_delegated } satisfies Membership;
        });
      });
    },
    invitation(id: string) {
      return transaction(readClaim(), async q => {
        await authorize(q, true);
        const result = await rows(q, 'SELECT id,organization_id,email,role,state,expires_at,version FROM public.invitations WHERE organization_id = $1 AND id = $2', [context.organizationId,id]);
        if (!result[0]) return null;
        const row = result[0];
        if (row.organization_id !== context.organizationId || row.id !== id || !['ADMIN','MANAGER','EMPLOYEE','CONTRACTOR'].includes(String(row.role)) || !['pending','accepted','revoked','expired'].includes(String(row.state))) throw new Error('INVALID_TENANT_ROW');
        const expiresAt = row.expires_at instanceof Date ? row.expires_at.getTime() : Date.parse(String(row.expires_at));
        if (!Number.isFinite(expiresAt)) throw new Error('INVALID_ROW');
        return { id, organizationId: context.organizationId, email: string(row,'email'), role: row.role as Invitation['role'], state: row.state as Invitation['state'], expiresAt, version: number(row,'version') } satisfies Invitation;
      });
    },
    execute(command: Command, expectedVersion: number, key: string, correlationId: string) {
      const category = categories[command.action];
      if (!category) throw new Error('UNSUPPORTED_COMMAND');
      const snapshot = JSON.stringify(command.payload);
      const digest = inputDigest([command.action,expectedVersion,JSON.parse(snapshot)]);
      return transaction(claim(category,key,digest), async q => {
        const result = await rows(q, 'SELECT public.hv_command($1,$2,$3,$4,$5,$6,$7::jsonb) AS outcome', [command.action,context.organizationId,expectedVersion,key,digest,correlationId,snapshot]);
        const value = receipt(result[0]?.outcome,context);
        // Verify matching durable claim AND audit on the pinned connection before COMMIT.
        const verified = await rows(q, 'SELECT public.hv_receipt($1,$2,$3) AS outcome', [category,key,digest]);
        if (JSON.stringify(receipt(verified[0]?.outcome,context)) !== JSON.stringify(value)) throw new Error('AUDIT_CLAIM_MISMATCH');
        return value;
      });
    },
    reconcile(command: Command, expectedVersion: number, key: string) {
      const category = categories[command.action];
      if (!category) throw new Error('UNSUPPORTED_COMMAND');
      const digest = inputDigest([command.action,expectedVersion,command.payload]);
      // A fresh acknowledged read can establish a completed receipt; absence never proves rollback.
      return transaction(claim(category,key,digest), async q => {
        const result = await rows(q, 'SELECT public.hv_receipt($1,$2,$3) AS outcome', [category,key,digest]);
        return result[0]?.outcome == null ? { status: 'unresolved' as const } : { status: 'completed' as const, value: receipt(result[0].outcome,context) };
      });
    },
  };
}
/** Live composition remains hard-disabled independently of caller booleans or environment flags. */
export function createLiveRepositories(): never { throw new Error('PERSISTENCE_DISABLED_AUTHORITATIVE_SECURITY_UNVERIFIED'); }
