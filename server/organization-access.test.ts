import { expect, it } from 'vitest';
import { createSessionOrganizationAccess } from './organization-access';
import type { WorkflowDependencies } from '../src/application/organization';
import type { OrganizationAggregate } from '../src/domain/organization';
import { success, failure } from '../src/domain/result';
it('revalidates global session and tenant membership after selection and revocation', async () => {
  let revoked = false; let expired = false;
  const aggregate: OrganizationAggregate = { version: 0, organization: { id: 'tenant', name: 'Tenant', status: 'active' }, memberships: [{ userId: 'global-user', organizationId: 'tenant', role: 'OWNER', status: 'active' }] };
  const blocked = async (): Promise<never> => { throw new Error('No mutation permitted'); };
  const dependencies: WorkflowDependencies = {
    principals: { resolve: async credential => credential !== 'opaque-cookie' ? failure('UNAUTHENTICATED') : expired ? failure('EXPIRED') : success({ userId: 'global-user', sessionId: 'session', expiresAt: 10000 }) },
    queries: { listForUser: async () => [aggregate.organization], load: async context => context.organizationId !== 'tenant' ? null : { ...aggregate, memberships: aggregate.memberships.map(m => ({ ...m, status: revoked ? 'revoked' : m.status })) } },
    clock: { now: () => 1000 }, ids: { next: () => 'unused' }, transactions: { run: blocked },
    invitationLocator: { locate: blocked },
    invitations: { verify: blocked, verifiedEmail: blocked },
  };
  const access = createSessionOrganizationAccess(dependencies, 'opaque-cookie');
  expect((await access.select({ organizationId: 'tenant' })).ok).toBe(true);
  expect((await access.select({ organizationId: 'other-tenant' })).ok).toBe(false);
  expect((await access.authorize({ organizationId: 'tenant', resourceOrganizationId: 'other-tenant', permission: 'report.read' })).ok).toBe(false);
  revoked = true; expect((await access.select({ organizationId: 'tenant' })).ok).toBe(false);
  expect((await access.authorize({ organizationId: 'tenant', resourceOrganizationId: 'tenant', permission: 'report.read' })).ok).toBe(false);
  revoked = false; expired = true; expect(await access.list()).toEqual(failure('EXPIRED'));
  expect((await createSessionOrganizationAccess(dependencies, { userId: 'global-user', role: 'OWNER' }).list()).ok).toBe(false);
});
