import type { AuthenticatedPrincipal } from '../domain/identity';
import type { Invitation, Membership, Organization, OrganizationAggregate, OrganizationContext, Role } from '../domain/organization';
import type { Permission } from '../domain/authorization';
import type { Result } from '../domain/result';
import type { MembershipMutation } from '../domain/organization-rules';
import type { PrincipalResolver } from './identity';
export interface Clock { now(): number }
export interface MutationCommand { readonly organizationId: string; readonly expectedVersion: number; readonly idempotencyKey: string }
/** Trusted principal is resolved inside the server boundary, never deserialized from a browser. */
export interface OrganizationUseCases {
  getOrganization(input: { organizationId: string }): Promise<Result<Organization>>;
  listMembers(input: { organizationId: string }): Promise<Result<readonly Membership[]>>;
  updateOrganization(input: MutationCommand & { name: string }): Promise<Result<Organization>>;
  transitionOrganization(input: MutationCommand & { status: 'active' | 'suspended' | 'closed' }): Promise<Result<void>>;
  validateInvitation(input: { invitationId: string; credential: string }): Promise<Result<Invitation>>;
  revokeInvitation(input: MutationCommand & { invitationId: string; invitationVersion: number }): Promise<Result<void>>;
  createOrganization(input: { name: string; idempotencyKey: string }): Promise<Result<Organization>>;
  getCurrentUserOrganizations(): Promise<Result<readonly Organization[]>>;
  selectOrganization(input: { organizationId: string }): Promise<Result<OrganizationContext>>;
  inviteMember(input: MutationCommand & { email: string; role: Exclude<Role, 'OWNER'> }): Promise<Result<Invitation>>;
  acceptInvitation(input: { invitationId: string; credential: string; expectedVersion: number; idempotencyKey: string }): Promise<Result<OrganizationContext>>;
  changeMemberRole(input: MutationCommand & { targetUserId: string; role: Exclude<Role, 'OWNER'> }): Promise<Result<void>>;
  suspendMembership(input: MutationCommand & { targetUserId: string }): Promise<Result<void>>;
  revokeMembership(input: MutationCommand & { targetUserId: string }): Promise<Result<void>>;
  activateMembership(input: MutationCommand & { targetUserId: string }): Promise<Result<void>>;
  transferOwnership(input: MutationCommand & { targetUserId: string }): Promise<Result<void>>;
  evaluateAuthorization(input: { organizationId: string; resourceOrganizationId: string; permission: Permission }): Promise<Result<true>>;
}
export interface AuditEvent { readonly organizationId: string; readonly actorId: string; readonly action: string; readonly targetId: string; readonly occurredAt: number; readonly aggregateVersion: number; readonly correlationId: string }
/** All operations on this port run on the same locked transaction connection. */
export interface OrganizationTransaction {
  loadForUpdate(context: OrganizationContext): Promise<OrganizationAggregate | null>;
  save(context: OrganizationContext, aggregate: OrganizationAggregate, expectedVersion: number): Promise<Result<void>>;
  provision(principal: AuthenticatedPrincipal, aggregate: OrganizationAggregate): Promise<Result<void>>;
  findInvitation(context: OrganizationContext, invitationId: string): Promise<Invitation | null>;
  /** New invitation (-1 version) requires atomic credential-digest issuance.
   * Queue delivery transactionally; never send email inside a retried transaction.
   * Updates preserve the digest and enforce tenant/version/state constraints. */
  saveInvitation(context: OrganizationContext, invitation: Invitation, expectedVersion: number): Promise<Result<void>>;
  claimIdempotency(context: OrganizationContext, key: string, inputDigest: string): Promise<Result<'new' | 'replay'>>;
  appendAudit(event: AuditEvent): Promise<void>;
}
export interface TransactionRunner {
  /** Serializable or equivalent tenant locking. Roll back writes, audit and key claims on error.
   * Recheck actor membership/session under lock; bounded serialization retries reuse idempotency key. */
  run<T>(context: OrganizationContext, operation: (transaction: OrganizationTransaction) => Promise<Result<T>>): Promise<Result<T>>;
}
export interface OrganizationQueries {
  listForUser(principal: AuthenticatedPrincipal): Promise<readonly Organization[]>;
  load(context: OrganizationContext): Promise<OrganizationAggregate | null>;
}
export interface InvitationCredentials {
  /** Persist only a cryptographic digest; never log raw credentials. */
  verify(invitationId: string, credential: string): Promise<Result<true>>;
  verifiedEmail(principal: AuthenticatedPrincipal): Promise<Result<string>>;
}
export interface OrganizationDependencies { readonly principals: PrincipalResolver; readonly queries: OrganizationQueries; readonly transactions: TransactionRunner; readonly invitations: InvitationCredentials; readonly clock: Clock }
export interface MembershipChangeProposal { readonly mutation: MembershipMutation; readonly aggregate: OrganizationAggregate; readonly expectedVersion: number }

/** Durable implementations must use the existing Netlify PostgreSQL boundary.
 * A key is unique by actor + organization (or actor creation scope) + key.
 * Store the canonical input digest AND completed result in the same transaction.
 * Different input for an existing key is CONFLICT; replay returns original result.
 * Never persist raw credentials. Retention must cover the advertised retry window.
 */
export interface WorkflowTransaction extends OrganizationTransaction {
  /** Tenant lock plus the existing pending-recipient unique constraint prevent duplicates. */
  findPendingInvitation(context: OrganizationContext, normalizedEmail: string): Promise<Invitation | null>;
  replay<T>(context: OrganizationContext, key: string, digest: string): Promise<Result<{ found: false } | { found: true; value: T }>>;
  complete<T>(context: OrganizationContext, key: string, digest: string, value: T): Promise<void>;
}
export interface WorkflowDependencies extends Omit<OrganizationDependencies, 'transactions'> {
  readonly transactions: {
    run<T>(context: OrganizationContext, operation: (transaction: WorkflowTransaction) => Promise<Result<T>>): Promise<Result<T>>;
  };
  readonly ids: { next(): string };
  /** Trusted lookup validates credential digest before revealing a tenant. */
  readonly invitationLocator: { locate(id: string, credential: string): Promise<Result<string>> };
}
