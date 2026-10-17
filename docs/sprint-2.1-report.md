# Sprint 2.1 security verification

Assessment: 2026-10-17. Recommendation: accept the offline hardening changes for review, conditional on external build validation. **Do not accept database enforcement or production readiness.** PostgreSQL integration remained NOT RUN. No database connection was opened, migrations executed, or platform activation performed. Work stopped at Sprint 2.1.

## Baseline and scope

GitHub's public branch API and local HEAD both resolved main to `f1609c6cef57a3e7b60b2d74071c0fc2ebf7cc3b`; the local ancestry check succeeded. This was the merged Sprint 2 implementation. Read-only git inspection was used; remote git listing was unavailable, so GitHub verification used the branch API. The schema, generated SQL/snapshot, role/security candidates, transaction/idempotency contracts, harness, operations instructions and security/design documentation were reviewed. No V1/V2 code was imported.

Changed files: `db/quarantine/002_invariants_security.sql`, `db/tests/disposable-gate.mjs`, `db/tests/disposable.integration.mjs`, `db/tests/gates.test.ts`, `package.json`, `package-lock.json`, `docs/persistence-operations.md`, `docs/netlify-database-assessment.md`, this report, and the managed delivery summary `.netlify/results.md`.

## Demonstrable defects and corrections

Invitation expiry used transaction start time: a transaction begun before expiry could consume a token after expiry. The candidate now checks wall-clock time inside the trigger, including time spent waiting for a row lock. Acceptance timestamps retain the existing transaction timestamp contract. A manual regression covers expiry during an open transaction.

The lifecycle guard covered UPDATE only. A privileged writer could insert an already accepted invitation and bypass the pending-to-terminal consumption protocol. A BEFORE INSERT guard now requires pending state. This does not implement recipient authentication or permission checks; those remain obligations of blocked command routines.

The harness treated any competing invitation error as successful denial, potentially accepting assertion/setup failures. It now requires expected PostgreSQL serialization/lock error codes. Freshness checks previously examined only selected public relation kinds and role names; they now reject all public relations/types/routines, non-system schemas, extra extensions and other target-database sessions, and require bootstrap capability before candidate application. The gate now rejects protected label segments and requires an explicit cluster-teardown acknowledgement. Connection/statement timeouts bound setup, and a success message follows cleanup and a minimum assertion-count check. New prepared cases exercise cross-tenant DML restrictions, FORCE RLS as the table owner without its permissive policy, membership suspension as well as revocation, terminal invitation insertion, and real COMMIT returning ROLLBACK after an aborted transaction.

These are source-level corrections. No claim is made that PostgreSQL accepted or enforced the changed SQL.

## Harness safety assessment

The harness is manual, excluded from application/build/ordinary test execution, and has no default database fallback. It requires an exact disposable URL/name, isolated-cluster authorization, candidate-application authorization and teardown acknowledgement. Remote hosts, URL query parameters/fragments, inherited serverless transport and protected labels are rejected before connecting. The actual transport is checked before acquisition. Non-loopback connections are unsupported; remote TLS cannot silently disable certificate verification because remote connections cannot pass the gate. Any future remote support must verify certificates and hostname.

Operator authorization remains essential: an empty catalog and loopback address cannot prove provenance, detect a tunnel to a protected service, or guarantee exclusive cluster ownership. The bootstrap superuser exists solely for fresh-cluster role setup and SESSION AUTHORIZATION tests; fixtures use the restricted migration role, and runtime probes use the restricted runtime role. This does not prove independent runtime login credentials. Candidate application remains one explicit ordered transaction outside Netlify migration discovery. Setup/assertion errors fail the process and suppress driver details. No success is reported before all prepared assertions finish. Destroy the entire isolated cluster, including global roles, on success or failure; the runner does not destroy it automatically. No safe authorized target was supplied in this run, so the runner was never invoked.

## PostgreSQL integration matrix

All rows report actual PostgreSQL execution, not unit-test equivalents. NOT RUN means the disposable authorization/target was unavailable; BLOCKED identifies an additional missing implementation or platform guarantee.

| Test | Status | Prepared coverage or blocker |
| --- | --- | --- |
| Cross-tenant SELECT | NOT RUN | Scoped reads and joins |
| Cross-tenant INSERT | NOT RUN | Runtime privilege denial and composite FK rejection |
| Cross-tenant UPDATE | NOT RUN | Runtime denial and immutable membership tenant identity |
| Cross-tenant DELETE | NOT RUN | Runtime privilege denial |
| Missing tenant/actor context | NOT RUN | Empty visibility and reset on reuse |
| Forged tenant/session pairing | NOT RUN | Wrong tenant, mismatched session and malformed UUID |
| FORCE RLS | NOT RUN | Catalog flags plus owner read after rollback-local removal of owner policy |
| Runtime privilege restrictions | NOT RUN | DML, DDL, TRUNCATE, TEMP, role escalation and helper execution denial |
| Organization provisioning | NOT RUN | Atomic privileged fixture provisioning and rollback; live bootstrap remains blocked |
| Exactly one owner | NOT RUN | Immediate duplicate rejection, deferred zero-owner rejection and orphan activation |
| Concurrent ownership transfer | NOT RUN | Shared organization lock and stale snapshot abort |
| Concurrent membership suspension | NOT RUN | Stale snapshot abort and fresh read denial |
| Concurrent membership revocation | NOT RUN | Stale snapshot abort and fresh read denial |
| Invitation replay/concurrent consumption | NOT RUN | Expected database error codes, terminal transition and terminal insertion rejection |
| Invitation expiry | NOT RUN | Already expired and expiry during open transaction |
| Audit append-only | NOT RUN | UPDATE, DELETE and TRUNCATE rejection |
| Idempotency identity/payload mismatch | NOT RUN | Scoped unique identity, immutable digest/result, mismatched duplicate and cross-tenant actor FK |
| Concurrent idempotency claims | NOT RUN | Same-key uniqueness/serialization |
| Transaction rollback/recovery | NOT RUN | Full provisioning rollback and connection recovery |
| COMMIT acknowledgement | NOT RUN | Acknowledged commits and aborted transaction returning ROLLBACK |
| Command-level replay/recipient authorization | BLOCKED | No reviewed live command/bootstrap adapter exists |
| COMMIT transport loss/uncertain recovery | BLOCKED | Needs driver fault injection and authoritative command replay adapter |
| Netlify independently issued runtime/migration credentials | BLOCKED | Supported role/credential provisioning and ownership model unverified |

## RLS, ownership and transaction findings

Composite invitation inviter/acceptor and audit actor foreign keys include organization ID. Idempotency additionally constrains organization/actor membership; session identity/user pairing is composite. No demonstrable missing tenant key was found. These constraints have not been database-tested.

All eight tables have candidate ENABLE/FORCE RLS. Runtime has SELECT only, no provider-identity browsing or mutations. The migration owner has an explicit permissive policy and owns schema objects; it is a trusted deployment principal able to change security definitions, not a security boundary against migration compromise. SECURITY DEFINER helpers use fixed search paths and revoked public execution. FORCE RLS does not protect against a superuser, BYPASSRLS role, or a trusted owner changing the policy.

Context settings are freely settable PostgreSQL custom settings. The helper checks live user/session pairing and active membership; it does not authenticate a database client. A caller able to run arbitrary SQL as runtime and supply another valid actor/session pair may impersonate that context. Trusted server-only credential handling, no arbitrary SQL endpoint, authenticated context derivation, and reviewed command routines remain required. Wrong tenant/session tests do not prove resistance to credential-compromised arbitrary SQL.

The partial unique index limits active owners to one; deferred triggers require one for active organizations. Membership triggers lock the organization and require serializable mutation. Revocation race safety additionally relies on the command protocol acquiring the common lock, advancing aggregate version and reauthorizing every attempt. The harness tests that protocol; RLS alone cannot invalidate an already acquired serializable snapshot. No database concurrency or ownership guarantee was established by this run.

The existing transaction protocol returns success only for a COMMIT command tag. A returned ROLLBACK yields rolled_back; typed failures roll back. Serialization/deadlock retries require acknowledged rollback, fresh acquisition/work and a maximum of three attempts. Nonretryable COMMIT exceptions or unexpected tags discard the client and return commit_unknown without retry. This is conservative, including definite nonretryable server rejection, and avoids false success. Mock tests pass; real transport failure remains blocked. Recovery requires authenticated authoritative lookup of the same actor/scope/operation/key and matching digest; absence alone does not prove abort. The digest helper assumes the caller already looked up the exact claim identity and does not itself authorize replay.

## Netlify Database compatibility

Installed `@netlify/database` 2.0.1 declarations/implementation and the supported API reference were inspected without initialization. Explicit connection overrides, pinned pool acquisition, explicit transaction boundaries, command metadata and destructive release are supported interfaces. Driver selection depends on environment. Independent HTTP SQL calls have no transaction-affinity guarantee. Documentation's COMMIT example does not check command tags. Transaction-local settings and RLS behavior on actual managed pools, independent restricted credentials, branch ownership and migration-role execution remain unverified. The adapter stays blocked; supported credential separation with a pinned native client or reviewed narrow database command routines are alternatives requiring further verification. Netlify Database was not activated.

## Dependency audit and remediation

The pre-change audit reported three affected development packages, not three independent advisories:

| Package installed before change | Severity | Advisory/fix | Compatibility assessment |
| --- | --- | --- | --- |
| @vitest/mocker 3.2.7 | Moderate | GHSA-82fw-gwwq-j7x9; patched 4.1.11 | Coupled to Vitest; no forced independent mocker override |
| tinypool 1.1.1 | Critical | GHSA-5gmw-xhrv-c9v3 and GHSA-85c8-ppgw-ccpr; patched 2.1.2 | Major independent override would violate the old parent's dependency range |
| vitest 3.2.7 | Critical aggregate | Includes direct mocker advisory and transitive tinypool exposure | Requires targeted major test-runner update |

Registry metadata established that Vitest 4.1.11 supports Vite 6 and Node 22/24 used here. Only the test-runner root was pinned to 4.1.11, updating its coupled dependency tree and removing tinypool. No independent transitive override or broad application/ORM/toolchain upgrade was applied. All tests, typecheck and lint passed with the existing configuration. The post-change full audit reported **zero vulnerabilities**. This was feasible within Sprint 2.1; future tests using changed Vitest APIs remain an ordinary upgrade risk. No development server exposure was enabled.

## Validation and delivery

- Unit tests: **PASSED**, 148 tests in 10 files with Vitest 4.1.11; no skipped tests reported.
- Typecheck, lint, architecture check, secret scan: **PASSED**.
- Disposable runner syntax check and git whitespace check: **PASSED**; neither proves SQL enforcement.
- PostgreSQL integration: **NOT RUN**, no database connections attempted.
- Production build: **NOT RUN** because this environment prohibits build commands and delegates validation to the platform. No external build result was available.
- `.github/workflows/`: untouched; baseline diff empty.
- GitHub delivery: files and standalone managed-delivery summary prepared. No direct commits, pushes, PR creation, merge or deployment attempted. The runner owns managed delivery; no PR URL/completed delivery is claimed.

Remaining blockers are authorized disposable execution, actual PostgreSQL enforcement/concurrency results, driver COMMIT-loss testing and command replay, trusted bootstrap/provider/recipient routines, independent credentials/platform role support, and external production build validation. Accept only the offline Sprint 2.1 hardening for review; retain the adapter activation block. No Sprint 3 work began.
