export const roles = ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CONTRACTOR'] as const;
export type Role = typeof roles[number];
export interface Organization { readonly id: string; readonly name: string; readonly status?: 'provisioning' | 'active' | 'suspended' | 'closed'; readonly version?: number }
export interface Membership { readonly userId: string; readonly organizationId: string; readonly role: Role; readonly status?: 'active' | 'suspended' | 'revoked'; readonly monitoringDelegated?: boolean }
export interface OrganizationContext { readonly organizationId: string; readonly actorId: string }
export function hasExactlyOneOwner(members: readonly Membership[], organizationId: string): boolean {
  return members.filter(m => m.organizationId === organizationId && m.role === 'OWNER' && (m.status === undefined || m.status === 'active')).length === 1;
}
export function belongsToOrganization(member: Membership, context: OrganizationContext): boolean {
  return member.organizationId === context.organizationId && member.userId === context.actorId;
}
export interface OrganizationRepository { findById(context: OrganizationContext): Promise<Organization | null> }

// Optional fields retain Sprint 0 fixture compatibility; authorization requires explicit active state.
export interface OrganizationAggregate { readonly organization: Organization; readonly memberships: readonly Membership[]; readonly version: number }
export interface Invitation {
  readonly id: string; readonly organizationId: string; readonly email: string; readonly role: Exclude<Role, 'OWNER'>;
  readonly state: 'pending' | 'accepted' | 'revoked' | 'expired'; readonly expiresAt: number; readonly version: number;
}
