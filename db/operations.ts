/** Implementation obligations for future reviewed command adapters; no live composition. */
export const protocols = {
  provision: ['verify identity and lock live user/session', 'reserve creator-scoped key before allocating tenant UUID', 'insert provisioning organization', 'insert active OWNER', 'activate organization', 'append audit and complete result', 'acknowledge COMMIT'],
  transfer: ['lock organization', 'lock live user/session and recheck active OWNER', 'compare aggregate version', 'verify different active same-tenant target', 'demote OWNER to ADMIN before promotion', 'promote target and clear delegation', 'increment aggregate and row versions', 'append audit and complete result', 'acknowledge COMMIT'],
  membership: ['lock organization', 'lock live user/session and recheck actor permission', 'compare aggregate version', 'reject OWNER target/assignment and ADMIN peer/elevation', 'reject revoked target; clear delegation', 'increment aggregate and row versions', 'append audit and complete result', 'acknowledge COMMIT'],
  accept: ['resolve identity, verified email and credential digest through narrow bootstrap service', 'lock organization then live user/session then invitation', 'require active organization, pending/unexpired invitation and matching verified recipient/digest', 'compare invitation and aggregate versions', 'reject any existing membership including revoked', 'insert active non-owner membership', 'consume invitation exactly once', 'increment aggregate version', 'append audit and complete result', 'acknowledge COMMIT'],
} as const;
export interface AdapterActivationGate {
  readonly disposableIntegrationPassed: boolean;
  readonly restrictedRuntimeCredentialsVerified: boolean;
  readonly bootstrapRoutinesReviewed: boolean;
  readonly providerVerificationReviewed: boolean;
}
// Deliberately no adapter factory or connection initialization in Sprint 2.
