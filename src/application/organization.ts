import type { AuthenticatedPrincipal } from '../domain/identity';
import type { Invitation, Organization, OrganizationAggregate, OrganizationContext, Role } from '../domain/organization';
import type { Permission } from '../domain/authorization';
import type { Result } from '../domain/result';
import type { MembershipMutation } from '../domain/organization-rules';
import type { PrincipalResolver } from './identity';
export interface Clock { now(): number }
export interface MutationCommand { readonly organizationId: string; readonly expectedVersion: number; readonly idempotencyKey: string }
/** Trusted principal is resolved inside the server boundary, never deserialized from a browser. */
export interface OrganizationUseCases {
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
export interface AuditEvent { readonly organizationId: string; readonly actorId: string; readonly action: string; readonly targetId: string; readonly occurredAt: number }
/** All operations on this port run on the same locked transaction connection. */
export interface OrganizationTransaction {
  loadForUpdate(context: OrganizationContext): Promise<OrganizationAggregate | null>;
  save(context: OrganizationContext, aggregate: OrganizationAggregate, expectedVersion: number): Promise<Result<void>>;
  provision(principal: AuthenticatedPrincipal, aggregate: OrganizationAggregate): Promise<Result<void>>;
  findInvitation(context: OrganizationContext, invitationId: string): Promise<Invitation | null>;
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
