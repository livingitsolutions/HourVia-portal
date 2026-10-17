import { expect, it } from 'vitest';
import { assertBranchBinding, type BranchBindingEvidence } from '../verification/branch-binding';
import { requireManagedCollectors } from '../verification/managed-harness';
const target = { projectId: 'synthetic-project', databaseId: 'synthetic-database', branchId: 'synthetic-preview' };
function fixture(): BranchBindingEvidence {
  return { ...target, productionBranchId: 'production', selectorBranchId: target.branchId,
    context: 'deploy-preview', databaseResourceCount: 1, observedAt: 10000, expiresAt: 15000,
    assignmentRevision: 'synthetic-revision', source: 'synthetic-offline-evidence',
    endpointBinding: { ...target, assignmentRevision: 'synthetic-revision', authoritative: true,
      connectionMetadataAvailable: true, credentialsAvailable: true, sdkSupported: true,
      productionFallbackExcluded: true, immutableForExecution: true } };
}
it('accepts a complete synthetic preview contract but keeps managed execution blocked', () => {
  expect(() => assertBranchBinding(target, fixture(), 10000)).not.toThrow();
  expect(() => requireManagedCollectors()).toThrow('MANAGED_EXECUTION_BLOCKED');
});
const failures: [string, (e: BranchBindingEvidence) => void][] = [
  ['production selected', e => { e.branchId = 'production'; }],
  ['missing metadata', e => { e.branchId = ''; }],
  ['wrong project', e => { e.projectId = 'other'; }],
  ['ambiguous resource', e => { e.databaseResourceCount = 2; }],
  ['wrong database', e => { e.databaseId = 'other'; }],
  ['stale assignment', e => { e.observedAt = 0; }],
  ['future observation', e => { e.observedAt = 10001; }],
  ['expired assignment', e => { e.expiresAt = 10000; }],
  ['missing endpoint binding', e => { e.endpointBinding = null; }],
  ['unauthoritative binding', e => { e.endpointBinding!.authoritative = false; }],
  ['unsupported SDK', e => { e.endpointBinding!.sdkSupported = false; }],
  ['credentials unavailable', e => { e.endpointBinding!.credentialsAvailable = false; }],
  ['connection metadata unavailable', e => { e.endpointBinding!.connectionMetadataAvailable = false; }],
  ['production fallback', e => { e.endpointBinding!.productionFallbackExcluded = false; }],
  ['silent replacement', e => { e.endpointBinding!.immutableForExecution = false; }],
  ['revision changed', e => { e.endpointBinding!.assignmentRevision = 'replacement'; }],
  ['endpoint targets production', e => { e.endpointBinding!.branchId = 'production'; }],
  ['endpoint wrong project', e => { e.endpointBinding!.projectId = 'other'; }],
  ['endpoint wrong resource', e => { e.endpointBinding!.databaseId = 'other'; }],
  ['selector mismatch', e => { e.selectorBranchId = 'other'; }],
  ['missing source', e => { e.source = ''; }],
];
it.each(failures)('fails closed: %s', (_name, change) => {
  const evidence = fixture(); change(evidence);
  expect(() => assertBranchBinding(target, evidence, 10000)).toThrow();
});
