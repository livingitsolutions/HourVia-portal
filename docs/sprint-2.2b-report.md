# Sprint 2.2B — Netlify Database compatibility hardening

2026-10-17. **GO for review of offline preparation; NO-GO for managed execution or production activation.** No database was provisioned, connected to, queried, migrated, or otherwise changed. PostgreSQL integration tests: **NOT RUN**. This sprint does not establish live security enforcement or production readiness.

## Baseline and scope

The public GitHub branch API (`https://api.github.com/repos/livingitsolutions/Hourvia-V3/branches/main`) returned `dadb69ca9e892960e4b1902b299e05e866fa9c3d`, matching local HEAD and the supplied deployed baseline. Its merge title identifies Sprint 2.2A, merge #5. The initial working tree was clean. `git ls-remote` is disabled by the runner; the public HTTPS branch response supplied current-main evidence instead. No PAT was used.

Reviewed the Sprint 2.2A preflight, existing loopback harness and gates, transaction/idempotency protocols, schema and quarantined role/generated/invariant SQL, installed SDK/ORM sources and declarations, architecture checks and package interfaces. No historical V1/V2 source was imported. Application/UI behavior, existing tests, SQL candidates, dependencies and runtime composition were preserved.

## Files created or modified

- `db/verification/managed-gate.ts`: pure approval, identity, capability, freshness and teardown evidence gates, plus fixed resource bounds.
- `db/verification/tls-policy.ts`: explicit-target TLS/pool configuration builder with no connection acquisition.
- `db/verification/managed-harness.ts`: managed connection preparation and explicit execution blocker.
- `db/verification/security-matrix.ts`: complete required-case contract and assertion-accounting coordinator.
- `db/verification/transaction-candidate.ts`: quarantined injected-client transaction candidate and reconciliation contract.
- `db/tests/managed.test.ts`, `db/tests/candidate.test.ts`: offline failure and transaction regression tests.
- `db/tests/disposable.integration.mjs`: explanatory comment directing managed targets to separate preparation; execution behavior unchanged.
- `docs/sprint-2.2b-report.md` and `.netlify/results.md`: technical report and delivery summary.

## Harness architecture and security gates

The old loopback runner retains every authorization, isolated-cluster, superuser and physical-name gate. It is **not** the managed runner and cannot accept remote endpoints. The new managed preparation modules neither import/instantiate the SDK nor read connection environment defaults. There is no managed migration executor. `requireManagedCollectors()` unconditionally blocks managed execution while authoritative collectors remain unverified. This is an intentional unresolved platform boundary, not an executable remote harness or a relaxed local gate.

Approval requires a disposable label, explicit authorization, independent credentials, new-resource provenance, an exact project/database/branch/physical-name/hostname tuple, named teardown owner and supported cleanup evidence. Authorization expires within five minutes and provenance evidence must be at most one minute old. Protected inventory must include the known application-staging project. Exact protected project, database or hostname matches are rejected. A provider branch called `production` is not automatically rejected when its distinct project/database identity is approved; production/staging labels for the external target and physical database are rejected. Operators must supply the complete protected inventory; this module cannot discover it offline.

Connection preparation requires an explicit PostgreSQL URL, exact approved physical database path/hostname and default PostgreSQL port. All query options and fragments are rejected, including SSL overrides or alternate hosts. Remote TLS uses Node's certificate-chain verification, SNI and default `checkServerIdentity`; global certificate-verification bypass is rejected. URLs/configuration are credential-bearing and must never be serialized. No secret values, driver error objects or connection strings are logged. The TLS builder is for standard server-side `pg`, not Neon WebSocket or HTTP transport. Private/custom CA support remains unverified; there is no insecure fallback.

After a future authorized connection, separate authoritative observations must match all identity fields, PostgreSQL 15+ and five-second observation freshness. They must establish chain/hostname verification, separate logins, no runtime elevation, restricted runtime, sufficient non-superuser bootstrap capabilities, migration ownership and approved global-role scope. There is no superuser or SESSION AUTHORIZATION requirement in the managed contract. Privilege assertions describe capabilities to collect, not capabilities proven here. Empty/missing evidence cannot pass.

Strict freshness requires zero unexpected schemas, relations, types, routines, extensions beyond the reviewed baseline, Hourvia roles, migration state and other sessions. No automatic managed-object exemptions exist. Provider metadata that violates this policy blocks execution pending an explicit reviewed allowlist. Platform provenance is also required: catalog emptiness cannot establish a new resource or prove identity. PostgreSQL database name alone cannot identify a Netlify resource.

Prepared pool bounds are two clients, five-second acquisition, five-second statement, two-second lock and ten-second idle-in-transaction timeouts; the policy declares a five-minute overall limit. The adapter also sets transaction-local SQL timeouts. **Overall cancellation, effective server settings, TLS observations and pool limits still require a reviewed live collector/runner**; a constant does not enforce a wall-clock deadline. Approval is revalidated by each observation check. No migrations or security assertions may execute before all these guarantees are established.

Cleanup evidence requires closed pools, confirmed database deletion, credential revocation and role removal or provider-confirmed cleanup. Project deletion is not assumed to prove database deletion. Incomplete cleanup fails. This is a confirmation contract, not a provision/delete API or proof that a supported provider teardown route exists.

## Transaction adapter design

The new candidate composes the unchanged transaction protocol through an injected, already pinned client exposing the installed pg-compatible `query` and `release(discard)` methods. It never obtains ambient credentials or creates a pool. The operator must supply clients acquired through approved, bounded pool configuration. Every attempt uses one connection and explicitly begins at SERIALIZABLE isolation; the existing validated maximum is three attempts for SQLSTATE 40001/40P01 after acknowledged rollback. A new pool acquisition occurs per attempt. Alternate isolation levels are intentionally not selectable.

The candidate snapshots/validates the actor/session/tenant context and immutable idempotency claim, rejects actor/tenant mismatch before acquisition, and adds transaction-local operation and timeout settings to the original local identity/UTC settings. `DISCARD ALL` sanitizes acquired and completed sessions, including session authorization, role and settings. Managed acceptance of this command remains unverified; failure before work discards and refuses execution. Failure sanitizing a positively acknowledged completion discards the client while retaining the acknowledged outcome. Uncertain or failed rollback clients are discarded. The raw release method is not exposed to work.

Work receives only a scoped query facade. Its lifetime ends on callback completion or exception, before COMMIT. Retained callbacks reject with `EXPIRED_TRANSACTION_SCOPE`, including after retries. Pending issued queries are drained; even a swallowed query rejection prevents COMMIT. Callbacks are trusted server code, must await queries, perform authorization on every attempt, and must not issue their own transaction/session control statements or external side effects. This is not a SQL sandbox or business-command implementation. A raw driver connection is never returned to application composition.

Only an exact COMMIT command tag reports normal success. A returned ROLLBACK is `rolled_back`, never successful completion. Unexpected tags or nonretryable COMMIT transport errors yield `commit_unknown`, discard and never trigger blind retry or a purportedly conclusive subsequent rollback. Serialization/deadlock aborts remain distinguishable and retry only after acknowledged rollback.

An optional injected durable reconciliation lookup runs after uncertain-client release. Success requires a completed authoritative record matching **all** immutable claim fields: actor, organization/scope, operation, key and payload digest. Mismatch, absence, pending, lookup failure or no lookup leaves `commit_unknown`. There is no unknown-outcome retry at all; no absent-row inference. The lookup must independently authenticate and use a fresh trusted connection. No durable lookup implementation or durable outcome writer is supplied, and mocks cannot prove durability. A future implementation must atomically persist the matching completed result with the business mutation and resolve original in-flight transactions before considering any safe retry. No production-readiness claim is made.

## Security integration matrix

All 21 required cases are enumerated in `security-matrix.ts`: cross-tenant SELECT/INSERT/UPDATE/DELETE, FORCE RLS, restricted runtime, missing/forged context, atomic provisioning, exactly one owner, concurrent transfer/revocation, invitation expiry/replay, append-only audit, idempotency replay/payload mismatch, rollback, COMMIT returning ROLLBACK, uncertain COMMIT, session cleanup.

The coordinator rejects incomplete case implementations before fixture setup. Setup exceptions fail the run; cleanup executes even after failed setup. Every case must complete at least one explicit assertion, failing assertions remain failures even if a faulty probe catches the assertion exception, and cleanup errors reject completion. It never publishes a partial pass. It does not prove that a supplied assertion is meaningful: concrete managed probes still require review.

The existing manual runner contains fixture-backed SQL/concurrency cases, including owner and membership locking, invitation lifecycle and idempotency assertions; these remain local-only. Those cases have **not** been repurposed to impersonate a managed runtime with SET ROLE. Independent restricted managed logins, lost-COMMIT fault injection, durable replay and observed session reuse remain blocked pending reviewed collectors/implementations. The matrix contract prepares required coverage; it does not claim those managed tests exist or ran.

## Netlify Database compatibility matrix

VERIFIED means official documentation and/or installed implementation evidence, never live PostgreSQL evidence. UNSUPPORTED describes the inspected interface for the required guarantee. UNVERIFIED means managed-target evidence is missing.

Inspected versions: `@netlify/database` 2.0.1; Drizzle ORM/Kit 1.0.0-beta.22; pg 8.23.1; Neon serverless 1.2.0. No installation or dependency change occurred.

| Capability | Classification | Evidence, limitation and supported alternative |
| --- | --- | --- |
| Explicit connection acquisition | VERIFIED | SDK declarations/source and official API expose `getDatabase({ connectionString })` and `pool.connect()`. No getter or constructor invoked. |
| Single-client transaction pinning | VERIFIED | Documented BEGIN/work/COMMIT on one acquired pool client. All candidate statements use the injected client. Managed backend behavior untested. |
| Explicit SQL transactions | VERIFIED | Pool query interface and official example. Serializable conflicts and timeout acceptance on Netlify remain UNVERIFIED. |
| Client pooling | VERIFIED | Installed server path creates pg.Pool; serverless creates NeonPool. URL override alone does not select transport. |
| Backend pooling mode/direct endpoint | UNVERIFIED | No verified session-affinity/reset or direct-host contract. Never derive alternate endpoints. |
| Transaction-local settings | UNVERIFIED | Parameterized `set_config(...,true)` is prepared; managed acceptance and reuse cleanup need live evidence. |
| TLS through SDK options | UNSUPPORTED | Installed `getDatabase` options expose connectionString, not explicit SSL configuration. Official tooling supports an independently configured pg client; the new pure builder targets that interface. |
| Remote certificate/hostname enforcement | UNVERIFIED | Secure pg configuration prepared; effective target chain, hostname, pool behavior and negative-certificate probes not executed. |
| Drizzle integration | VERIFIED | Native beta adapter exists and official tooling documents it. |
| Drizzle transaction COMMIT acknowledgment | UNSUPPORTED | Inspected Netlify/node-postgres session wrappers await COMMIT but discard its result. Use raw pinned pg-compatible client under one lifecycle owner. |
| Raw command metadata / destructive release | VERIFIED | Installed pg query results retain command and pool clients support release with destruction. Candidate preserves command tags. Live durability remains unproven. |
| Separate restricted login roles and role scope | UNVERIFIED | Creation rights, independent issuance, inherited grants and cluster-wide cleanup not established. No superuser workaround. |
| Migration discovery/execution | VERIFIED | Official migrations documentation supports ordered files/subdirectories and platform application. Quarantined candidates stay outside discovery. Migration principal/ownership compatibility remains UNVERIFIED. |
| Exact authoritative resource identity | UNVERIFIED | Standard SQL identity cannot establish the project/database/branch tuple; reviewed platform-to-endpoint evidence collector is absent. |
| Lost COMMIT reconciliation | UNVERIFIED | Matching durable lookup contract exists; no durable implementation or fault injection evidence. |
| Full teardown and credential revocation | UNVERIFIED | No complete supported database/role/credential deletion verification established. Creation/execution remains blocked. |

Official API, tooling and migrations pages were retrieved over HTTPS as reference data on 2026-10-17:

- https://docs.netlify.com/build/data-and-storage/netlify-database/api/
- https://docs.netlify.com/build/data-and-storage/netlify-database/tooling/
- https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/

Installed evidence: `@netlify/database/dist/main.js` and `main.d.ts`; Drizzle `netlify-db/session.js` and `node-postgres/session.js`; pg pool/query interfaces. No unsupported SDK method was invented. The adapter uses structural interfaces, avoiding dependence on transitive package imports.

## Validation and execution status

| Check | Actual result |
| --- | --- |
| `npm run typecheck` | PASSED |
| `npm run lint` | PASSED |
| `npm test` | PASSED: 193 tests in 12 files, zero skips (148 baseline + 45 new) |
| `npm run check:architecture` | PASSED |
| `npm run check:secrets` | PASSED for supported patterns; not an exhaustive credential audit |
| `git diff --check` | PASSED |
| Workflow diff | Empty; `.github/workflows/` untouched |
| Production build | **NOT EXECUTED**: build commands prohibited by the runner; platform validation is separate |
| PostgreSQL integration tests | **NOT RUN**; no integration runner invoked |

Offline regression coverage includes authorization/provenance/protected target rejection, physical identity mismatch, missing TLS evidence and URL override rejection, privilege mismatches, every freshness counter, fixture/skipped-assertion/cleanup failure, exact COMMIT acknowledgment, returned ROLLBACK rejection, unknown results without retry, matching/mismatching/unresolved durable lookup contracts, bounded serialization/deadlock retries, initial/terminal connection sanitization failures, swallowed query rejection and expired scopes. Positive fixtures are explicitly synthetic, not authoritative platform evidence.

## Future operator instructions and remaining blockers

1. Obtain separate authorization for a new isolated verification project/database. This report grants no resource creation or execution approval. Do not use the application-staging project, its database/previews, copied production data, shared credentials or this workspace's inherited database defaults.
2. Before provisioning, establish supported identity, role/login separation, global-role scope, TLS, migration ownership, credential rotation/revocation and complete teardown through official platform evidence. Missing support is a hard stop. Record protected-resource inventory, accountable operator and cleanup owner without secrets.
3. Capture the exact new project/database/branch/physical-name/endpoint tuple and provenance. Use a disposable external label and short-lived exact approval; no wildcard or inferred endpoint. Newly issued role-specific credentials stay in a supported secret store, never in approval artifacts, logs or tracked files.
4. Review and implement authoritative collectors and a bounded, cancellation-aware runner in a separately authorized change. Bind approval to reviewed baseline/candidate hashes, evidence source and permitted operations. `prepareManagedConnection` is only offline validation, not permission to connect. Do not bypass `requireManagedCollectors`, reuse the local superuser runner, or interpret synthetic booleans as observations.
5. In that later reviewed environment, verify effective TLS, identity, role capabilities, actual timeout/cancellation settings and strict freshness **before** candidate application or fixtures. Preserve restricted independent runtime credentials. If provider metadata violates freshness or role/bootstrap capabilities differ, stop for review.
6. Use one supported platform migration mechanism in the dedicated verification project only after separate approval and ownership validation. Keep this repository's candidates quarantined. Supply all concrete matrix probes; failed fixtures, missing assertions, unresolved COMMIT or failed teardown block acceptance.
7. On completion/failure/cancellation, close/discard clients, close pools, revoke credentials and confirm deletion of the approved database and scoped roles through a supported provider path. Retain redacted nonsecret evidence and call the teardown confirmation gate. Cleanup that cannot be established remains a blocker, not a successful run.

**Recommendation:** accept Sprint 2.2B's offline code and regression tests for review, with the managed harness explicitly incomplete and fail-closed at the authoritative-collector boundary. **NO-GO for managed PostgreSQL execution, adapter activation or production readiness.** Live database identity/TLS/privilege/freshness/concurrency/COMMIT/cleanup evidence, complete managed probes and durable reconciliation remain required. No database, authentication, business API, monitoring, workflow or deployment activation occurred. Managed GitHub delivery is delegated to Agent Runner; no direct commits/PRs, merge or manual deployment were attempted. A PR URL/status is not yet available within this run. Work stops at Sprint 2.2B.
