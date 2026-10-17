import { hasExactlyOneOwner, roles, type Invitation, type OrganizationAggregate, type Role } from './organization';
import { failure, success, type Result } from './result';
export function validateAggregate(aggregate: OrganizationAggregate): Result<true> {
  const { organization, memberships } = aggregate;
  if (!organization.id || !organization.name.trim() || !Number.isSafeInteger(aggregate.version) || aggregate.version < 0 || !['provisioning', 'active', 'suspended', 'closed'].includes(organization.status ?? '')) return failure('INVALID_STATE');
  if (memberships.some(m => !m.userId || m.organizationId !== organization.id || !roles.includes(m.role) || !['active', 'suspended', 'revoked'].includes(m.status ?? '') || (m.role === 'OWNER' && m.status !== 'active')) || new Set(memberships.map(m => m.userId)).size !== memberships.length) return failure('INVALID_STATE');
  if (organization.status === 'active' && !hasExactlyOneOwner(memberships, organization.id)) return failure('OWNER_REQUIRED');
  return success(true);
}
/** Pure proposal only. Repository must compare version and commit atomically under the tenant lock. */
export function transferOwnership(aggregate: OrganizationAggregate, actorId: string, targetUserId: string, expectedVersion: number): Result<OrganizationAggregate> {
  if (aggregate.version !== expectedVersion) return failure('CONFLICT');
  const valid = validateAggregate(aggregate); if (!valid.ok) return valid;
  if (aggregate.organization.status !== 'active') return failure('INVALID_STATE');
  const owner = aggregate.memberships.find(m => m.userId === actorId);
  const target = aggregate.memberships.find(m => m.userId === targetUserId);
  if (!owner || owner.role !== 'OWNER' || owner.status !== 'active') return failure('FORBIDDEN');
  if (!target || target.status !== 'active' || target.userId === actorId) return failure('INVALID_STATE');
  const next = { ...aggregate, version: aggregate.version + 1, memberships: aggregate.memberships.map(m => m.userId === actorId ? { ...m, role: 'ADMIN' as const } : m.userId === targetUserId ? { ...m, role: 'OWNER' as const, monitoringDelegated: false } : m) };
  const checked = validateAggregate(next); return checked.ok ? success(next) : checked;
}
export type MembershipMutation = { readonly kind: 'role'; readonly role: Role } | { readonly kind: 'status'; readonly status: 'active' | 'suspended' | 'revoked' };
export function mutateMembership(aggregate: OrganizationAggregate, actorId: string, targetUserId: string, mutation: MembershipMutation, expectedVersion: number): Result<OrganizationAggregate> {
  if (!['role', 'status'].includes(mutation.kind) || (mutation.kind === 'status' && !['active', 'suspended', 'revoked'].includes(mutation.status))) return failure('INVALID_INPUT');
  if (expectedVersion !== aggregate.version) return failure('CONFLICT');
  const checked = validateAggregate(aggregate); if (!checked.ok) return checked;
  if (aggregate.organization.status !== 'active') return failure('INVALID_STATE');
  const actor = aggregate.memberships.find(m => m.userId === actorId);
  const target = aggregate.memberships.find(m => m.userId === targetUserId);
  if (!actor || actor.status !== 'active' || !['OWNER', 'ADMIN'].includes(actor.role)) return failure('FORBIDDEN');
  if (!target) return failure('NOT_FOUND');
  if (target.role === 'OWNER' || (mutation.kind === 'role' && mutation.role === 'OWNER')) return failure('OWNER_REQUIRED');
  // Administrators cannot elevate themselves or change another administrator.
  if (actor.role === 'ADMIN' && (target.role === 'ADMIN' || (mutation.kind === 'role' && mutation.role === 'ADMIN'))) return failure('FORBIDDEN');
  if (target.status === 'revoked' || (mutation.kind === 'role' && target.status !== 'active')) return failure('INVALID_STATE');
  const next = { ...aggregate, version: aggregate.version + 1, memberships: aggregate.memberships.map(m => m.userId !== targetUserId ? m : mutation.kind === 'role' ? { ...m, role: mutation.role, monitoringDelegated: false } : { ...m, status: mutation.status, monitoringDelegated: false }) };
  const valid = validateAggregate(next); return valid.ok ? success(next) : valid;
}
export function transitionOrganization(aggregate: OrganizationAggregate, state: 'active' | 'suspended' | 'closed', expectedVersion: number): Result<OrganizationAggregate> {
  if (aggregate.version !== expectedVersion) return failure('CONFLICT');
  const transitions: Record<string, readonly string[]> = { provisioning: ['active', 'closed'], active: ['suspended', 'closed'], suspended: ['active', 'closed'], closed: [] };
  const current = aggregate.organization.status;
  if (!current || !transitions[current].includes(state)) return failure('INVALID_STATE');
  const next = { ...aggregate, organization: { ...aggregate.organization, status: state }, version: aggregate.version + 1 };
  const valid = validateAggregate(next); return valid.ok ? success(next) : valid;
}
/** Caller supplies email ONLY from a verified provider assertion; token hash is checked server-side first. */
export function transitionInvitation(invitation: Invitation, action: 'accept' | 'revoke' | 'expire', now: number, verifiedEmail?: string): Result<Invitation> {
  if (!['accept', 'revoke', 'expire'].includes(action)) return failure('INVALID_INPUT');
  if (!Number.isFinite(now) || !Number.isFinite(invitation.expiresAt) || !invitation.id || !invitation.organizationId || !roles.includes(invitation.role) || (invitation.role as Role) === 'OWNER' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitation.email) || !Number.isSafeInteger(invitation.version) || invitation.version < 0) return failure('INVALID_INPUT');
  if (invitation.state !== 'pending') return failure('INVALID_STATE');
  if (action === 'expire') return now >= invitation.expiresAt ? success({ ...invitation, state: 'expired', version: invitation.version + 1 }) : failure('INVALID_STATE');
  if (now >= invitation.expiresAt) return failure('EXPIRED');
  if (action === 'accept' && (!verifiedEmail || verifiedEmail.trim().toLowerCase() !== invitation.email.trim().toLowerCase())) return failure('FORBIDDEN');
  return success({ ...invitation, state: action === 'accept' ? 'accepted' : 'revoked', version: invitation.version + 1 });
}
export function provisionOrganization(id: string, name: string, ownerId: string): Result<OrganizationAggregate> {
  const next: OrganizationAggregate = { organization: { id, name: name.trim(), status: 'active' }, version: 0, memberships: [{ organizationId: id, userId: ownerId, role: 'OWNER', status: 'active', monitoringDelegated: false }] };
  const valid = validateAggregate(next); return valid.ok ? success(next) : valid;
}
