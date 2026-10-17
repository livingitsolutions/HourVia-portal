import { createTimeEngine, type TimeTransaction } from '../application/time-tracking';
import type { AuditEvent, Clock, TransactionRunner } from '../application/organization';
import type { OrganizationContext, Membership, Organization } from '../domain/organization';
import type { TimeEntry, RunningTimer, TimeEntryRevision } from '../domain/time-tracking';
import { evaluateAuthorization } from '../domain/authorization';
import { failure, success, type Result } from '../domain/result';
interface State { timers: Record<string, RunningTimer>; entries: TimeEntry[]; revisions: TimeEntryRevision[]; audit: AuditEvent[]; replay: Record<string, { digest: string; value: unknown }> }
/** Disposable browser-only fixture. No credentials, network, storage, or live adapter. Serialization is process-local simulation. */
export function createPreviewTimeTracking(clock: Clock = { now: () => Date.now() }) {
  let state: State = { timers: {}, entries: [], revisions: [], audit: [], replay: {} }; let sequence = 0;
  const userId = 'preview-member';
  const organizations: Organization[] = [{ id: 'preview-living', name: 'Living IT Solutions', status: 'active' }, { id: 'preview-studio', name: 'Fieldwork Studio', status: 'active' }];
  const memberships: Membership[] = organizations.map(o => ({ organizationId: o.id, userId, role: 'EMPLOYEE', status: 'active' }));
  let tail: Promise<unknown> = Promise.resolve();
  const scope = (c: OrganizationContext) => JSON.stringify([c.organizationId, c.actorId]);
  const transactions: TransactionRunner<TimeTransaction> = { run<T>(ctx: OrganizationContext, work: (tx: TimeTransaction) => Promise<Result<T>>) {
    const operation = tail.then(async () => {
      const draft = structuredClone(state);
      const tx: TimeTransaction = {
        async authorize(c, now) {
          const principal = { userId, sessionId: 'disposable-preview', expiresAt: now + 60000 };
          const result = evaluateAuthorization(principal, organizations.find(o => o.id === c.organizationId) ?? null, memberships.find(m => m.organizationId === c.organizationId && m.userId === c.actorId) ?? null, { organizationId: c.organizationId, resourceOrganizationId: c.organizationId, permission: 'time.track' }, now);
          return result.ok && c.actorId === userId ? success(principal) : failure('FORBIDDEN');
        },
        async active(c) { return structuredClone(draft.timers[scope(c)] ?? null); },
        async saveTimer(c, timer) { if (timer) draft.timers[scope(c)] = structuredClone(timer); else delete draft.timers[scope(c)]; },
        async entries(c) { return structuredClone(draft.entries.filter(e => e.organizationId === c.organizationId && e.userId === c.actorId)); },
        async saveEntry(c, entry) { if (entry.organizationId !== c.organizationId || entry.userId !== c.actorId) throw new Error('FORBIDDEN'); const index = draft.entries.findIndex(e => e.id === entry.id); if (index < 0) draft.entries.push(structuredClone(entry)); else draft.entries[index] = structuredClone(entry); },
        async appendRevision(_c, revision) { draft.revisions.push(structuredClone(revision)); },
        async appendAudit(event) { draft.audit.push(structuredClone(event)); },
        async replay<TValue>(c: OrganizationContext, key: string, digest: string) {
          const record = draft.replay[JSON.stringify([scope(c), key])];
          if (record && record.digest !== digest) return failure('CONFLICT');
          return success(record ? { found: true as const, value: structuredClone(record.value) as TValue } : { found: false as const });
        },
        async complete(c, key, digest, value) { draft.replay[JSON.stringify([scope(c), key])] = { digest, value: structuredClone(value) }; },
      };
      const result = await work(tx); if (result.ok) state = draft; return result;
    });
    tail = operation.catch(() => undefined); void ctx; return operation;
  } };
  return { engine: createTimeEngine({ transactions, clock, actorId: userId, ids: { next: () => `preview-time-${++sequence}` } }), organizations,
    /** Fixture controls for offline authorization/lifecycle testing, never live identity authority. */
    fixtures: { memberships, snapshot: () => structuredClone(state), seed: (entry: TimeEntry) => { state.entries.push(structuredClone(entry)); } },
  };
}
