/** Managed-target counterpart to the unchanged loopback runner.
 * Deliberately has no connect/apply entry point until authoritative Netlify identity,
 * role capability, TLS observation, freshness and teardown collectors are reviewed.
 */
import { authorizeManaged, type ManagedApproval } from './managed-gate';
import { verifiedPoolOptions } from './tls-policy';
export function prepareManagedConnection(approval: ManagedApproval, explicitTarget: string, now: number) {
  authorizeManaged(approval, now);
  const options = verifiedPoolOptions(explicitTarget, approval.identity.hostname);
  const url = new URL(explicitTarget);
  if (url.pathname !== '/' + approval.identity.databaseName || (url.port && url.port !== '5432')) throw new Error('DATABASE_IDENTITY_MISMATCH');
  return options;
}
export function requireManagedCollectors(): never {
  throw new Error('MANAGED_EXECUTION_BLOCKED_AUTHORITATIVE_COLLECTORS_UNVERIFIED');
}
