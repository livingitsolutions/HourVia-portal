export const roles = ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CONTRACTOR'] as const;
export type Role = typeof roles[number];
export interface Organization { readonly id: string; readonly name: string }
export interface Membership { readonly userId: string; readonly organizationId: string; readonly role: Role }
export interface OrganizationContext { readonly organizationId: string; readonly actorId: string }
export function hasExactlyOneOwner(members: readonly Membership[], organizationId: string): boolean {
  return members.filter(m => m.organizationId === organizationId && m.role === 'OWNER').length === 1;
}
export function belongsToOrganization(member: Membership, context: OrganizationContext): boolean {
  return member.organizationId === context.organizationId && member.userId === context.actorId;
}
export interface OrganizationRepository { findById(context: OrganizationContext): Promise<Organization | null> }
