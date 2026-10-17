/** Offline evidence contract. No SDK initialization, credential lookup, or SQL execution.
 * Evidence must come from reviewed authoritative collectors, never caller assertions.
 * No collector is implemented: managed execution remains blocked.
 */
export interface ManagedIdentity {
  projectId: string; databaseId: string; branchId: string; databaseName: string; hostname: string;
}
export interface ManagedApproval {
  identity: ManagedIdentity; label: string; expiresAt: number; evidenceAt: number;
  authorized: boolean; independentCredentials: boolean; freshResource: boolean;
  identityEvidence: string; teardownEvidence: string; teardownOwner: string;
  protectedIdentities: ManagedIdentity[];
}
export const bounds = Object.freeze({ connectionTimeoutMillis: 5000, statement_timeout: 5000,
  lock_timeout: 2000, idle_in_transaction_session_timeout: 10000, max: 2, overallMillis: 300000 });
const staging = '368baa52-efc2-4775-ba46-da764d51ec2b';
const protectedLabel = /(^|[-_])(prod|production|stage|staging)([-_]|$)/i;
function requireGate(ok: unknown, code: string): asserts ok { if (!ok) throw new Error(code); }
export function authorizeManaged(a: ManagedApproval, now: number): void {
  requireGate(a && Number.isFinite(now) && a.authorized === true && a.independentCredentials === true, 'TARGET_AUTHORIZATION');
  requireGate(/^hourvia_disposable_[a-z0-9_]{8,64}$/.test(a.label) && !protectedLabel.test(a.label), 'TARGET_LABEL');
  requireGate(Number.isFinite(a.expiresAt) && a.expiresAt > now && a.expiresAt - now <= bounds.overallMillis &&
    Number.isFinite(a.evidenceAt) && a.evidenceAt <= now && now - a.evidenceAt <= 60000, 'STALE_AUTHORIZATION');
  requireGate(a.identity && ['projectId','databaseId','branchId','databaseName','hostname'].every(k => typeof a.identity[k as keyof ManagedIdentity] === 'string' && /^[a-zA-Z0-9_.-]+$/.test(a.identity[k as keyof ManagedIdentity])), 'IDENTITY_REQUIRED');
  requireGate(a.identity.projectId !== staging && !protectedLabel.test(a.identity.projectId) && !protectedLabel.test(a.identity.databaseName) &&
    a.protectedIdentities.length > 0 && a.protectedIdentities.some(p => p.projectId === staging) &&
    !a.protectedIdentities.some(p => p.projectId === a.identity.projectId || p.databaseId === a.identity.databaseId || p.hostname === a.identity.hostname), 'PROTECTED_TARGET');
  requireGate(a.freshResource === true && a.identityEvidence.trim() && a.teardownEvidence.trim() && a.teardownOwner.trim(), 'PROVENANCE_OR_TEARDOWN_REQUIRED');
}
export interface ManagedObservation {
  identity: ManagedIdentity; observedAt: number; version: number;
  tls: { chainVerified: boolean; hostnameVerified: boolean; peerHostname: string };
  roles: { separateLogins: boolean; runtimeCannotElevate: boolean; runtimeRestricted: boolean;
    bootstrapCapabilities: boolean; migrationOwnership: boolean; globalRoleScopeApproved: boolean };
  freshness: { schemas: number; relations: number; types: number; routines: number;
    extraExtensions: number; hourviaRoles: number; migrations: number; otherSessions: number };
}
/** Must precede candidate application and fixtures; missing/partial evidence fails closed. */
export function verifyManaged(a: ManagedApproval, o: ManagedObservation, now: number): void {
  authorizeManaged(a, now);
  requireGate(o && o.identity && Object.keys(a.identity).every(k => a.identity[k as keyof ManagedIdentity] === o.identity[k as keyof ManagedIdentity]), 'IDENTITY_MISMATCH');
  requireGate(Number.isFinite(o.observedAt) && o.observedAt <= now && now - o.observedAt <= 5000 && Number.isInteger(o.version) && o.version >= 150000, 'STALE_OBSERVATION');
  requireGate(o.tls?.chainVerified === true && o.tls.hostnameVerified === true && o.tls.peerHostname === a.identity.hostname, 'TLS_VERIFICATION_REQUIRED');
  requireGate(o.roles && ['separateLogins','runtimeCannotElevate','runtimeRestricted','bootstrapCapabilities','migrationOwnership','globalRoleScopeApproved'].every(k => o.roles[k as keyof typeof o.roles] === true), 'PRIVILEGE_MISMATCH');
  requireGate(o.freshness && ['schemas','relations','types','routines','extraExtensions','hourviaRoles','migrations','otherSessions'].every(k => o.freshness[k as keyof typeof o.freshness] === 0), 'FRESHNESS_FAILED');
}
export function confirmTeardown(e: { poolsClosed: boolean; databaseDeleted: boolean; credentialsRevoked: boolean; rolesRemovedOrProviderConfirmed: boolean; evidence: string }): void {
  requireGate(e.poolsClosed === true && e.databaseDeleted === true && e.credentialsRevoked === true && e.rolesRemovedOrProviderConfirmed === true && e.evidence.trim(), 'TEARDOWN_UNCONFIRMED');
}
