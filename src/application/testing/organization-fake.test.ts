import { describe, expect, it } from 'vitest';
import { createOrganizationEngine } from '../organization-engine';
import type { AuditEvent, WorkflowDependencies, WorkflowTransaction } from '../organization';
import type { Invitation, OrganizationAggregate, OrganizationContext } from '../../domain/organization';
import { failure, success, type Result } from '../../domain/result';

function fixture() {
  let organizations = new Map<string, OrganizationAggregate>();
  let invitations = new Map<string, Invitation>();
  let keys = new Map<string, { digest: string; value: unknown }>();
  let audits: AuditEvent[] = [];
  let sequence = 0;
  let now = 1000;
  let failAudit = false;
  let tail = Promise.resolve();
  const deps: WorkflowDependencies = {
    principals: { resolve: async credential => typeof credential === 'string' ? success({ userId: credential, sessionId: 'offline', expiresAt: 9999999999 }) : failure('UNAUTHENTICATED') },
    clock: { now: () => now },
    ids: { next: () => 'org-' + ++sequence },
    queries: {
      listForUser: async () => [...organizations.values()].map(a => a.organization),
      load: async ctx => structuredClone(organizations.get(ctx.organizationId) ?? null),
    },
    invitations: {
      verify: async (id, credential) => invitations.has(id) && credential === 'offline-proof' ? success(true) : failure('FORBIDDEN'),
      verifiedEmail: async p => success(p.userId + '@example.test'),
    },
    invitationLocator: { locate: async (id, credential) => credential === 'offline-proof' && invitations.has(id) ? success(invitations.get(id)!.organizationId) : failure('FORBIDDEN') },
    transactions: {
      async run<T>(_ctx: OrganizationContext, work: (tx: WorkflowTransaction) => Promise<Result<T>>) {
        const before = tail;
        let release!: () => void;
        tail = new Promise<void>(resolve => { release = resolve; });
        await before;
        const snapshot = structuredClone({ organizations, invitations, keys, audits });
        const keyFor = (c: OrganizationContext, key: string) => JSON.stringify([c.actorId, c.organizationId, key]);
        const tx: WorkflowTransaction = {
          loadForUpdate: async c => structuredClone(organizations.get(c.organizationId) ?? null),
          save: async (c, a, version) => {
            if (a.organization.id !== c.organizationId || organizations.get(c.organizationId)?.version !== version) return failure('CONFLICT');
            organizations.set(c.organizationId, structuredClone(a)); return success(undefined);
          },
          provision: async (_, a) => {
            if (organizations.has(a.organization.id)) return failure('CONFLICT');
            organizations.set(a.organization.id, structuredClone(a)); return success(undefined);
          },
          findInvitation: async (c, id) => {
            const invitation = invitations.get(id);
            return invitation?.organizationId === c.organizationId ? structuredClone(invitation) : null;
          },
          findPendingInvitation: async (c, email) => structuredClone([...invitations.values()].find(i => i.organizationId === c.organizationId && i.email === email && i.state === 'pending') ?? null),
          saveInvitation: async (c, invitation, version) => {
            if (invitation.organizationId !== c.organizationId || (invitations.get(invitation.id)?.version ?? -1) !== version) return failure('CONFLICT');
            invitations.set(invitation.id, structuredClone(invitation)); return success(undefined);
          },
          claimIdempotency: async () => failure('DISABLED'),
          replay: async <V>(c: OrganizationContext, key: string, digest: string) => {
            const existing = keys.get(keyFor(c, key));
            return existing ? existing.digest !== digest ? failure('CONFLICT') : success({ found: true as const, value: structuredClone(existing.value) as V }) : success({ found: false as const });
          },
          complete: async (c, key, digest, value) => { keys.set(keyFor(c, key), { digest, value: structuredClone(value) }); },
          appendAudit: async event => { if (failAudit) throw Error('offline audit failure'); audits.push(structuredClone(event)); },
        };
        try {
          const result = await work(tx);
          if (!result.ok) ({ organizations, invitations, keys, audits } = snapshot);
          return result;
        } catch (error) {
          ({ organizations, invitations, keys, audits } = snapshot);
          throw error;
        } finally { release(); }
      },
    },
  };
  const engine = (actor = 'owner') => createOrganizationEngine(deps, actor);
  async function create() {
    const result = await engine().createOrganization({ name: 'Offline Studio', idempotencyKey: 'create' });
    if (!result.ok) throw Error(result.error);
    return result.value.id;
  }
  async function invite(id: string, user = 'recipient') {
    const a = organizations.get(id)!;
    const result = await engine().inviteMember({ organizationId: id, expectedVersion: a.version, idempotencyKey: 'invite-' + user, email: user + '@example.test', role: 'EMPLOYEE' });
    if (!result.ok) throw Error(result.error);
    return result.value;
  }
  async function join(id: string, user = 'recipient') {
    const invitation = await invite(id, user);
    const result = await engine(user).acceptInvitation({ invitationId: invitation.id, credential: 'offline-proof', expectedVersion: 0, idempotencyKey: 'accept' });
    expect(result.ok).toBe(true);
  }
  const command = (id: string, key = 'mutation') => ({ organizationId: id, expectedVersion: organizations.get(id)!.version, idempotencyKey: key });
  return { engine, create, invite, join, command, deps, data: () => ({ organizations, invitations, keys, audits }), time: (value: number) => { now = value; }, failAudit: () => { failAudit = true; } };
}

describe('Sprint 3B organization workflows (isolated transaction fake)', () => {
  it('validates creation, assigns exactly one owner and replays the original result', async () => {
    const f = fixture();
    expect(await f.engine().createOrganization({ name: ' ', idempotencyKey: 'bad' })).toEqual(failure('INVALID_INPUT'));
    expect(await f.engine().createOrganization({ name: 'x'.repeat(121), idempotencyKey: 'bad' })).toEqual(failure('INVALID_INPUT'));
    const id = await f.create();
    expect(await f.engine().createOrganization({ name: 'Offline Studio', idempotencyKey: 'create' })).toEqual(success(f.data().organizations.get(id)!.organization));
    expect(await f.engine().createOrganization({ name: 'Different', idempotencyKey: 'create' })).toEqual(failure('CONFLICT'));
    expect(f.data().organizations.size).toBe(1);
    expect(f.data().audits).toHaveLength(1);
  });
  it('isolates reads, listing, switching, mutations and resource authority', async () => {
    const f = fixture(); const id = await f.create();
    expect(await f.engine('outsider').getOrganization({ organizationId: id })).toEqual(failure('FORBIDDEN'));
    expect(await f.engine('outsider').listMembers({ organizationId: id })).toEqual(failure('FORBIDDEN'));
    expect(await f.engine('outsider').getCurrentUserOrganizations()).toEqual(success([]));
    expect(await f.engine('outsider').selectOrganization({ organizationId: id })).toEqual(failure('FORBIDDEN'));
    expect(await f.engine().selectOrganization({ organizationId: id })).toEqual(success({ organizationId: id, actorId: 'owner' }));
    expect(await f.engine().evaluateAuthorization({ organizationId: id, resourceOrganizationId: 'another', permission: 'organization.admin' })).toEqual(failure('FORBIDDEN'));
    expect(await f.engine('outsider').updateOrganization({ ...f.command(id), name: 'Stolen' })).toEqual(failure('FORBIDDEN'));
  });
  it('updates profile and checks versions and runtime roles', async () => {
    const f = fixture(); const id = await f.create(); await f.join(id);
    expect(await f.engine('recipient').updateOrganization({ ...f.command(id), name: 'Denied' })).toEqual(failure('FORBIDDEN'));
    expect((await f.engine().updateOrganization({ ...f.command(id), name: 'Renamed' })).ok).toBe(true);
    expect(await f.engine().updateOrganization({ ...f.command(id, 'stale'), expectedVersion: 0, name: 'Stale' })).toEqual(failure('CONFLICT'));
    expect(await f.engine().inviteMember({ ...f.command(id, 'invalid-role'), email: 'x@example.test', role: 'OWNER' as 'ADMIN' })).toEqual(failure('INVALID_INPUT'));
  });
  it.each(['expired', 'revoked', 'wrong-email', 'wrong-proof'] as const)('rejects %s invitations', async state => {
    const f = fixture(); const id = await f.create(); const invitation = await f.invite(id);
    if (state === 'expired') f.time(invitation.expiresAt);
    if (state === 'revoked') expect((await f.engine().revokeInvitation({ ...f.command(id), invitationId: invitation.id, invitationVersion: 0 })).ok).toBe(true);
    const input = { invitationId: invitation.id, credential: state === 'wrong-proof' ? 'bad' : 'offline-proof', expectedVersion: 0, idempotencyKey: 'accept' };
    expect((await f.engine(state === 'wrong-email' ? 'other' : 'recipient').validateInvitation(input)).ok).toBe(false);
    expect((await f.engine(state === 'wrong-email' ? 'other' : 'recipient').acceptInvitation(input)).ok).toBe(false);
    expect(f.data().organizations.get(id)!.memberships).toHaveLength(1);
  });
  it('accepts atomically, validates, replays once and prevents duplicate membership', async () => {
    const f = fixture(); const id = await f.create(); const invitation = await f.invite(id);
    const input = { invitationId: invitation.id, credential: 'offline-proof', expectedVersion: 0, idempotencyKey: 'accept' };
    expect((await f.engine('recipient').validateInvitation(input)).ok).toBe(true);
    const results = await Promise.all([f.engine('recipient').acceptInvitation(input), f.engine('recipient').acceptInvitation(input)]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0].ok).toBe(true);
    expect(f.data().organizations.get(id)!.memberships).toHaveLength(2);
    expect(f.data().audits.filter(a => a.action === 'invitation.accepted')).toHaveLength(1);
    expect((await f.engine('recipient').acceptInvitation({ ...input, idempotencyKey: 'second' })).ok).toBe(false);
  });
  it('blocks escalation, changes roles and invalidates authorization after revocation', async () => {
    const f = fixture(); const id = await f.create(); await f.join(id);
    expect((await f.engine().changeMemberRole({ ...f.command(id), targetUserId: 'recipient', role: 'ADMIN' })).ok).toBe(true);
    await f.join(id, 'third');
    expect(await f.engine('recipient').changeMemberRole({ ...f.command(id), targetUserId: 'third', role: 'ADMIN' })).toEqual(failure('FORBIDDEN'));
    expect(await f.engine('recipient').revokeMembership({ ...f.command(id), targetUserId: 'owner' })).toEqual(failure('OWNER_REQUIRED'));
    expect((await f.engine().revokeMembership({ ...f.command(id, 'revoke'), targetUserId: 'recipient' })).ok).toBe(true);
    expect(await f.engine('recipient').evaluateAuthorization({ organizationId: id, resourceOrganizationId: id, permission: 'time.track' })).toEqual(failure('FORBIDDEN'));
    expect(await f.engine('recipient').selectOrganization({ organizationId: id })).toEqual(failure('FORBIDDEN'));
  });
  it('serializes concurrent ownership transfers with exactly one winner', async () => {
    const f = fixture(); const id = await f.create(); await f.join(id); await f.join(id, 'third');
    const cmd = f.command(id);
    const results = await Promise.all(['recipient', 'third'].map(targetUserId => f.engine().transferOwnership({ ...cmd, idempotencyKey: targetUserId, targetUserId })));
    expect(results.filter(r => r.ok)).toHaveLength(1);
    const a = f.data().organizations.get(id)!;
    expect(a.memberships.filter(m => m.role === 'OWNER' && m.status === 'active')).toHaveLength(1);
    expect(a.memberships.find(m => m.userId === 'owner')!.role).toBe('ADMIN');
    expect(await f.engine().transferOwnership({ ...f.command(id, 'retry'), targetUserId: 'third' })).toEqual(failure('FORBIDDEN'));
  });
  it('rolls back writes, invitations, audit and idempotency on audit failure', async () => {
    const f = fixture(); const id = await f.create(); const before = structuredClone(f.data());
    f.failAudit();
    expect(await f.engine().inviteMember({ ...f.command(id), email: 'recipient@example.test', role: 'EMPLOYEE' })).toEqual(failure('UNAVAILABLE'));
    expect(f.data()).toEqual(before);
    const g = fixture(); g.failAudit();
    expect((await g.engine().createOrganization({ name: 'Offline', idempotencyKey: 'create' })).ok).toBe(false);
    expect(g.data().organizations.size).toBe(0);
    expect(g.data().keys.size).toBe(0);
  });
  it('suspends, resumes and closes organizations with owner-only lifecycle authority', async () => {
    const f = fixture(); const id = await f.create(); await f.join(id);
    expect((await f.engine().transitionOrganization({ ...f.command(id), status: 'suspended' })).ok).toBe(true);
    expect((await f.engine().getOrganization({ organizationId: id })).ok).toBe(false);
    expect((await f.engine('recipient').transitionOrganization({ ...f.command(id, 'bad'), status: 'active' })).ok).toBe(false);
    expect((await f.engine().transitionOrganization({ ...f.command(id, 'resume'), status: 'active' })).ok).toBe(true);
    expect((await f.engine().transitionOrganization({ ...f.command(id, 'close'), status: 'closed' })).ok).toBe(true);
    expect((await f.engine().transitionOrganization({ ...f.command(id, 'reopen'), status: 'active' })).ok).toBe(false);
  });
  it('enforces current session resolution and audit fields', async () => {
    const f = fixture(); const id = await f.create();
    expect(f.data().audits[0]).toEqual({ organizationId: id, actorId: 'owner', action: 'organization.created', targetId: id, aggregateVersion: 0, correlationId: 'org-2', occurredAt: 1000 });
    f.deps.principals.resolve = async () => failure('REVOKED');
    expect(await f.engine().listMembers({ organizationId: id })).toEqual(failure('REVOKED'));
  });
});

describe('Sprint 3B additional authorization and retry contracts', () => {
  it.each(['MANAGER', 'EMPLOYEE', 'CONTRACTOR'] as const)('denies administrative writes for %s', async role => {
    const f = fixture(); const id = await f.create(); await f.join(id);
    expect((await f.engine().changeMemberRole({ ...f.command(id), targetUserId: 'recipient', role })).ok).toBe(true);
    expect(await f.engine('recipient').inviteMember({ ...f.command(id, 'deny'), email: 'other@example.test', role: 'EMPLOYEE' })).toEqual(failure('FORBIDDEN'));
    expect(await f.engine('recipient').transferOwnership({ ...f.command(id, 'deny-transfer'), targetUserId: 'recipient' })).toEqual(failure('FORBIDDEN'));
    expect((await f.engine('recipient').listMembers({ organizationId: id })).ok).toBe(true);
  });
  it('suspension denies access, activation restores it, and revocation is terminal', async () => {
    const f = fixture(); const id = await f.create(); await f.join(id);
    expect((await f.engine().suspendMembership({ ...f.command(id, 'suspend'), targetUserId: 'recipient' })).ok).toBe(true);
    expect((await f.engine('recipient').getCurrentUserOrganizations())).toEqual(success([]));
    expect((await f.engine().activateMembership({ ...f.command(id, 'activate'), targetUserId: 'recipient' })).ok).toBe(true);
    expect((await f.engine('recipient').selectOrganization({ organizationId: id })).ok).toBe(true);
    expect((await f.engine().revokeMembership({ ...f.command(id, 'remove'), targetUserId: 'recipient' })).ok).toBe(true);
    expect(await f.engine().activateMembership({ ...f.command(id, 'undo-remove'), targetUserId: 'recipient' })).toEqual(failure('INVALID_STATE'));
    expect(await f.engine().suspendMembership({ ...f.command(id, 'owner'), targetUserId: 'owner' })).toEqual(failure('OWNER_REQUIRED'));
  });
  it('rechecks membership before replaying a successful operation', async () => {
    const f = fixture(); const id = await f.create(); await f.join(id);
    await f.engine().changeMemberRole({ ...f.command(id, 'promote'), targetUserId: 'recipient', role: 'ADMIN' });
    const cmd = { ...f.command(id, 'admin-edit'), name: 'Admin edit' };
    expect((await f.engine('recipient').updateOrganization(cmd)).ok).toBe(true);
    await f.engine().revokeMembership({ ...f.command(id, 'remove'), targetUserId: 'recipient' });
    expect(await f.engine('recipient').updateOrganization(cmd)).toEqual(failure('FORBIDDEN'));
  });
  it('switches between two tenants without carrying authority or invitation access', async () => {
    const f = fixture(); const first = await f.create();
    const other = await f.engine('other').createOrganization({ name: 'Other Tenant', idempotencyKey: 'create' });
    if (!other.ok) throw Error('offline setup');
    const second = other.value.id;
    const invitation = await f.invite(first);
    expect(await f.engine('other').revokeInvitation({ ...f.command(second), invitationId: invitation.id, invitationVersion: 0 })).toEqual(failure('NOT_FOUND'));
    expect(await f.engine('other').selectOrganization({ organizationId: first })).toEqual(failure('FORBIDDEN'));
    expect((await f.engine('other').selectOrganization({ organizationId: second })).ok).toBe(true);
    expect(await f.engine().changeMemberRole({ ...f.command(second), targetUserId: 'other', role: 'ADMIN' })).toEqual(failure('FORBIDDEN'));
    expect(f.data().invitations.get(invitation.id)!.state).toBe('pending');
  });
  it('rejects expired sessions and identity changes inside a transaction', async () => {
    const f = fixture(); const id = await f.create();
    let calls = 0;
    f.deps.principals.resolve = async () => success({ userId: ++calls === 1 ? 'owner' : 'other', sessionId: 'offline', expiresAt: 9999999 });
    expect(await f.engine().updateOrganization({ ...f.command(id), name: 'Denied' })).toEqual(failure('UNAUTHENTICATED'));
    f.deps.principals.resolve = async () => success({ userId: 'owner', sessionId: 'offline', expiresAt: 1000 });
    expect(await f.engine().getOrganization({ organizationId: id })).toEqual(failure('UNAUTHENTICATED'));
  });
  it('rolls back invitation acceptance and key completion when audit fails', async () => {
    const f = fixture(); const id = await f.create(); const invitation = await f.invite(id);
    const before = structuredClone(f.data()); f.failAudit();
    expect(await f.engine('recipient').acceptInvitation({ invitationId: invitation.id, credential: 'offline-proof', expectedVersion: 0, idempotencyKey: 'accept' })).toEqual(failure('UNAVAILABLE'));
    expect(f.data()).toEqual(before);
  });
});

describe('Sprint 3B invitation uniqueness', () => {
  it('rejects a second pending invitation for the same normalized recipient', async () => {
    const f = fixture(); const id = await f.create(); await f.invite(id);
    expect(await f.engine().inviteMember({ ...f.command(id, 'duplicate-email'), email: ' RECIPIENT@example.test ', role: 'EMPLOYEE' })).toEqual(failure('CONFLICT'));
    expect(f.data().invitations.size).toBe(1);
  });
});
