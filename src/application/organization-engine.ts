import { evaluateAuthorization } from '../domain/authorization';
import type { AuthenticatedPrincipal } from '../domain/identity';
import type { Invitation, OrganizationAggregate, OrganizationContext } from '../domain/organization';
import { roles } from '../domain/organization';
import { mutateMembership, provisionOrganization, transferOwnership, transitionInvitation, transitionOrganization, validateAggregate } from '../domain/organization-rules';
import { failure, success, type Result } from '../domain/result';
import type { MutationCommand, OrganizationUseCases, WorkflowDependencies, WorkflowTransaction } from './organization';

/** Compose only behind a trusted server boundary. credential is opaque to the engine. */
export function createOrganizationEngine(deps: WorkflowDependencies, credential: unknown): OrganizationUseCases {
  async function identity(): Promise<Result<AuthenticatedPrincipal>> {
    const p = await deps.principals.resolve(credential);
    return p.ok && (!p.value.userId || !p.value.sessionId || !Number.isFinite(p.value.expiresAt) || p.value.expiresAt <= deps.clock.now()) ? failure('UNAUTHENTICATED') : p;
  }
  async function guarded<T>(work: (p: AuthenticatedPrincipal) => Promise<Result<T>>): Promise<Result<T>> {
    try { const p = await identity(); return p.ok ? await work(p.value) : p; } catch { return failure('UNAVAILABLE'); }
  }
  function access(p: AuthenticatedPrincipal, a: OrganizationAggregate | null, organizationId: string, admin = false) {
    if (!a) return failure('FORBIDDEN');
    const valid = validateAggregate(a); if (!valid.ok) return valid;
    // Ordinary reads require membership, not a role-specific administrative permission.
    const member = a.memberships.find(m => m.userId === p.userId);
    if (!admin) return a.organization.id === organizationId && a.organization.status === 'active' && member?.status === 'active' ? success(true) : failure('FORBIDDEN');
    return evaluateAuthorization(p, a.organization, member ?? null, { organizationId, resourceOrganizationId: organizationId, permission: 'membership.admin' }, deps.clock.now());
  }
  async function read<T>(id: string, work: (a: OrganizationAggregate, p: AuthenticatedPrincipal) => Result<T>, admin = false) {
    return guarded(async p => {
      const a = await deps.queries.load({ actorId: p.userId, organizationId: id });
      const check = access(p, a, id, admin);
      return check.ok && a ? work(a, p) : check as Result<never>;
    });
  }
  async function atomic<T>(p: AuthenticatedPrincipal, organizationId: string, key: string, payload: unknown, work: (tx: WorkflowTransaction, ctx: OrganizationContext, principal: AuthenticatedPrincipal) => Promise<Result<T>>, creation = false): Promise<Result<T>> {
    if (!organizationId || !key || key.length > 200) return failure('INVALID_INPUT');
    const ctx = { organizationId, actorId: p.userId };
    // Canonical tuple encoding is passed to the adapter for cryptographic hashing at rest.
    const digest = JSON.stringify(payload);
    return deps.transactions.run(ctx, async tx => {
      const fresh = await identity(); if (!fresh.ok) return fresh;
      if (fresh.value.userId !== p.userId) return failure('UNAUTHENTICATED');
      const replay = await tx.replay<T>(ctx, key, digest); if (!replay.ok) return replay;
      // Replay must not bypass current membership checks.
      if (!creation) {
        const a = await tx.loadForUpdate(ctx);
        if (!a || a.organization.id !== ctx.organizationId || !a.memberships.some(m => m.userId === p.userId && m.status === 'active')) return failure('FORBIDDEN');
      }
      if (replay.value.found) return success(replay.value.value);
      const result = await work(tx, ctx, fresh.value);
      if (result.ok) await tx.complete(ctx, key, digest, result.value);
      return result;
    });
  }
  async function mutate<T>(action: string, input: MutationCommand, payload: unknown, work: (a: OrganizationAggregate, p: AuthenticatedPrincipal, tx: WorkflowTransaction, ctx: OrganizationContext) => Promise<Result<{ aggregate: OrganizationAggregate; value: T; target?: string }>>, lifecycle = false): Promise<Result<T>> {
    return guarded(p => atomic(p, input.organizationId, input.idempotencyKey, [action, input.expectedVersion, payload], async (tx, ctx, fresh) => {
      const a = await tx.loadForUpdate(ctx);
      if (!a) return failure('FORBIDDEN');
      const check = lifecycle
        ? a.organization.id === ctx.organizationId && a.memberships.some(m => m.userId === p.userId && m.role === 'OWNER' && m.status === 'active') ? success(true) : failure('FORBIDDEN')
        : access(fresh, a, ctx.organizationId, true);
      if (!check.ok) return check;
      if (a.version !== input.expectedVersion) return failure('CONFLICT');
      const result = await work(a, fresh, tx, ctx); if (!result.ok) return result;
      const valid = validateAggregate(result.value.aggregate); if (!valid.ok) return valid;
      const saved = await tx.save(ctx, result.value.aggregate, a.version); if (!saved.ok) return saved;
      await tx.appendAudit({ ...ctx, action, targetId: result.value.target ?? ctx.organizationId, aggregateVersion: result.value.aggregate.version, correlationId: deps.ids.next(), occurredAt: deps.clock.now() });
      return success(result.value.value);
    }));
  }
  const memberChange = (action: string, input: MutationCommand & { targetUserId: string }, change: Parameters<typeof mutateMembership>[3]) =>
    mutate(action, input, [input.targetUserId, change], async (a, p) => {
      const next = mutateMembership(a, p.userId, input.targetUserId, change, input.expectedVersion);
      return next.ok ? success({ aggregate: next.value, value: undefined, target: input.targetUserId }) : next;
    });
  async function invitationCheck(input: { invitationId: string; credential: string }, p: AuthenticatedPrincipal, tx: WorkflowTransaction, ctx: OrganizationContext) {
    const verified = await deps.invitations.verify(input.invitationId, input.credential); if (!verified.ok) return verified;
    const email = await deps.invitations.verifiedEmail(p); if (!email.ok) return email;
    const invitation = await tx.findInvitation(ctx, input.invitationId);
    if (!invitation || invitation.organizationId !== ctx.organizationId) return failure('NOT_FOUND');
    const valid = transitionInvitation(invitation, 'accept', deps.clock.now(), email.value);
    return valid.ok ? success(invitation) : valid;
  }
  return {
    createOrganization: input => guarded(p => {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (name.length < 2 || name.length > 120) return Promise.resolve(failure('INVALID_INPUT'));
      return atomic(p, 'create:' + p.userId, input.idempotencyKey, ['create', name], async (tx, ctx) => {
        const a = provisionOrganization(deps.ids.next(), name, p.userId); if (!a.ok) return a;
        const saved = await tx.provision(p, a.value); if (!saved.ok) return saved;
        await tx.appendAudit({ organizationId: a.value.organization.id, actorId: ctx.actorId, action: 'organization.created', targetId: a.value.organization.id, aggregateVersion: a.value.version, correlationId: deps.ids.next(), occurredAt: deps.clock.now() });
        return success(a.value.organization);
      }, true);
    }),
    getOrganization: input => read(input.organizationId, a => success(a.organization)),
    listMembers: input => read(input.organizationId, a => success(a.memberships)),
    getCurrentUserOrganizations: () => guarded(async p => {
      const candidates = await deps.queries.listForUser(p);
      const allowed = [];
      for (const o of candidates) {
        const a = await deps.queries.load({ actorId: p.userId, organizationId: o.id });
        if (access(p, a, o.id).ok && a) allowed.push(a.organization);
      }
      return success(allowed);
    }),
    selectOrganization: input => read(input.organizationId, (_, p) => success({ organizationId: input.organizationId, actorId: p.userId })),
    updateOrganization: input => mutate('organization.updated', input, [input.name], async a => {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      return name.length < 2 || name.length > 120 ? failure('INVALID_INPUT') : success({ aggregate: { ...a, version: a.version + 1, organization: { ...a.organization, name } }, value: { ...a.organization, name } });
    }),
    transitionOrganization: input => mutate('organization.lifecycle', input, [input.status], async (a, p) => {
      if (!a.memberships.some(m => m.userId === p.userId && m.role === 'OWNER')) return failure('FORBIDDEN');
      const next = transitionOrganization(a, input.status, input.expectedVersion);
      return next.ok ? success({ aggregate: next.value, value: undefined }) : next;
    }, true),
    inviteMember: input => mutate('invitation.created', input, [input.email, input.role], async (a, p, tx, ctx) => {
      const email = input.email.trim().toLowerCase();
      const actor = a.memberships.find(m => m.userId === p.userId);
      if (!roles.includes(input.role) || (input.role as string) === 'OWNER' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return failure('INVALID_INPUT');
      if (actor?.role === 'ADMIN' && input.role === 'ADMIN') return failure('FORBIDDEN');
      if (await tx.findPendingInvitation(ctx, email)) return failure('CONFLICT');
      const invitation: Invitation = { id: deps.ids.next(), organizationId: ctx.organizationId, email, role: input.role, state: 'pending', expiresAt: deps.clock.now() + 7 * 86400000, version: 0 };
      const saved = await tx.saveInvitation(ctx, invitation, -1); if (!saved.ok) return saved;
      return success({ aggregate: { ...a, version: a.version + 1 }, value: invitation, target: invitation.id });
    }),
    revokeInvitation: input => mutate('invitation.revoked', input, [input.invitationId, input.invitationVersion], async (a, _, tx, ctx) => {
      const invitation = await tx.findInvitation(ctx, input.invitationId);
      if (!invitation || invitation.organizationId !== ctx.organizationId) return failure('NOT_FOUND');
      if (invitation.version !== input.invitationVersion) return failure('CONFLICT');
      const next = transitionInvitation(invitation, 'revoke', deps.clock.now()); if (!next.ok) return next;
      const saved = await tx.saveInvitation(ctx, next.value, invitation.version); if (!saved.ok) return saved;
      return success({ aggregate: { ...a, version: a.version + 1 }, value: undefined, target: invitation.id });
    }),
    validateInvitation: input => guarded(async p => {
      const tenant = await deps.invitationLocator.locate(input.invitationId, input.credential); if (!tenant.ok) return tenant;
      const ctx = { organizationId: tenant.value, actorId: p.userId };
      return deps.transactions.run(ctx, async tx => {
        const a = await tx.loadForUpdate(ctx);
        if (!a || a.organization.id !== ctx.organizationId || a.organization.status !== 'active' || !validateAggregate(a).ok) return failure('INVALID_STATE');
        return invitationCheck(input, p, tx, ctx);
      });
    }),
    acceptInvitation: input => guarded(async p => {
      const tenant = await deps.invitationLocator.locate(input.invitationId, input.credential); if (!tenant.ok) return tenant;
      // Recipient has no membership yet: separate locked acceptance scope; tenant stays explicit.
      const ctx = { organizationId: tenant.value, actorId: p.userId };
      return deps.transactions.run(ctx, async tx => {
        const fresh = await identity(); if (!fresh.ok || fresh.value.userId !== p.userId) return failure('UNAUTHENTICATED');
        const verified = await deps.invitations.verify(input.invitationId, input.credential); if (!verified.ok) return verified;
        if (!input.idempotencyKey || input.idempotencyKey.length > 200) return failure('INVALID_INPUT');
        const digest = JSON.stringify(['accept', input.invitationId, input.expectedVersion]);
        const replay = await tx.replay<OrganizationContext>(ctx, input.idempotencyKey, digest); if (!replay.ok) return replay;
        const a = await tx.loadForUpdate(ctx);
        if (!a || a.organization.id !== ctx.organizationId || a.organization.status !== 'active' || !validateAggregate(a).ok) return failure('INVALID_STATE');
        if (replay.value.found) return a.memberships.some(m => m.userId === p.userId && m.status === 'active') ? success(replay.value.value) : failure('FORBIDDEN');
        const checked = await invitationCheck(input, fresh.value, tx, ctx); if (!checked.ok) return checked;
        if (checked.value.version !== input.expectedVersion) return failure('CONFLICT');
        if (a.memberships.some(m => m.userId === p.userId)) return failure('INVALID_STATE');
        const next = transitionInvitation(checked.value, 'accept', deps.clock.now(), checked.value.email); if (!next.ok) return next;
        const savedInvitation = await tx.saveInvitation(ctx, next.value, checked.value.version); if (!savedInvitation.ok) return savedInvitation;
        const aggregate = { ...a, version: a.version + 1, memberships: [...a.memberships, { userId: p.userId, organizationId: ctx.organizationId, role: next.value.role, status: 'active' as const, monitoringDelegated: false }] };
        const saved = await tx.save(ctx, aggregate, a.version); if (!saved.ok) return saved;
        await tx.appendAudit({ ...ctx, action: 'invitation.accepted', targetId: input.invitationId, aggregateVersion: aggregate.version, correlationId: deps.ids.next(), occurredAt: deps.clock.now() });
        await tx.complete(ctx, input.idempotencyKey, digest, ctx);
        return success(ctx);
      });
    }),
    changeMemberRole: input => memberChange('membership.role', input, { kind: 'role', role: input.role }),
    suspendMembership: input => memberChange('membership.suspended', input, { kind: 'status', status: 'suspended' }),
    revokeMembership: input => memberChange('membership.revoked', input, { kind: 'status', status: 'revoked' }),
    activateMembership: input => memberChange('membership.activated', input, { kind: 'status', status: 'active' }),
    transferOwnership: input => mutate('ownership.transferred', input, [input.targetUserId], async (a, p) => {
      const next = transferOwnership(a, p.userId, input.targetUserId, input.expectedVersion);
      return next.ok ? success({ aggregate: next.value, value: undefined, target: input.targetUserId }) : next;
    }),
    evaluateAuthorization: input => guarded(async p => {
      const a = await deps.queries.load({ actorId: p.userId, organizationId: input.organizationId });
      return evaluateAuthorization(p, a?.organization ?? null, a?.memberships.find(m => m.userId === p.userId) ?? null, input, deps.clock.now());
    }),
  };
}
