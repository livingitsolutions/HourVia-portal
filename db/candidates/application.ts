/** Offline server composition candidate. Never imported by Functions or browser code.
 * No client, provider, environment lookup, SQL installation or connection at construction. */
import { createHash } from 'node:crypto';
import type { PrincipalResolver } from '../../src/application/identity';
import type { Clock, MutationCommand, WorkflowDependencies } from '../../src/application/organization';
import type { AuthenticatedPrincipal } from '../../src/domain/identity';
import type { Invitation } from '../../src/domain/organization';
import { evaluateAuthorization, type Permission } from '../../src/domain/authorization';
import { transitionInvitation } from '../../src/domain/organization-rules';
import { type Result } from '../../src/domain/result';
import type { SecurityContext, TransactionOutcome } from '../transaction';
import { createOfflineRepositories, type Command, type RowsConnection } from './repositories';

/** These missing durable adapters are deliberately mandatory; no runtime fake fallback.
 * Discovery returns candidates only; every candidate is reauthorized by tenant repositories.
 * Recipient inspection must verify digest + current session's verified email before disclosure.
 * Issuance preparation must be stable by actor/tenant/key/input, including expiry and digest;
 * it stores no business state or delivery effect. Actual delivery intent is part of `issue` SQL.
 */
export interface CommandApplicationDependencies {
  principals: PrincipalResolver;
  clock: Clock;
  connect(): Promise<RowsConnection>;
  discovery: Pick<WorkflowDependencies['queries'], 'listForUser'>;
  invitations: {
    prepare(principal: AuthenticatedPrincipal, input: MutationCommand & { email: string; role: Invitation['role'] }): Promise<Result<Extract<Command, { action: 'issue' }>['payload']>>;
    inspect(principal: AuthenticatedPrincipal, id: string, credential: string): Promise<Result<{ invitation: Invitation; credentialDigest: string }>>;
  };
  correlations: { next(): string };
}
const denied = <T = never>(error: string): TransactionOutcome<T> => ({ status: 'rejected', error });
/** Stable server allocation ensures creator replay uses the original tenant, including after
 * process restart. UUID v8 is derived from actor/key only; this value grants no authority. */
function creationId(actor: string, key: string): string {
  const hex = createHash('sha256').update(JSON.stringify(['hourvia.organization.v1', actor, key])).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export function createOfflineCommandApplication(deps: CommandApplicationDependencies, credential: unknown) {
  async function guarded<T>(work: (p: AuthenticatedPrincipal) => Promise<TransactionOutcome<T>>): Promise<TransactionOutcome<T>> {
    try {
      const p = await deps.principals.resolve(credential);
      if (!p.ok) return denied(p.error);
      const now = deps.clock.now();
      if (!p.value.userId || !p.value.sessionId || !Number.isFinite(now) || !Number.isFinite(p.value.expiresAt) || p.value.expiresAt <= now) return denied('UNAUTHENTICATED');
      return await work(p.value);
    } catch { return { status: 'unavailable' }; }
  }
  const repo = (p: AuthenticatedPrincipal, id: string) => createOfflineRepositories(deps.connect, { actorId: p.userId, sessionId: p.sessionId, organizationId: id } satisfies SecurityContext);
  const execute = (input: MutationCommand, command: Command) => guarded(p => repo(p,input.organizationId).execute(command,input.expectedVersion,input.idempotencyKey,deps.correlations.next()));
  async function membership(p: AuthenticatedPrincipal, id: string) {
    const organization = await repo(p,id).organization();
    if (organization.status !== 'committed') return organization;
    const members = await repo(p,id).memberships();
    if (members.status !== 'committed') return members;
    const member = members.value.find(m => m.userId === p.userId);
    if (!organization.value || organization.value.id !== id || organization.value.status !== 'active' || member?.organizationId !== id || member.status !== 'active') return denied('FORBIDDEN');
    return { status: 'committed' as const, value: { organization: organization.value, member } };
  }
  return {
    reconcileCommand: (input: MutationCommand, command: Command) => guarded(p => repo(p,input.organizationId).reconcile(command,input.expectedVersion,input.idempotencyKey)),
    reconcileCreation: (input: { name: string; idempotencyKey: string }) => guarded(p => repo(p,creationId(p.userId,input.idempotencyKey)).reconcile({ action: 'provision', payload: { name: input.name.trim() } },0,input.idempotencyKey)),
    createOrganization(input: { name: string; idempotencyKey: string }) {
      return guarded(p => repo(p,creationId(p.userId,input.idempotencyKey)).execute({ action: 'provision', payload: { name: input.name.trim() } },0,input.idempotencyKey,deps.correlations.next()));
    },
    getOrganization: (input: { organizationId: string }) => guarded(p => repo(p,input.organizationId).organization()),
    updateOrganization: (input: MutationCommand & { name: string }) => execute(input,{ action: 'profile', payload: { name: input.name.trim() } }),
    listMembers: (input: { organizationId: string }) => guarded(p => repo(p,input.organizationId).memberships()),
    changeMemberRole: (input: MutationCommand & Extract<Command,{ action: 'membership' }>['payload']) => execute(input,{ action: 'membership', payload: { targetUserId: input.targetUserId, role: input.role } }),
    revokeMembership: (input: MutationCommand & { targetUserId: string }) => execute(input,{ action: 'revoke_member', payload: { targetUserId: input.targetUserId } }),
    transferOwnership: (input: MutationCommand & { targetUserId: string }) => execute(input,{ action: 'transfer', payload: { targetUserId: input.targetUserId } }),
    validateCurrentMembership: (input: { organizationId: string }) => guarded(async p => {
      const check = await membership(p,input.organizationId);
      return check.status === 'committed' ? { status: 'committed', value: check.value.member } : check;
    }),
    selectOrganization: (input: { organizationId: string }) => guarded(async p => {
      const check = await membership(p,input.organizationId);
      return check.status === 'committed' ? { status: 'committed', value: { organizationId: input.organizationId, actorId: p.userId } } : check;
    }),
    evaluateAuthorization: (input: { organizationId: string; resourceOrganizationId: string; permission: Permission }) => guarded<true>(async p => {
      const check = await membership(p,input.organizationId);
      if (check.status !== 'committed') return check;
      const result = evaluateAuthorization(p,check.value.organization,check.value.member,input,deps.clock.now());
      return result.ok ? { status: 'committed', value: result.value } : denied(result.error);
    }),
    getCurrentUserOrganizations: () => guarded(async p => {
      const allowed = [];
      for (const candidate of await deps.discovery.listForUser(p)) {
        const check = await membership(p,candidate.id);
        // An outage cannot be represented as a complete organization listing.
        if (check.status !== 'committed') return check;
        allowed.push(check.value.organization);
      }
      return { status: 'committed', value: allowed };
    }),
    inviteMember: (input: MutationCommand & { email: string; role: Invitation['role'] }) => guarded(async p => {
      const check = await membership(p,input.organizationId);
      if (check.status !== 'committed') return check;
      const allowed = evaluateAuthorization(p,check.value.organization,check.value.member,{ organizationId: input.organizationId, resourceOrganizationId: input.organizationId, permission: 'membership.admin' },deps.clock.now());
      if (!allowed.ok) return denied(allowed.error);
      const prepared = await deps.invitations.prepare(p,input);
      if (!prepared.ok) return denied(prepared.error);
      // Trusted preparation cannot silently alter caller intent.
      if (prepared.value.email !== input.email.trim().toLowerCase() || prepared.value.role !== input.role) return denied('INVALID_INPUT');
      return repo(p,input.organizationId).execute({ action: 'issue', payload: prepared.value },input.expectedVersion,input.idempotencyKey,deps.correlations.next());
    }),
    getInvitation: (input: { organizationId: string; invitationId: string }) => guarded(p => repo(p,input.organizationId).invitation(input.invitationId)),
    validateInvitation: (input: { invitationId: string; credential: string }) => guarded<Invitation>(async p => {
      const inspected = await deps.invitations.inspect(p,input.invitationId,input.credential);
      if (!inspected.ok) return denied(inspected.error);
      if (inspected.value.invitation.id !== input.invitationId) return denied('FORBIDDEN');
      const valid = transitionInvitation(inspected.value.invitation,'accept',deps.clock.now(),inspected.value.invitation.email);
      return valid.ok ? { status: 'committed', value: inspected.value.invitation } : denied(valid.error);
    }),
    acceptInvitation: (input: MutationCommand & { invitationId: string; credential: string; invitationVersion: number }) => guarded(async p => {
      const inspected = await deps.invitations.inspect(p,input.invitationId,input.credential);
      if (!inspected.ok) return denied(inspected.error);
      const { invitation, credentialDigest } = inspected.value;
      if (invitation.id !== input.invitationId || invitation.organizationId !== input.organizationId) return denied('FORBIDDEN');
      // SQL rechecks recipient/session/state under lock. Do not pre-reject accepted replays.
      return repo(p,invitation.organizationId).execute({ action: 'accept', payload: { invitationId: invitation.id, credentialDigest, invitationVersion: input.invitationVersion } },input.expectedVersion,input.idempotencyKey,deps.correlations.next());
    }),
    revokeInvitation: (input: MutationCommand & { invitationId: string; invitationVersion: number }) => execute(input,{ action: 'revoke_invitation', payload: { invitationId: input.invitationId, invitationVersion: input.invitationVersion } }),
  };
}
/** Live credentials and endpoints cannot be enabled through options or environment flags. */
export function createLiveCommandApplication(): never { throw new Error('APPLICATION_DISABLED_AUTHORITATIVE_SECURITY_UNVERIFIED'); }
