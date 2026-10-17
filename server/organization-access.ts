import { createOrganizationEngine } from '../src/application/organization-engine';
import type { WorkflowDependencies } from '../src/application/organization';

/** Trusted server composition only. Identity stays global; tenant selection conveys no lasting
 * authority. Each engine call resolves the session and reloads membership. No writes exposed. */
export function createSessionOrganizationAccess(dependencies: WorkflowDependencies, opaqueCookie: unknown) {
  const engine = createOrganizationEngine(dependencies, opaqueCookie);
  return {
    list: engine.getCurrentUserOrganizations,
    select: engine.selectOrganization,
    authorize: engine.evaluateAuthorization,
  };
}
