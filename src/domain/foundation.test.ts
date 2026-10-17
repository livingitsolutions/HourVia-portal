import { describe, expect, it } from 'vitest';
import { evaluateAuthorization, permissions, rolePermissions, type Permission } from './authorization';
import { roles, type Invitation, type OrganizationAggregate, type Role } from './organization';
import { mutateMembership, provisionOrganization, transferOwnership, transitionInvitation, transitionOrganization, validateAggregate } from './organization-rules';
const aggregate: OrganizationAggregate = { organization: { id: 'a', name: 'Studio', status: 'active' }, version: 4, memberships: [ { userId: 'owner', organizationId: 'a', role: 'OWNER', status: 'active' }, { userId: 'member', organizationId: 'a', role: 'EMPLOYEE', status: 'active' } ] };
const invitation: Invitation = { id: 'invite', organizationId: 'a', email: 'recipient@example.test', role: 'EMPLOYEE', state: 'pending', expiresAt: 200, version: 0 };
const principal = { userId: 'member', sessionId: 'session', expiresAt: 200 };
const request = { organizationId: 'a', resourceOrganizationId: 'a', permission: 'time.track' as Permission };
describe('organization lifecycle and concurrency proposals', () => {
  it('provisions a single owner organization with monitoring delegation off', () => {
    const result = provisionOrganization('new', ' Solo ', 'owner'); expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.memberships).toHaveLength(1); expect(validateAggregate(result.value).ok).toBe(true); expect(result.value.memberships[0].monitoringDelegated).toBe(false); }
    expect(provisionOrganization('new', ' ', 'owner').ok).toBe(false);
  });
  it('rejects zero, duplicate, suspended and cross-tenant owners', () => {
    for (const memberships of [[], [...aggregate.memberships, { ...aggregate.memberships[0], userId: 'second' }], [{ ...aggregate.memberships[0], status: 'suspended' as const }], [{ ...aggregate.memberships[0], organizationId: 'b' }]]) expect(validateAggregate({ ...aggregate, memberships }).ok).toBe(false);
  });
  it('transfers ownership atomically as one immutable versioned proposal', () => {
    const result = transferOwnership(aggregate, 'owner', 'member', 4); expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.version).toBe(5); expect(result.value.memberships.map(m => m.role)).toEqual(['ADMIN', 'OWNER']); expect(validateAggregate(result.value).ok).toBe(true); expect(transferOwnership(result.value, 'member', 'owner', 4)).toEqual({ ok: false, error: 'CONFLICT' }); }
    expect(aggregate.memberships[0].role).toBe('OWNER');
  });
  it.each(['owner', 'unknown'])('rejects invalid ownership target %s', target => { expect(transferOwnership(aggregate, 'owner', target, 4).ok).toBe(false); });
  it('rejects nonowner and inactive ownership mutations', () => {
    expect(transferOwnership(aggregate, 'member', 'owner', 4).ok).toBe(false);
    expect(transferOwnership({ ...aggregate, memberships: [aggregate.memberships[0], { ...aggregate.memberships[1], status: 'suspended' }] }, 'owner', 'member', 4).ok).toBe(false);
    expect(mutateMembership(aggregate, 'owner', 'owner', { kind: 'status', status: 'revoked' }, 4).ok).toBe(false);
    expect(mutateMembership(aggregate, 'owner', 'member', { kind: 'role', role: 'OWNER' }, 4).ok).toBe(false);
  });
  it('rejects unauthorized membership mutations and stale versions', () => {
    expect(mutateMembership(aggregate, 'member', 'member', { kind: 'role', role: 'ADMIN' }, 4).ok).toBe(false);
    expect(mutateMembership(aggregate, 'owner', 'member', { kind: 'status', status: 'suspended' }, 3)).toEqual({ ok: false, error: 'CONFLICT' });
    const result = mutateMembership(aggregate, 'owner', 'member', { kind: 'status', status: 'revoked' }, 4);
    expect(result.ok).toBe(true);
    if (result.ok) expect(mutateMembership(result.value, 'owner', 'member', { kind: 'status', status: 'active' }, 5).ok).toBe(false);
  });
  it('prevents administrators from changing peers or elevating to ADMIN', () => {
    const admin = { ...aggregate, memberships: [...aggregate.memberships, { userId: 'admin', organizationId: 'a', role: 'ADMIN' as const, status: 'active' as const }] };
    expect(mutateMembership(admin, 'admin', 'member', { kind: 'role', role: 'ADMIN' }, 4).ok).toBe(false);
    expect(mutateMembership(admin, 'admin', 'admin', { kind: 'role', role: 'EMPLOYEE' }, 4).ok).toBe(false);
  });
  it('activates only with one owner and never reopens a closed organization', () => {
    expect(transitionOrganization({ ...aggregate, organization: { ...aggregate.organization, status: 'provisioning' }, memberships: [] }, 'active', 4).ok).toBe(false);
    expect(transitionOrganization({ ...aggregate, organization: { ...aggregate.organization, status: 'closed' } }, 'active', 4).ok).toBe(false);
    expect(transitionOrganization(aggregate, 'suspended', 4).ok).toBe(true);
  });
});
describe('invitation lifecycle', () => {
  it('accepts only the verified recipient and only once', () => {
    expect(transitionInvitation(invitation, 'accept', 100, 'other@example.test').ok).toBe(false);
    const result = transitionInvitation(invitation, 'accept', 100, 'RECIPIENT@example.test'); expect(result.ok).toBe(true);
    if (result.ok) expect(transitionInvitation(result.value, 'accept', 100, invitation.email).ok).toBe(false);
  });
  it('expires at the exact deadline and enforces terminal states', () => {
    expect(transitionInvitation(invitation, 'accept', 200, invitation.email)).toEqual({ ok: false, error: 'EXPIRED' });
    expect(transitionInvitation(invitation, 'expire', 199).ok).toBe(false);
    expect(transitionInvitation(invitation, 'expire', 200).ok).toBe(true);
    expect(transitionInvitation(invitation, 'revoke', 100).ok).toBe(true);
    for (const state of ['revoked', 'expired', 'accepted'] as const) expect(transitionInvitation({ ...invitation, state }, 'accept', 100, invitation.email).ok).toBe(false);
    expect(transitionInvitation({ ...invitation, role: 'OWNER' as Invitation['role'] }, 'accept', 100, invitation.email).ok).toBe(false);
  });
});
const expected: Record<Role, readonly Permission[]> = {
  OWNER: permissions, ADMIN: permissions,
  MANAGER: ['time.track', 'timesheet.submit', 'timesheet.approve', 'project.manage', 'client.manage', 'report.read'],
  EMPLOYEE: ['time.track', 'timesheet.submit'], CONTRACTOR: ['time.track', 'timesheet.submit'],
};
describe('central authorization', () => {
  it.each(roles.flatMap(role => permissions.map(permission => ({ role, permission }))))('$role / $permission', ({ role, permission }) => {
    const result = evaluateAuthorization(principal, aggregate.organization, { ...aggregate.memberships[1], role }, { ...request, permission }, 100);
    expect(result.ok).toBe(expected[role].includes(permission));
    expect(rolePermissions[role]).toEqual(expected[role]);
  });
  it('requires explicit manager delegation and rejects employee/contractor delegation', () => {
    for (const role of roles) expect(evaluateAuthorization(principal, aggregate.organization, { ...aggregate.memberships[1], role, monitoringDelegated: true }, { ...request, permission: 'monitoring.admin' }, 100).ok).toBe(['OWNER', 'ADMIN', 'MANAGER'].includes(role));
  });
  it('denies mismatched actor, tenant and target', () => {
    for (const change of [{ organizationId: 'b' }, { resourceOrganizationId: 'b' }]) expect(evaluateAuthorization(principal, aggregate.organization, aggregate.memberships[1], { ...request, ...change }, 100).ok).toBe(false);
    expect(evaluateAuthorization({ ...principal, userId: 'outsider' }, aggregate.organization, aggregate.memberships[1], request, 100).ok).toBe(false);
    expect(evaluateAuthorization(principal, aggregate.organization, { ...aggregate.memberships[1], organizationId: 'b' }, request, 100).ok).toBe(false);
  });
  it.each(['suspended', 'revoked', undefined] as const)('denies membership state %s', status => { expect(evaluateAuthorization(principal, aggregate.organization, { ...aggregate.memberships[1], status }, request, 100).ok).toBe(false); });
  it('fails closed for missing, unknown, expired, and malformed inputs', () => {
    expect(evaluateAuthorization(null, aggregate.organization, aggregate.memberships[1], request, 100).ok).toBe(false);
    expect(evaluateAuthorization(principal, null, null, request, 100).ok).toBe(false);
    expect(evaluateAuthorization(principal, aggregate.organization, aggregate.memberships[1], request, 200).ok).toBe(false);
    expect(evaluateAuthorization(principal, aggregate.organization, aggregate.memberships[1], { ...request, permission: 'unknown' as Permission }, 100).ok).toBe(false);
    expect(evaluateAuthorization(principal, aggregate.organization, { ...aggregate.memberships[1], role: 'unknown' as Role }, request, 100).ok).toBe(false);
    expect(evaluateAuthorization(principal, { ...aggregate.organization, status: 'suspended' }, aggregate.memberships[1], request, 100).ok).toBe(false);
    expect(evaluateAuthorization(principal, aggregate.organization, aggregate.memberships[1], request, NaN).ok).toBe(false);
  });
});
