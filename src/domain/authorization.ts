import { roles, type Membership, type Organization, type Role } from './organization';
import type { AuthenticatedPrincipal } from './identity';
import { failure, success, type Result } from './result';
export const permissions = ['organization.admin', 'membership.admin', 'time.track', 'timesheet.submit', 'timesheet.approve', 'project.manage', 'client.manage', 'billing.prepare', 'report.read', 'audit.read', 'monitoring.admin'] as const;
export type Permission = typeof permissions[number];
const all = permissions;
export const rolePermissions: Readonly<Record<Role, readonly Permission[]>> = {
  OWNER: all,
  ADMIN: all,
  MANAGER: ['time.track', 'timesheet.submit', 'timesheet.approve', 'project.manage', 'client.manage', 'report.read'],
  EMPLOYEE: ['time.track', 'timesheet.submit'],
  CONTRACTOR: ['time.track', 'timesheet.submit'],
};
/** Inputs are server-resolved, never request-body role claims. Resource tenant is mandatory. */
export function evaluateAuthorization(principal: AuthenticatedPrincipal | null, organization: Organization | null, member: Membership | null, request: { organizationId: string; resourceOrganizationId: string; permission: Permission }, now: number): Result<true> {
  if (!principal || !principal.userId || !principal.sessionId || !Number.isFinite(now) || !Number.isFinite(principal.expiresAt) || principal.expiresAt <= now) return failure('UNAUTHENTICATED');
  if (!organization || organization.status !== 'active' || organization.id !== request.organizationId || request.resourceOrganizationId !== organization.id || !member || member.userId !== principal.userId || member.organizationId !== organization.id || member.status !== 'active' || !roles.includes(member.role) || !permissions.includes(request.permission)) return failure('FORBIDDEN');
  if (request.permission === 'monitoring.admin' && member.role === 'MANAGER' && member.monitoringDelegated === true) return success(true);
  return rolePermissions[member.role].includes(request.permission) ? success(true) : failure('FORBIDDEN');
}
