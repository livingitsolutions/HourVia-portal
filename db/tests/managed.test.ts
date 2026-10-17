import { expect, it } from 'vitest';
import { authorizeManaged, verifyManaged, confirmTeardown, type ManagedApproval, type ManagedObservation } from '../verification/managed-gate';
import { verifiedPoolOptions } from '../verification/tls-policy';
import { securityCases, verifySecurityMatrix, type SecurityCase } from '../verification/security-matrix';
const identity = { projectId: 'verify-001', databaseId: 'db-001', branchId: 'branch-001', databaseName: 'verify', hostname: 'verify.example.invalid' };
const approval: ManagedApproval = { identity, label: 'hourvia_disposable_offline001', expiresAt: 2000, evidenceAt: 1000, authorized: true, independentCredentials: true, freshResource: true, identityEvidence: 'offline-fixture', teardownEvidence: 'offline-fixture', teardownOwner: 'operator', protectedIdentities: [{ ...identity, projectId: '368baa52-efc2-4775-ba46-da764d51ec2b', databaseId: 'protected', hostname: 'protected.example.invalid' }] };
const observation: ManagedObservation = { identity, observedAt: 1000, version: 150000, tls: { chainVerified: true, hostnameVerified: true, peerHostname: identity.hostname }, roles: { separateLogins: true, runtimeCannotElevate: true, runtimeRestricted: true, bootstrapCapabilities: true, migrationOwnership: true, globalRoleScopeApproved: true }, freshness: { schemas: 0, relations: 0, types: 0, routines: 0, extraExtensions: 0, hourviaRoles: 0, migrations: 0, otherSessions: 0 } };
it('accepts complete synthetic evidence without acquiring a connection', () => expect(() => verifyManaged(approval, observation, 1000)).not.toThrow());
it.each(['authorized','independentCredentials','freshResource'] as const)('rejects missing authorization/provenance %s', key => expect(() => authorizeManaged({ ...approval, [key]: false }, 1000)).toThrow());
it.each(['projectId','databaseId','branchId','databaseName','hostname'] as const)('rejects identity mismatch %s', key => expect(() => verifyManaged(approval, { ...observation, identity: { ...identity, [key]: 'wrong' } }, 1000)).toThrow('IDENTITY_MISMATCH'));
it('rejects protected project, expired evidence, and missing cleanup', () => {
  expect(() => authorizeManaged({ ...approval, identity: approval.protectedIdentities[0] }, 1000)).toThrow();
  expect(() => authorizeManaged(approval, 2000)).toThrow();
  expect(() => authorizeManaged({ ...approval, teardownEvidence: '' }, 1000)).toThrow();
  expect(() => confirmTeardown({ poolsClosed: true, databaseDeleted: false, credentialsRevoked: true, rolesRemovedOrProviderConfirmed: true, evidence: 'fixture' })).toThrow();
});
it.each(['chainVerified','hostnameVerified'] as const)('rejects missing TLS %s', key => expect(() => verifyManaged(approval, { ...observation, tls: { ...observation.tls, [key]: false } }, 1000)).toThrow());
it.each(Object.keys(observation.roles) as (keyof ManagedObservation['roles'])[])('rejects privilege mismatch %s', key => expect(() => verifyManaged(approval, { ...observation, roles: { ...observation.roles, [key]: false } }, 1000)).toThrow());
it.each(Object.keys(observation.freshness) as (keyof ManagedObservation['freshness'])[])('rejects nonfresh %s', key => expect(() => verifyManaged(approval, { ...observation, freshness: { ...observation.freshness, [key]: 1 } }, 1000)).toThrow());
it('constructs verified TLS and rejects URL overrides', () => {
  const url = 'postgresql://fixture:fixture@verify.example.invalid/verify';
  const options = verifiedPoolOptions(url, identity.hostname);
  expect(options.ssl.rejectUnauthorized).toBe(true); expect(options.ssl.servername).toBe(identity.hostname);
  for (const suffix of ['?sslmode=no-verify','?host=other.invalid','#fragment']) expect(() => verifiedPoolOptions(url + suffix, identity.hostname)).toThrow();
});
const cases = Object.fromEntries(securityCases.map(key => [key, async (assert: (ok: boolean) => void) => assert(true)])) as Record<SecurityCase, (assert: (ok: boolean) => void) => Promise<void>>;
it('fails on missing cases, failed fixtures, skipped assertions and failed cleanup', async () => {
  const base = { cases, setup: async () => {}, cleanup: async () => {} };
  await expect(verifySecurityMatrix({ ...base, cases: {} })).rejects.toThrow('INCOMPLETE');
  await expect(verifySecurityMatrix({ ...base, setup: async () => { throw new Error('fixture'); } })).rejects.toThrow('fixture');
  await expect(verifySecurityMatrix({ ...base, cases: { ...cases, force_rls: async () => {} } })).rejects.toThrow('SKIPPED');
  await expect(verifySecurityMatrix({ ...base, cleanup: async () => { throw new Error('cleanup'); } })).rejects.toThrow('cleanup');
});

it('requires exact physical database mapping before any connection', async () => {
  const { prepareManagedConnection, requireManagedCollectors } = await import('../verification/managed-harness');
  expect(() => prepareManagedConnection(approval, 'postgresql://fixture:fixture@verify.example.invalid/wrong', 1000)).toThrow('DATABASE_IDENTITY');
  expect(() => prepareManagedConnection(approval, 'postgresql://fixture:fixture@verify.example.invalid/verify', 1000)).not.toThrow();
  expect(() => requireManagedCollectors()).toThrow('MANAGED_EXECUTION_BLOCKED');
});
it('rejects stale database observation and incomplete privilege evidence', () => {
  expect(() => verifyManaged(approval, { ...observation, observedAt: 1001 }, 1000)).toThrow();
  expect(() => verifyManaged(approval, { ...observation, roles: {} as ManagedObservation['roles'] }, 1000)).toThrow();
});
it('does not accept a swallowed failing security assertion', async () => {
  await expect(verifySecurityMatrix({ setup: async () => {}, cleanup: async () => {}, cases: { ...cases, force_rls: async assert => {
    assert(true); try { assert(false); } catch { /* simulate a faulty probe */ }
  } } })).rejects.toThrow('SECURITY_ASSERTION_FAILED');
});
