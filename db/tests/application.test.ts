import { describe, expect, it } from 'vitest';
import { createOfflineCommandApplication, createLiveCommandApplication, type CommandApplicationDependencies } from '../candidates/application';
import type { Command, Receipt, RowsConnection } from '../candidates/repositories';
import type { SecurityContext, TransactionOutcome } from '../transaction';
import type { OrganizationAggregate, Invitation } from '../../src/domain/organization';
import { mutateMembership, provisionOrganization, transferOwnership, transitionInvitation } from '../../src/domain/organization-rules';
import { failure, success } from '../../src/domain/result';
import { inputDigest } from '../idempotency';

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12,'0')}`;
const owner = uuid(1), recipient = uuid(2), outsider = uuid(3), session = uuid(4);
const key = (name: string) => `offline_request_${name}`;
function committed<T>(outcome: TransactionOutcome<T>): T {
  expect(outcome.status).toBe('committed');
  if (outcome.status !== 'committed') throw new Error('Expected commit');
  return outcome.value;
}
/** Controlled model of command effects, NOT a SQL parser or PostgreSQL/RLS integration test.
 * Real repositories, canonical hashing, pinned transaction wrapper and receipt verification run.
 * The fake serializes transactions and stages mutations until COMMIT to exercise orchestration.
 */
function fixture() {
  let state = {
    organizations: new Map<string,OrganizationAggregate>(), invitations: new Map<string,Invitation>(),
    claims: new Map<string,{ digest: string; receipt: Receipt }>(), audits: [] as Receipt[], deliveries: new Set<string>(),
  };
  let now = 1000, sequence = 100, tail = Promise.resolve();
  const sessions = new Set([owner,recipient,outsider]);
  const controls = { auditMismatch: false, commit: 'COMMIT', connects: 0, commands: 0, discarded: [] as boolean[] };
  const digest = inputDigest(['offline-proof']);
  const connect = async (): Promise<RowsConnection> => {
    controls.connects++;
    let context: SecurityContext, before: typeof state, unlock: (() => void) | undefined;
    const done = () => { unlock?.(); unlock = undefined; };
    const fail = (): never => { throw new Error('OFFLINE_DENIED'); };
    return {
      async query(sql, params = []) {
        const rows = (value: Record<string,unknown>[]) => ({ command: 'SELECT', rows: value });
        if (sql.startsWith('BEGIN')) {
          const previous = tail; tail = new Promise<void>(resolve => { unlock = resolve; });
          await previous; before = structuredClone(state);
          return { command: 'BEGIN', rows: [] };
        }
        if (sql.startsWith("SELECT set_config('hourvia.actor_id'")) context = { actorId: String(params[0]), sessionId: String(params[1]), organizationId: String(params[2]) };
        if (sql === 'ROLLBACK') { state = before; done(); return { command: 'ROLLBACK', rows: [] }; }
        if (sql === 'COMMIT') {
          if (controls.commit === 'ROLLBACK') state = before;
          done();
          if (controls.commit === 'lost') throw new Error('Offline transport loss');
          return { command: controls.commit, rows: [] };
        }
        const active = () => state.organizations.get(context.organizationId)?.memberships.find(m => m.userId === context.actorId && m.status === 'active');
        if (sql.includes('hv_tenant_role')) return rows([{ role: sessions.has(context.actorId) ? active()?.role : null }]);
        if (sql.startsWith('SELECT id,name')) {
          const a = state.organizations.get(context.organizationId);
          return rows(a ? [{ ...a.organization, version: a.version }] : []);
        }
        if (sql.startsWith('SELECT user_id')) return rows((state.organizations.get(context.organizationId)?.memberships ?? []).map(m => ({ user_id: m.userId, organization_id: m.organizationId, role: m.role, status: m.status, monitoring_delegated: false })));
        if (sql.startsWith('SELECT id,organization_id')) {
          const i = state.invitations.get(String(params[1]));
          return rows(i?.organizationId === context.organizationId ? [{ ...i, organization_id: i.organizationId, expires_at: new Date(i.expiresAt) }] : []);
        }
        if (sql.includes('hv_receipt')) {
          const claim = state.claims.get(JSON.stringify([context.actorId, params[0], params[1], params[0] === 'provision' ? null : context.organizationId]));
          const receipt = claim && claim.digest === params[2] && active() && state.audits.some(a => JSON.stringify(a) === JSON.stringify(claim.receipt)) ? claim.receipt : null;
          return rows([{ outcome: controls.auditMismatch ? null : receipt }]);
        }
        if (sql.includes('hv_command')) {
          controls.commands++;
          if (!sessions.has(context.actorId)) fail();
          const action = params[0] as Command['action'], tenant = String(params[1]), version = Number(params[2]);
          const payload = JSON.parse(String(params[6]));
          const category = ({ provision: 'provision', profile: 'membership', membership: 'membership', revoke_member: 'membership', transfer: 'transfer', issue: 'invite', accept: 'accept', revoke_invitation: 'invite' })[action];
          const claimKey = JSON.stringify([context.actorId,category,params[3],action === 'provision' ? null : tenant]);
          const a = state.organizations.get(tenant);
          if (tenant !== context.organizationId) fail();
          if (!['provision','accept'].includes(action) && !['OWNER','ADMIN'].includes(active()?.role ?? '')) fail();
          if (action === 'accept') {
            const i = state.invitations.get(payload.invitationId);
            if (!i || i.organizationId !== tenant || payload.credentialDigest !== digest || i.email !== `${context.actorId}@example.test` || (i.state === 'accepted' && !active())) fail();
          }
          const replay = state.claims.get(claimKey);
          if (replay) { if (replay.digest !== params[4]) fail(); return rows([{ outcome: replay.receipt }]); }
          if (action !== 'provision' && (!a || a.version !== version || a.organization.status !== 'active')) fail();
          let targetId = tenant;
          if (action === 'provision') {
            const created = provisionOrganization(tenant,payload.name,context.actorId);
            if (!created.ok || a) fail();
            if (created.ok) state.organizations.set(tenant,{ ...created.value, version: 1 });
          } else if (a) {
            let next = { ...a, version: a.version + 1 };
            if (action === 'profile') next = { ...next, organization: { ...a.organization, name: payload.name } };
            if (['membership','revoke_member','transfer'].includes(action)) {
              const changed = action === 'transfer' ? transferOwnership(a,context.actorId,payload.targetUserId,version) : mutateMembership(a,context.actorId,payload.targetUserId,action === 'membership' ? { kind: 'role', role: payload.role } : { kind: 'status', status: 'revoked' },version);
              if (!changed.ok) fail();
              if (changed.ok) next = changed.value;
              targetId = payload.targetUserId;
            }
            if (action === 'issue') {
              if ((active()?.role === 'ADMIN' && payload.role === 'ADMIN') || payload.role === 'OWNER') fail();
              const invitation: Invitation = { id: payload.invitationId, organizationId: tenant, email: payload.email, role: payload.role, expiresAt: Date.parse(payload.expiresAt), state: 'pending', version: 0 };
              state.invitations.set(invitation.id,invitation); state.deliveries.add(invitation.id); targetId = invitation.id;
            }
            if (action === 'accept' || action === 'revoke_invitation') {
              const invitation = state.invitations.get(payload.invitationId);
              if (!invitation || invitation.organizationId !== tenant || invitation.version !== payload.invitationVersion) fail();
              if (invitation) {
                const changed = transitionInvitation(invitation,action === 'accept' ? 'accept' : 'revoke',now,`${context.actorId}@example.test`);
                if (!changed.ok) fail();
                if (changed.ok) state.invitations.set(invitation.id,changed.value);
                if (action === 'accept') {
                  if (a.memberships.some(m => m.userId === context.actorId)) fail();
                  next = { ...next, memberships: [...a.memberships,{ userId: context.actorId, organizationId: tenant, role: invitation.role, status: 'active', monitoringDelegated: false }] };
                }
                targetId = invitation.id; state.deliveries.delete(invitation.id);
              }
            }
            state.organizations.set(tenant,next);
          }
          const receipt = { organizationId: tenant, targetId, version: state.organizations.get(tenant)!.version, correlationId: String(params[5]) };
          state.audits.push(receipt); state.claims.set(claimKey,{ digest: String(params[4]), receipt });
          return rows([{ outcome: receipt }]);
        }
        return { command: sql.split(' ')[0], rows: [] };
      },
      release(discard) { controls.discarded.push(discard); done(); },
    };
  };
  const prepared = new Map<string,Extract<Command,{ action: 'issue' }>['payload']>();
  const deps: CommandApplicationDependencies = {
    connect, clock: { now: () => now }, correlations: { next: () => uuid(++sequence) },
    principals: { resolve: async cookie => typeof cookie === 'string' && sessions.has(cookie) ? success({ userId: cookie, sessionId: session, expiresAt: 999999999 }) : failure('UNAUTHENTICATED') },
    discovery: { listForUser: async p => [...state.organizations.values()].filter(a => a.memberships.some(m => m.userId === p.userId && m.status === 'active')).map(a => a.organization) },
    invitations: {
      prepare: async (p,input) => {
        const k = JSON.stringify([p.userId,input.organizationId,input.idempotencyKey,input.email,input.role]);
        if (!prepared.has(k)) prepared.set(k,{ invitationId: uuid(++sequence), email: input.email.trim().toLowerCase(), role: input.role, expiresAt: new Date(now + 60000).toISOString(), credentialDigest: digest });
        return success(prepared.get(k)!);
      },
      inspect: async (p,id,credential) => {
        const invitation = state.invitations.get(id);
        return invitation && credential === 'offline-proof' && invitation.email === `${p.userId}@example.test` ? success({ invitation, credentialDigest: digest }) : failure('FORBIDDEN');
      },
    },
  };
  const app = (actor: unknown = owner) => createOfflineCommandApplication(deps,actor);
  const command = (id: string, name: string) => ({ organizationId: id, expectedVersion: state.organizations.get(id)!.version, idempotencyKey: key(name) });
  const create = async (name = 'create') => committed(await app().createOrganization({ name: 'Offline Studio', idempotencyKey: key(name) })).organizationId;
  const invite = async (id: string) => {
    const receipt = committed(await app().inviteMember({ ...command(id,'invite'), email: `${recipient}@example.test`, role: 'EMPLOYEE' }));
    return { ...command(id,'accept'), invitationId: receipt.targetId, credential: 'offline-proof', invitationVersion: 0 };
  };
  const join = async (id: string) => { const input = await invite(id); committed(await app(recipient).acceptInvitation(input)); return input; };
  return { app, create, invite, join, command, controls, deps, sessions, state: () => state, time: (value: number) => { now = value; } };
}

describe('Sprint 4A.2 offline command application workflows (no PostgreSQL)', () => {
  it('constructs without connecting; live composition and forged identity fail closed', async () => {
    const f = fixture(); f.app(); expect(f.controls.connects).toBe(0);
    expect(() => createLiveCommandApplication()).toThrow('APPLICATION_DISABLED');
    expect((await f.app({ userId: owner }).createOrganization({ name: 'Forged', idempotencyKey: key('forged') })).status).toBe('rejected');
    expect(f.controls.connects).toBe(0);
  });
  it('atomically creates an organization and owner, replays with stable tenant across compositions', async () => {
    const f = fixture(); const id = await f.create();
    expect(await f.create()).toBe(id); expect(f.state().organizations.size).toBe(1);
    expect(f.state().organizations.get(id)?.memberships).toEqual([{ userId: owner, organizationId: id, role: 'OWNER', status: 'active', monitoringDelegated: false }]);
    expect(f.state().audits).toHaveLength(1); expect(f.state().claims.size).toBe(1);
    expect(committed(await f.app().getOrganization({ organizationId: id }))?.name).toBe('Offline Studio');
    expect(committed(await f.app().getCurrentUserOrganizations())).toHaveLength(1);
    expect((await f.app().createOrganization({ name: 'Changed', idempotencyKey: key('create') })).status).toBe('unavailable');
  });
  it('rejects unauthorized and cross-tenant access without granting membership on selection', async () => {
    const f = fixture(); const id = await f.create();
    expect((await f.app(outsider).getOrganization({ organizationId: id })).status).toBe('unavailable');
    expect((await f.app(outsider).selectOrganization({ organizationId: id })).status).not.toBe('committed');
    expect(await f.app().evaluateAuthorization({ organizationId: id, resourceOrganizationId: uuid(99), permission: 'organization.admin' })).toEqual({ status: 'rejected', error: 'FORBIDDEN' });
    expect(f.state().organizations.get(id)?.memberships).toHaveLength(1);
  });
  it('updates profiles, changes roles, revokes membership and rejects stale selection', async () => {
    const f = fixture(); const id = await f.create(); await f.join(id);
    committed(await f.app().updateOrganization({ ...f.command(id,'profile'), name: 'Renamed' }));
    committed(await f.app().changeMemberRole({ ...f.command(id,'role'), targetUserId: recipient, role: 'MANAGER' }));
    expect(committed(await f.app(recipient).validateCurrentMembership({ organizationId: id })).role).toBe('MANAGER');
    const selected = committed(await f.app(recipient).selectOrganization({ organizationId: id }));
    committed(await f.app().revokeMembership({ ...f.command(id,'revoke'), targetUserId: recipient }));
    expect((await f.app(recipient).validateCurrentMembership(selected)).status).not.toBe('committed');
    expect((await f.app(recipient).updateOrganization({ ...f.command(id,'denied'), name: 'Stolen' })).status).not.toBe('committed');
    expect(committed(await f.app().listMembers({ organizationId: id })).find(m => m.userId === recipient)?.status).toBe('revoked');
  });
  it('serializes competing ownership attempts and retains one active owner', async () => {
    const f = fixture(); const id = await f.create(); await f.join(id);
    const input = { ...f.command(id,'transfer'), targetUserId: recipient };
    const outcomes = await Promise.all([f.app().transferOwnership(input),f.app().transferOwnership({ ...input, idempotencyKey: key('competing') })]);
    expect(outcomes.filter(o => o.status === 'committed')).toHaveLength(1);
    const owners = f.state().organizations.get(id)!.memberships.filter(m => m.role === 'OWNER' && m.status === 'active');
    expect(owners).toHaveLength(1); expect(owners[0].userId).toBe(recipient);
  });
  it('issues, retrieves, validates and accepts invitations; delivery intent never sends email', async () => {
    const f = fixture(); const id = await f.create(); const input = await f.invite(id);
    expect(f.state().deliveries.has(input.invitationId)).toBe(true);
    expect(committed(await f.app().getInvitation({ organizationId: id, invitationId: input.invitationId }))?.state).toBe('pending');
    expect(committed(await f.app(recipient).validateInvitation(input)).state).toBe('pending');
    const first = await f.app(recipient).acceptInvitation(input);
    expect(first.status).toBe('committed'); expect(await f.app(recipient).acceptInvitation(input)).toEqual(first);
    expect(f.state().deliveries.size).toBe(0); expect(f.state().organizations.get(id)?.memberships).toHaveLength(2);
    expect(JSON.stringify([...f.state().claims.values(),...f.state().audits])).not.toContain('offline-proof');
  });
  it.each(['expired','revoked','wrong-proof'] as const)('fails closed on %s invitation', async kind => {
    const f = fixture(); const id = await f.create(); const input = await f.invite(id);
    if (kind === 'expired') f.time(61000);
    if (kind === 'revoked') committed(await f.app().revokeInvitation({ ...f.command(id,'revoke_invitation'), invitationId: input.invitationId, invitationVersion: 0 }));
    if (kind === 'wrong-proof') input.credential = 'wrong';
    expect((await f.app(recipient).validateInvitation(input)).status).not.toBe('committed');
    expect((await f.app(recipient).acceptInvitation(input)).status).not.toBe('committed');
    expect(f.state().organizations.get(id)?.memberships).toHaveLength(1);
  });
  it.each(['audit','ROLLBACK'] as const)('rolls back business state, owner, audit and claim on %s failure', async mode => {
    const f = fixture(); if (mode === 'audit') f.controls.auditMismatch = true; else f.controls.commit = mode;
    expect((await f.app().createOrganization({ name: 'Offline Studio', idempotencyKey: key('rollback') })).status).toBe(mode === 'audit' ? 'unavailable' : 'rolled_back');
    expect(f.state().organizations.size).toBe(0); expect(f.state().audits).toHaveLength(0); expect(f.state().claims.size).toBe(0);
  });
  it('preserves uncertain COMMIT, discards connection and reconciles through a fresh receipt lookup', async () => {
    const f = fixture(); const id = await f.create(); const input = f.command(id,'uncertain');
    f.controls.commit = 'lost';
    const commands = f.controls.commands;
    expect(await f.app().updateOrganization({ ...input, name: 'Possibly committed' })).toEqual({ status: 'commit_unknown' });
    expect(f.controls.commands).toBe(commands + 1); expect(f.controls.discarded.at(-1)).toBe(true);
    f.controls.commit = 'COMMIT';
    const result = committed(await f.app().reconcileCommand(input,{ action: 'profile', payload: { name: 'Possibly committed' } }));
    expect(result.status).toBe('completed'); expect(f.controls.commands).toBe(commands + 1);
    expect(committed(await f.app().reconcileCommand({ ...input, idempotencyKey: key('absent') },{ action: 'profile', payload: { name: 'Possibly committed' } })).status).toBe('unresolved');
  });
  it.each(['MANAGER','EMPLOYEE','CONTRACTOR'] as const)('preserves %s read access but denies administrative changes', async role => {
    const f = fixture(); const id = await f.create(); await f.join(id);
    committed(await f.app().changeMemberRole({ ...f.command(id,'set_role'), targetUserId: recipient, role }));
    committed(await f.app(recipient).listMembers({ organizationId: id }));
    expect((await f.app(recipient).changeMemberRole({ ...f.command(id,'escalate'), targetUserId: recipient, role: 'ADMIN' })).status).not.toBe('committed');
    expect((await f.app(recipient).inviteMember({ ...f.command(id,'unauthorized_issue'), email: `${outsider}@example.test`, role: 'EMPLOYEE' })).status).not.toBe('committed');
  });
  it('denies ADMIN escalation, owner revocation and cross-tenant member mutations', async () => {
    const f = fixture(); const first = await f.create(), second = await f.create('second'); await f.join(first);
    committed(await f.app().changeMemberRole({ ...f.command(first,'admin'), targetUserId: recipient, role: 'ADMIN' }));
    expect((await f.app(recipient).revokeMembership({ ...f.command(first,'owner_revoke'), targetUserId: owner })).status).not.toBe('committed');
    expect((await f.app(recipient).transferOwnership({ ...f.command(first,'steal_owner'), targetUserId: recipient })).status).not.toBe('committed');
    expect((await f.app(recipient).changeMemberRole({ ...f.command(first,'admin_escalation'), targetUserId: recipient, role: 'ADMIN' })).status).not.toBe('committed');
    expect((await f.app().changeMemberRole({ ...f.command(second,'cross_tenant'), targetUserId: recipient, role: 'MANAGER' })).status).not.toBe('committed');
  });
  it('replays invitation issuance with the same digest and delivery intent', async () => {
    const f = fixture(); const id = await f.create(); const input = { ...f.command(id,'issue_replay'), email: `${recipient}@example.test`, role: 'EMPLOYEE' as const };
    const first = committed(await f.app().inviteMember(input));
    f.time(2000);
    expect(committed(await f.app().inviteMember(input))).toEqual(first);
    expect(f.state().invitations.size).toBe(1); expect(f.state().deliveries.size).toBe(1);
  });
  it('reconciles an uncertain creation using server-derived tenant scope', async () => {
    const f = fixture(); f.controls.commit = 'lost';
    const input = { name: 'Uncertain studio', idempotencyKey: key('uncertain_create') };
    expect(await f.app().createOrganization(input)).toEqual({ status: 'commit_unknown' });
    f.controls.commit = 'COMMIT';
    expect(committed(await f.app().reconcileCreation(input)).status).toBe('completed');
    expect(f.state().organizations.size).toBe(1); expect(f.controls.commands).toBe(1);
  });
  it('switches organizations without retaining authorization and rejects revoked sessions', async () => {
    const f = fixture(); const first = await f.create(), second = await f.create('second');
    expect(committed(await f.app().selectOrganization({ organizationId: first })).organizationId).toBe(first);
    expect(committed(await f.app().selectOrganization({ organizationId: second })).organizationId).toBe(second);
    f.sessions.delete(owner);
    expect((await f.app().selectOrganization({ organizationId: first })).status).toBe('rejected');
  });
});
