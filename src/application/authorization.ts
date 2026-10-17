import { evaluateAuthorization, type Permission } from '../domain/authorization';
import { failure, type Result } from '../domain/result';
import type { PrincipalResolver } from './identity';
import type { OrganizationQueries } from './organization';
/** Future server handlers must use this boundary and recheck mutations inside a transaction. */
export function createAuthorizationEvaluator(deps: { principals: PrincipalResolver; organizations: OrganizationQueries; now: () => number }) {
  return async (credential: unknown, input: { organizationId: string; resourceOrganizationId: string; permission: Permission }): Promise<Result<true>> => {
    try {
      const principal = await deps.principals.resolve(credential);
      if (!principal.ok) return principal;
      const aggregate = await deps.organizations.load({ actorId: principal.value.userId, organizationId: input.organizationId });
      const membership = aggregate?.memberships.find(m => m.userId === principal.value.userId) ?? null;
      return evaluateAuthorization(principal.value, aggregate?.organization ?? null, membership, input, deps.now());
    } catch { return failure('UNAVAILABLE'); }
  };
}
