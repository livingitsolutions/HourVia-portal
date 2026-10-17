/** No database code or automatic execution. Every required case needs a reviewed implementation. */
export const securityCases = ['cross_tenant_select','cross_tenant_insert','cross_tenant_update','cross_tenant_delete',
  'force_rls','restricted_runtime','missing_context','forged_context','atomic_provisioning','exactly_one_owner',
  'concurrent_transfer','concurrent_revocation','invitation_expiry','invitation_replay','audit_append_only',
  'idempotency_replay','payload_mismatch','transaction_rollback','commit_rollback_tag','uncertain_commit',
  'session_cleanup'] as const;
export type SecurityCase = typeof securityCases[number];
export async function verifySecurityMatrix(deps: {
  setup(): Promise<void>; cleanup(): Promise<void>;
  cases: Partial<Record<SecurityCase, (assertion: (condition: boolean) => void) => Promise<void>>>;
}): Promise<void> {
  // Missing cases cannot produce a partial passing run, even before setup.
  if (securityCases.some(name => typeof deps.cases[name] !== 'function')) throw new Error('INCOMPLETE_SECURITY_MATRIX');
  try {
    await deps.setup();
    for (const name of securityCases) {
      let assertions = 0; let failed = false;
      await deps.cases[name]!(condition => { if (condition !== true) { failed = true; throw new Error('SECURITY_ASSERTION_FAILED'); } assertions++; });
      if (failed) throw new Error('SECURITY_ASSERTION_FAILED');
      if (assertions === 0) throw new Error('SECURITY_ASSERTIONS_SKIPPED');
    }
  } finally { await deps.cleanup(); }
}
