/** Offline contract only. Caller assertions are not authoritative evidence.
 * No collector, SDK initialization, credentials, network or execution permission.
 * Existing authorization/TLS/collector gates remain independently mandatory.
 */
export interface BranchBindingEvidence {
  projectId: string;
  databaseId: string;
  branchId: string;
  productionBranchId: string;
  selectorBranchId: string;
  context: 'agent-runner' | 'deploy-preview';
  databaseResourceCount: number;
  observedAt: number;
  expiresAt: number;
  assignmentRevision: string;
  source: string;
  endpointBinding: {
    projectId: string; databaseId: string; branchId: string;
    assignmentRevision: string;
    authoritative: boolean;
    connectionMetadataAvailable: boolean;
    credentialsAvailable: boolean;
    sdkSupported: boolean;
    productionFallbackExcluded: boolean;
    immutableForExecution: boolean;
  } | null;
}
export interface ExpectedBranchTarget { projectId: string; databaseId: string; branchId: string }
const id = (s: unknown): s is string => typeof s === 'string' && /^[a-zA-Z0-9_.-]+$/.test(s);
/** Validates a synthetic/collected contract; success never authorizes database access. */
export function assertBranchBinding(expected: ExpectedBranchTarget, e: BranchBindingEvidence, now: number): void {
  const fail = (ok: unknown, code: string) => { if (!ok) throw new Error(code); };
  fail(expected && e && [expected.projectId, expected.databaseId, expected.branchId,
    e.projectId, e.databaseId, e.branchId, e.productionBranchId, e.selectorBranchId,
    e.assignmentRevision].every(id), 'BRANCH_METADATA_REQUIRED');
  fail(e.projectId === expected.projectId, 'BRANCH_PROJECT_MISMATCH');
  fail(e.databaseResourceCount === 1 && e.databaseId === expected.databaseId, 'AMBIGUOUS_DATABASE_RESOURCE');
  fail(e.branchId !== e.productionBranchId && e.branchId.toLowerCase() !== 'production' &&
    e.branchId === expected.branchId && e.selectorBranchId === e.branchId, 'NONPRODUCTION_BRANCH_REQUIRED');
  fail(['agent-runner', 'deploy-preview'].includes(e.context), 'BRANCH_CONTEXT_REQUIRED');
  fail(Number.isFinite(now) && Number.isFinite(e.observedAt) && e.observedAt <= now &&
    now - e.observedAt <= 5000 && Number.isFinite(e.expiresAt) && e.expiresAt > now &&
    e.expiresAt - e.observedAt <= 300000, 'STALE_BRANCH_ASSIGNMENT');
  fail(typeof e.source === 'string' && e.source.trim().length > 0, 'AUTHORITATIVE_SOURCE_REQUIRED');
  const b = e.endpointBinding;
  fail(b?.authoritative === true, 'AUTHORITATIVE_ENDPOINT_BINDING_REQUIRED');
  if (!b) throw new Error('AUTHORITATIVE_ENDPOINT_BINDING_REQUIRED');
  fail(b.projectId === e.projectId && b.databaseId === e.databaseId && b.branchId === e.branchId &&
    b.assignmentRevision === e.assignmentRevision, 'ENDPOINT_BINDING_MISMATCH');
  fail(b.sdkSupported === true, 'UNSUPPORTED_SDK_BINDING');
  fail(b.connectionMetadataAvailable === true && b.credentialsAvailable === true, 'CONNECTION_EVIDENCE_UNAVAILABLE');
  fail(b.productionFallbackExcluded === true, 'PRODUCTION_FALLBACK_NOT_EXCLUDED');
  fail(b.immutableForExecution === true, 'BRANCH_REPLACEMENT_NOT_EXCLUDED');
}
