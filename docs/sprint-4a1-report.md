# Sprint 4A.1 — Restricted persistence architecture

2026-10-17. Offline source candidates only; live activation remains **NO-GO**.

## Baseline and scope

The public GitHub main API returned `0016b6d65a99be7500a4fde3cf7945088478de47`, merge #12 containing Sprint 3C. Local history contains this merge plus runner commit `987a525` with the prior Sprint 4A report. Reviewed that report, both supplied attempt histories, existing schema/role/RLS candidates, application/domain contracts, installed SDK declarations, transaction wrapper and Sprint 2.2B/2.2E gates. Existing candidates and invariants were preserved. No live database prerequisite was treated as satisfied.

## Exact changed files

- `db/quarantine/003_restricted_commands.sql`
- `db/candidates/repositories.ts`
- `db/candidates/delivery.ts`
- `db/tests/repositories.test.ts`
- `docs/sprint-4a1-report.md`
- `.netlify/results.md`

## Restricted command candidate

The new quarantined SQL proposes a dedicated NOLOGIN, non-superuser, non-BYPASSRLS command owner. No runtime table mutation privileges are added. Only two fixed-signature functions receive runtime EXECUTE: a closed command dispatcher and a receipt lookup. Function bodies use fixed `pg_catalog` search paths and fully qualified application objects, with no dynamic SQL. PUBLIC execution is revoked. Temporary installation CREATE privilege for ownership transfer is revoked inside the installation transaction. Runtime logins must never inherit command/migration roles.

The command owner receives only the table access needed by these bodies and dedicated FORCE-RLS-compatible policies. Those policies are deliberately privileged and apply only to the isolated owner role. Function ownership, role memberships, schema ownership and effective grants require live catalog verification; this is not a security certification.

Commands implement provisioning, profile updates, member role changes, membership revocation, invitation issuance/acceptance/revocation, and ownership transfer. Actor/session/tenant come from server transaction-local context, validated against live users/sessions and membership; no payload actor or role confers authority. Only trusted server code may possess runtime credentials. Custom GUCs are not authentication against a compromised runtime credential holder; provider/session verification and credential isolation remain mandatory.

Tenant row locks serialize mutations. Live user/session rows are rechecked and share-locked, role/target restrictions prevent ADMIN escalation, and ownership transfer demotes before promotion. The owner count is checked explicitly and the earlier deferred invariant remains intact. Errors propagate to the existing wrapper for explicit ROLLBACK; no swallowed SQL exception produces a success receipt.

Claims, business mutations, audit rows and delivery insertion share one transaction. Keys/digests retain the existing constrained formats. Profile maps to the membership category, with the action and expected version included in the canonical digest. Void ambiguity is avoided by returning an object receipt. Creator claims retain null organization scope; provisioning retries must use the same server-selected tenant UUID. The adapter hashes inputs with the existing SHA-256 canonical helper. The SQL trusts this server-generated digest; it does not independently hash JSON using an uninstalled extension.

## Invitation delivery and schema compatibility

A separate quarantined delivery relation records tenant/invitation identity, stable unique delivery key, unique invitation queue entry, delivery state, bounded attempts, lease/retry metadata, safe error category, provider reference and version. Business invitation state stays separate. Acceptance/revocation cancels outstanding queued delivery. No raw invitation token, message body or credential is stored in audit or queue.

The delivery TypeScript ports describe future atomic leasing, expected-version completion and stable provider idempotency. No worker, provider, credential exchange or email is implemented or activated. A reviewed secure token exchange remains necessary before actual delivery; the queue is intentionally not a complete mail sender.

The candidate makes the existing idempotency actor/membership foreign key deferrable so acceptance can reserve its durable claim before installing membership. Accepted membership is inserted before the invitation is consumed, preserving the immediate invitation foreign key. A unique tenant/correlation audit index supports unambiguous receipt verification. These are explicit proposed schema changes, outside active migrations; existing schema metadata and old quarantined files are unchanged. Future adoption must reconcile Drizzle metadata and migration ordering in a separately authorized migration review. Nothing assumes the candidate is installed today.

## Adapter compatibility and boundaries

The connection bridge uses the installed `@netlify/database` 2.0.1 `DatabaseConnection` type and documented pool.connect/query/release interfaces. It accepts an already-created explicit database instance, performs no SDK initialization or environment lookup, and creates no ambient or production fallback. No Drizzle interface was invented; existing Drizzle schema remains the baseline, while these commands use supported parameterized PostgreSQL queries on a pinned client.

Offline repositories provide tenant organization reads, membership listing, administrative invitation reads, restricted command execution, explicit reconciliation and transactional audit/claim receipt verification. Reads authorize on the pinned transaction and include tenant predicates; decoded rows are checked against the bound tenant. Neither invitation digest nor raw credentials are returned by administrative reads.

These are command-level ports, not a claimed implementation of the older broad WorkflowTransaction aggregate-save contract. No application engine wiring or cross-tenant invitation locator was silently introduced. The command-level port resolves the acceptance sequencing problem explicitly. A future engine integration must replace aggregate write orchestration with these commands under review. Lifecycle transitions, global organization discovery, token issuance/lookup and provider identity bootstrap remain outside this adapter. Existing application contracts are unchanged.

The candidates are outside browser source, and the existing architecture guard rejects database imports from browser and runtime composition. The live factory unconditionally throws. No Functions endpoint imports the adapter, and no new environment toggle enables it.

## Transaction and failure handling

Repositories reuse `runCandidate` and `runTransaction`, including same-client context, bounded statement/lock/idle timeouts, callback expiry, tracked query failures, positive COMMIT acknowledgment, rejection of returned ROLLBACK, bounded serialization/deadlock retries and disposal after uncertain outcomes. No external delivery effect occurs inside retries.

Command execution checks a matching durable receipt/audit on the pinned connection before COMMIT. Receipt lookup matches current active membership, actor, tenant, input digest, operation/key, target, correlation and aggregate version. Reconciliation is a separate fresh transaction; absence is unresolved, never proof of rollback. An uncertain original COMMIT is never automatically retried. The adapter returns transaction outcomes rather than collapsing commit uncertainty into ordinary success.

## Offline tests and results

Added 13 tests covering missing context and hard-disabled live construction, tenant predicates/foreign row rejection, revoked-role read denial, administrative invitation access, hostile parameter binding, command rejection, audit/claim verification rollback, returned ROLLBACK, uncertain COMMIT disposal/no retry, fresh receipt reconciliation and simulated replay. SQL source checks cover role isolation, direct-write denial, function grants/search paths, tenant locking, owner count/demotion ordering, delivery uniqueness and atomic audit/claim statements.

All checks passed: `npm run typecheck`, `npm run lint`, `npm test` (325 tests across 20 files), `npm run check:architecture`, `npm run check:secrets`, and `git diff --check`. Secret scanning covers supported patterns only.

These tests simulate driver replies or inspect SQL text. They do not parse/install functions or prove SQL privileges, owner invariants, queue deduplication, concurrent execution, RLS or PostgreSQL atomicity. Existing application fake concurrency/revocation/invitation tests and transaction failure tests also passed. No PostgreSQL integration, SQL execution or browser E2E occurred. No manual build command ran because the runner prohibits it.

## Remaining blockers and delivery status

Sprint 2.2E authoritative resource/branch binding, production exclusion, immutable execution identity, TLS, restricted credential verification and managed collectors remain unresolved and unchanged. Live function installation/compilation, privilege catalog assertions, RLS tests, concurrent ownership/revocation/acceptance races, rollback/durable replay and connection disposal require separately authorized disposable PostgreSQL verification. The new definer role must be verified to have no login/inheriting runtime members and no function/schema replacement privilege.

Review schema adoption and Drizzle consistency, secure invitation credential issuance/exchange, worker privileges and lease implementation, engine command-port integration, provider/session bootstrap and abuse controls before proposing activation. No databases were provisioned/deleted, migrations generated/applied, production schema changed, workflows modified, authentication or business endpoints activated, or monitoring/payroll/payments added.

Managed Agent Runner owns commit/review/deployment handling. No direct commit, review creation, merge or manual deployment occurred; a resulting URL/status is unavailable in this session. The source is ready for architecture review, not live persistence deployment. Work stops at Sprint 4A.1.
