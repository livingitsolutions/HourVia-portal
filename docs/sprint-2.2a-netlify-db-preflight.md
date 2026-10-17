# Sprint 2.2A — Netlify Database preflight

Assessment date: 2026-10-17. **GO for review of this preflight; NO-GO for database execution or runtime activation.** Netlify Database remains the selected platform. This assessment establishes documentation and installed-interface evidence, not live PostgreSQL enforcement. No database was provisioned, connected to, queried, migrated, or changed. No Sprint 2.2B work began.

## 1. Verified GitHub baseline

GitHub's public branch API, `https://api.github.com/repos/livingitsolutions/Hourvia-V3/branches/main`, returned main at `1c156e817399fd1a36cfe15bc9c7e208f40d6c2b`, titled “Merge pull request #4 from livingitsolutions/agent-hourvia-v3-sprint-21-4a94”, with the description “PostgreSQL security verification for Hourvia V3 Sprint 2.1”. Local HEAD matched. Local history included Sprint 2.1 implementation `1fdc91755d3dfd0d7c6f757989f781b95820204a`; its ancestry check against HEAD exited 0. The expected baseline is present. Initial working-tree status was clean.

Reviewed the prior task history, Sprint 2/2.1 reports, persistence/security/operations documentation, `db/schema.ts`, all three quarantined SQL candidates, transaction/idempotency/operation protocols, manual integration runner and authorization gates, schema/gate/transaction unit tests, package manifests and installed sources, architecture/secret checks, and `netlify.toml`. The eight-table schema includes tenant composite foreign keys, active-owner uniqueness, session identity pairing and scoped idempotency. Deferred invariants, lifecycle guards, privileges and FORCE RLS live in quarantined SQL, not proven database state.

The existing application, tests, dependencies, SQL and runtime code remain unchanged. Only this report and the delivery summary were added/updated.

## 2. Netlify Database capability matrix

**VERIFIED** means explicitly documented support or observable installed implementation, with the evidence boundary stated. **UNSUPPORTED** means the inspected API or current implementation cannot provide the specified behavior; it does not mean PostgreSQL itself lacks that feature. **UNVERIFIED** means the reviewed evidence cannot establish the required managed-platform guarantee. No row asserts live verification.

Official documents retrieved over HTTPS on the assessment date:

- [Overview and branching](https://docs.netlify.com/build/data-and-storage/netlify-database/), [getting started](https://docs.netlify.com/build/data-and-storage/netlify-database/getting-started/).
- [API reference](https://docs.netlify.com/build/data-and-storage/netlify-database/api/), [tooling](https://docs.netlify.com/build/data-and-storage/netlify-database/tooling/).
- [Migrations](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/), [CLI](https://docs.netlify.com/build/data-and-storage/netlify-database/cli/).

Their published `.md` versions were read as reference data. No database-management endpoint was called.

| Capability | Classification | Evidence and limit |
| --- | --- | --- |
| Project-scoped provisioning | VERIFIED | Getting-started UI instructions and API `POST /sites/{site_id}/database`; create returns 201, existing database returns 200. No provisioning performed. |
| Separate project/database target | VERIFIED | Provisioning and acquisition APIs are scoped to a site. Physical cluster exclusivity and role isolation between branches remain UNVERIFIED. |
| Preview isolation without copying staging data | UNSUPPORTED | A preview of staging copies its production-branch data. It does not satisfy this request's separate-project/no-staging-data condition. |
| PostgreSQL connection acquisition | VERIFIED | `getConnectionString()`, `getDatabase({ connectionString })`, and site-scoped connection retrieval are documented. No getter was invoked and no URL retrieved. |
| Client-side connection pooling and pinning | VERIFIED | `pool.connect()` and same-client BEGIN/COMMIT documented; installed pg/Neon pools expose query/release. |
| Provider pooled versus direct endpoint selection | UNVERIFIED | Client pooling does not establish backend pool mode, a direct URL, session affinity outside transactions, or permitted startup settings. Do not derive alternate hosts. |
| Explicit SQL transactions | VERIFIED | Documented pinned-client BEGIN/COMMIT/ROLLBACK and installed client APIs. Managed execution remains untested. |
| Transaction-local settings/context | UNVERIFIED | Existing protocol uses parameterized `set_config(..., true)` on one client. Managed acceptance/reset and pool reuse are untested. |
| Restricted custom roles/credentials | UNVERIFIED | Reviewed platform docs do not establish CREATE ROLE grants, independent login issuance, or non-BYPASSRLS runtime credentials. |
| Migration-role separation | UNVERIFIED | Automatic migrations are documented; execution principal, SET ROLE authorization and credential override are not established. |
| FORCE RLS compatibility | UNVERIFIED | Candidate enables/forces RLS on eight tables. Actual permissions, ownership and enforcement on Netlify are untested. |
| Advisory locks | UNVERIFIED | No managed-pool guarantee found. Need transaction-scoped advisory lock contention/release probes; existing candidates use row locks instead. |
| Serializable isolation | UNVERIFIED | SQL/client interfaces can submit it; actual isolation, conflict codes and retry behavior on the target remain untested. |
| Raw COMMIT command metadata | VERIFIED | Installed pool query results preserve `command`; local protocol checks COMMIT versus ROLLBACK. No live acknowledgment or durability result established. |
| Required acknowledgment via installed ORM transaction wrapper | UNSUPPORTED | Both inspected wrappers discard the COMMIT result and return the callback value. |
| COMMIT transport loss and authoritative recovery | UNVERIFIED | Needs fault injection and reviewed replay lookup; neither platform docs nor mock tests establish this guarantee. |
| Credential rotation | UNVERIFIED | SDK HTTP client rereads automatic URL and rebuilds when changed; pools capture their initial URL, and explicit overrides are fixed. No issuance/revocation/rotation contract found. |
| Managed connection secret delivery | VERIFIED | Tooling documents automatic server-side connection configuration. Browser safety, access scoping, revocation and rotation still require operator verification. |
| Drizzle adapter compatibility | VERIFIED | Native adapter exists in installed beta; accepts Netlify client and dispatches transports. This verifies API integration, not Hourvia security or COMMIT suitability. |
| Whole database/cluster teardown | UNVERIFIED | API documents branch and snapshot deletion, not a complete root-database deletion/retention contract. Require a supported teardown path before provisioning. |

Installed versions: `@netlify/database` 2.0.1; `drizzle-orm` and `drizzle-kit` 1.0.0-beta.22; `pg` 8.23.1; `@neondatabase/serverless` 1.2.0. No installation or upgrade occurred. Source evidence: Netlify `dist/main.js` and declarations; Drizzle `netlify-db/driver.js`, `netlify-db/session.js`, `node-postgres/session.js`; installed pool/client/result interfaces. Dependency availability is not permission to use the current environment's credentials.

## 3. Project/database isolation assessment

Provided staging configuration identifies `hourvia-v3-staging` and project ID `368baa52-efc2-4775-ba46-da764d51ec2b`; it reports an existing database and a deployed production database branch. These are supplied configuration facts, not fresh platform/database inspection. No complete live site response, secret environment values or database metadata was retrieved.

Neither staging's database nor its deploy previews qualify. New verification resources must belong to a different project, use newly issued disposable credentials, and have no fork, snapshot, restore, replication, import or fixture source from staging/production. A platform branch named `production` within the new disposable project is not by itself evidence of protected application data; exact project/database identity and provenance must decide safety. The current gate's label restrictions still apply to test labels.

A dedicated Netlify database must not be described as an exclusive PostgreSQL cluster without evidence. PostgreSQL roles are cluster-wide, and the runner's required cluster-destruction authorization cannot be assumed to cover a managed database or branch. Platform-admin confirmation of role scope and safe cleanup is a prerequisite.

The overview currently states availability on credit-based plans. Supplied staging plan metadata does not prove eligibility, quota, region availability or billing authorization for a new project; the operator must confirm these before resource creation.

## 4. Connection and Drizzle compatibility findings

The SDK supports automatic acquisition and an explicit connection override. Its installed server transport constructs `pg.Pool`; serverless constructs a Neon pool plus independent HTTP client. The environment selects transport even with an override. Drizzle's no-argument path uses a different selection branch: explicit server selects node-postgres; otherwise it builds the HTTP/WebSocket adapter. Thus defaults must not be assumed equivalent.

Drizzle accepts a Netlify connection as `client`, a connection string/configuration, or HTTP/pool clients. Normal serverless queries use HTTP; callback transactions acquire one pool client and use it until release; nested transactions use savepoints. HTTP batch transactions are not an interactive callback with conditional authorization and same-client context/locking. Independent SQL/HTTP calls cannot carry Hourvia transaction context safely.

The existing manual runner imports/initializes the SDK only after its pure authorization gate, supplies an explicit target, rejects inherited serverless mode and asserts the actual server transport before connection. It currently permits loopback only, requires a specifically named database and superuser bootstrap, and applies candidates itself. **It cannot be used against Netlify unchanged.** Do not bypass its gate with a tunnel, URL rewrite, environment trick or staging credentials.

A future, separately reviewed verification runner must validate exact project/database/branch/endpoint provenance, remote TLS, independent credentials and permitted bootstrap operations before connecting. No such runner or runtime adapter was implemented here.

## 5. Database roles and RLS feasibility

The quarantined role candidate creates two NOLOGIN roles: migration and runtime, both NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS. It revokes PUBLIC database CREATE/TEMP and public-schema CREATE, grants schema ownership-related access to migration, switches to that role and revokes permissive default privileges. These are group/ownership roles, not independently issued login credentials.

Migration owns the objects and receives a permissive policy; runtime has scoped SELECT only, no provider-identity browsing, and no table mutation or role-administration permission. Functions use fixed search paths and revoked PUBLIC execution. FORCE RLS restricts ordinary owners but cannot constrain a superuser/BYPASSRLS principal or prevent a trusted owner changing policies. The permissive migration policy intentionally permits trusted helpers to inspect membership/session data.

Future evidence must establish separate disposable bootstrap/migration/runtime login identities, effective and inherited grants, role switching paths, ownership, and prevention of runtime elevation. Runtime login must never inherit bootstrap/migration powers. No superuser should be required of the runtime identity.

The current runner requires a true superuser and uses SESSION AUTHORIZATION to impersonate runtime. Managed administrative credentials may not support either. Do not weaken assertions or claim equivalent login isolation from SET ROLE alone. If Netlify cannot support the required bootstrap/privilege model, record the exact incompatibility and stop for security review; the selected platform remains unchanged pending that decision.

Custom actor/session/tenant settings are freely settable by a SQL caller, not authentication. Helpers validate live session pairing and membership; arbitrary SQL with another valid identity tuple is outside their protection. Server-derived context, server-only secrets and reviewed narrow mutation/bootstrap routines remain required. Successful SQL fixtures do not validate business-command or recipient authentication.

## 6. Transaction and COMMIT findings

`db/transaction.ts` owns the full lifecycle: fresh acquisition, serializable BEGIN, local actor/session/tenant/UTC settings, work, typed rejection rollback, command-tag acknowledgment and release. It returns success only for `command === 'COMMIT'`; a COMMIT reply tagged ROLLBACK returns `rolled_back`. Unexpected tags and nonretryable COMMIT exceptions yield `commit_unknown` and discard the client. A later ROLLBACK cannot resolve a lost COMMIT reply.

Retries are limited to three attempts for SQLSTATE 40001/40P01, require acknowledged rollback, and reacquire/reexecute with reauthorization. No external side effects may occur inside retryable work. Common organization row locking, version advancement and reauthorization on every attempt are essential to revocation safety; RLS alone cannot invalidate an existing serializable snapshot.

Both installed Drizzle transaction implementations await COMMIT and ignore its command tag, return resolved typed failures as ordinary callback values, issue BEGIN before their try/finally, and release normally after the catch path. Their catch-path rollback can obscure the original exception; destructive release and uncertain outcomes are not modeled. No transparent retry satisfying Hourvia's protocol was found. Wrapping this ORM callback around `runTransaction` would introduce conflicting transaction ownership.

Supported alternative, not implemented: use a documented `getDatabase({ connectionString })` pinned pool client, or the documented standard PostgreSQL URL with a reviewed `pg.Pool`, preserving raw query command metadata and destructive release for `TransactionConnection`. One layer owns BEGIN/COMMIT; all context, locks, queries and mutations use that client. Drizzle query building may be evaluated separately, without delegating transaction outcome classification to its wrapper. Managed endpoint/TLS/role compatibility and fault-injection evidence remain prerequisites.

For uncertain outcomes, retain the same authenticated actor/scope/operation/idempotency key and input digest; use a fresh trusted connection and reviewed authoritative lookup/reconciliation. Replay only a matching completed result, reject mismatched payloads, and treat pending/absent results as unresolved until the original transaction is conclusively resolved. Never retry blindly or infer abort from an absent row. No production recovery adapter exists.

## 7. Disposable verification environment design

Proposed project label: `hourvia-v3-db-verify-<unique-run-id>`. Proposed external test target label: `hourvia_disposable_<unique_run_id>` (8–64 lowercase letters/digits/underscores after the prefix, no protected label segments). The actual platform database name may differ: record it separately and require an exact approved mapping. Do not pretend this label satisfies the current runner's physical-name check.

Before creation, the operator records authorization covering team, new project ID once assigned, run ID, target label, actual database/branch identity, approved endpoint, credentials' role identities without values, code/candidate hashes, test scope, expiration, permitted privilege changes, cost limit, responsible operator and teardown owner/deadline. Reject staging's project ID and every protected project/database identity. Empty or wildcard authorization fails closed.

Freshness has two stages: platform evidence proves new dedicated resource provenance with no copied application data; then authorized bootstrap inspection checks exact database identity/version (runner expects PostgreSQL 15+), user schemas, relations, types, routines, extensions, existing Hourvia roles, migration state and unexpected sessions. Managed platform metadata may make the current strict empty-catalog assertions fail. Any permitted platform objects require a documented exact allowlist and review, never silent omission or deleting unknown objects. Catalog emptiness alone cannot prove provenance.

Proposed bounds for the future runner: at most two concurrent clients per active role pool and at most four overall; 5-second acquisition timeout; 10-second connection/session statement limit; 5-second test-transaction statement timeout; 2-second lock timeout; 10-second idle-in-transaction timeout; 5-minute overall deadline; at most three retry attempts. Enforce server-side limits and client cancellation/discard, with cleanup after timeout. These extend the current harness, which bounds acquisition/statements and uses two concurrent test clients but does not explicitly cap all pool connections or total runtime.

## 8. TLS and credential-handling requirements

Remote transport requires trusted certificate-chain and hostname verification. Never use disabled certificate verification, insecure URL options, global TLS bypasses or an unverified localhost tunnel. Obtain the exact supported endpoint/CA policy from Netlify. For a future pg-based runner, require an explicit verified TLS configuration; reject URL options that override it and assert the effective configuration before connection. Prove a bad certificate/hostname is rejected using an isolated test, without contacting protected targets. WebSocket/HTTP transport requires its own verified HTTPS/WSS policy; do not assume pg SSL options apply to it.

Use newly issued disposable secrets from a supported UI/secret store in a clean operator environment, outside this staging-linked workspace. No automatic database fallback or inherited team-wide/staging connection values. Keep secrets out of shell arguments/history, browser bundles, files committed to git, screenshots, HTTP response dumps, test errors and evidence. Debug SQL logging remains disabled; driver errors may contain URLs or query parameters and require suppression/redaction. Do not invoke credential-printing CLI options or dump environment/site responses. No GitHub PAT is required.

Document supported rotation/revocation before setup: separate runtime/migration credentials, which sessions survive rotation, pool drain/recreation, old-credential invalidation and recovery when a credential changes mid-COMMIT. SDK HTTP URL refreshing is not proof of pool rotation. Remove ephemeral credentials/access after teardown and retain only nonsecret evidence. No credentials were read in this preflight.

## 9. Operator setup instructions

These are proposed future actions; none is authorized for execution by this document. The user must explicitly authorize a later integration run. Resolve gates first and stop on any failed prerequisite.

1. Confirm plan eligibility, quota, region, supported role model, verified TLS endpoint, credential issuance/rotation and complete database teardown with Netlify documentation/support. Confirm dedicated database provenance and the scope of global roles. Record evidence without secrets. Lack of a supported teardown route blocks creation.
2. Approve the resource/test/teardown manifest in section 7, then create a new standalone project through the Netlify UI in a separate operator workspace. Do not link/reconfigure this checkout or connect automated repository deployments. Record the assigned project ID and check it differs from staging.
3. In that new project's **Data & Storage → Database**, use documented manual creation to provision a fresh database. Capture nonsecret resource identity/creation evidence. If creation reports an existing resource, halt and investigate rather than reusing it. Do not fork/restore staging or production.
4. Obtain only the new target's credentials through a supported secure mechanism. Validate target mapping and TLS configuration offline before the first connection. Set up distinct least-privilege login identities only through confirmed supported operations.
5. Review and authorize a managed-target verification-runner change separately. Preserve existing loopback gates/tests; add exact remote-target authorization, TLS/bounds, approved metadata allowlists, role-aware probes and teardown requirements. Superuser/SESSION AUTHORIZATION assumptions must be resolved explicitly. This preflight does not implement that change or authorize elevated bypasses.

## 10. Authorized integration execution plan

**Authorization status: pending; all steps below are NOT EXECUTED.** A future operator approval must explicitly name the target and approve candidate application, security tests and teardown. The existing local runner must not be invoked for the proposed Netlify target.

1. Recheck authorization expiry, baseline/candidate hashes, resource identity, independent credentials, verified TLS configuration and bounds. Reject protected or ambiguous targets before any connection.
2. After approval, connect only to the disposable target and verify effective login/current role, privilege inheritance, PostgreSQL version, resource identity, TLS and freshness. Retain allowlisted booleans/counts/SQLSTATE evidence; never log raw rows or credentials. A setup failure fails the run.
3. Approve migration execution ownership. Apply only the reviewed quarantined roles → generated schema → invariant/security candidates, preserving role switch and atomic ordering. Netlify supports automatic migration discovery and documents an optional manual migration system; select one reviewed mechanism only. The current runner's direct bootstrap application is not an approved managed migration path. If using platform migrations in a future dedicated verification fixture, package/review the ordered candidates there and deploy only that disposable project after explicit approval. Keep Hourvia's quarantine outside discovery. Verify the platform principal can preserve the required role/ownership/transaction boundaries; otherwise stop.
4. Run the full matrix below through independently restricted runtime credentials plus separate trusted fixture/setup credentials. Do not replace runtime probes with owner/superuser probes. Test setup, assertion, deadline or cleanup failures fail the run; skipped assertions cannot yield success.
5. Add the missing provider-specific probes: transaction-local context reset across COMMIT/ROLLBACK/reuse; serializable conflict/retry; transaction advisory lock contention and release; forbidden runtime role switches; verified TLS rejection; connection limits; acknowledged COMMIT, COMMIT returning ROLLBACK, and controlled lost-COMMIT response with authoritative reconciliation. Fault injection must be scoped to the disposable runner and never alter shared services.
6. Collect redacted per-case PASSED/FAILED/BLOCKED/NOT RUN results, expected/actual SQLSTATE or command tag, completed assertion counts, tested transport/version, source/candidate hashes, target label/resource identifiers, timestamps, role-check booleans and cleanup status. Raw database rows, URLs, credentials and driver exception dumps are excluded. Tests without implementations remain BLOCKED and prevent full acceptance.
7. On success, failure or cancellation: stop test clients, roll back where possible, discard uncertain clients, close pools and disable further test access. Through the preconfirmed supported platform path, delete only the authorized disposable branches/snapshots and dedicated database/project; verify database deletion separately rather than assuming project deletion cascades. Clean up created roles only within the approved scope; if a shared provider cluster prevents this, use the provider-supported cleanup process rather than dropping global roles indiscriminately. Revoke credentials and remove ephemeral secret-store access. Retain redacted deletion evidence; failed teardown remains an open blocker with an accountable owner. Do not snapshot application/test data for retention by default.
8. Review evidence and unresolved outcomes before considering any later sprint or adapter activation. This plan cannot authorize production/staging execution.

| PostgreSQL security matrix | Actual status | Coverage / prerequisite |
| --- | --- | --- |
| Cross-tenant SELECT/INSERT/UPDATE/DELETE | NOT RUN | Existing manual probes; distinguish privilege denial from RLS/FK enforcement |
| Missing/forged context and context reset | NOT RUN | Existing cases plus managed transport reuse checks |
| FORCE RLS including ordinary owner | NOT RUN | Catalog flags and rollback-local owner-policy removal |
| Runtime privileges and separate logins | NOT RUN | Existing denial probes; independent Netlify credentials unresolved |
| Atomic organization provisioning | NOT RUN | Fixture transaction/rollback only; live bootstrap remains blocked |
| Exactly one owner / concurrent transfer | NOT RUN | Unique/deferred invariants and shared row-lock protocol |
| Concurrent suspension/revocation | NOT RUN | Stale snapshot rejection and fresh membership read |
| Invitation replay, expiry, terminal insertion | NOT RUN | Prepared runner cases; recipient authentication remains blocked |
| Audit append-only | NOT RUN | UPDATE/DELETE/TRUNCATE denial |
| Idempotency replay/payload/concurrent claims | NOT RUN | Prepared storage assertions; authoritative command replay blocked |
| Rollback and connection recovery | NOT RUN | Existing recovery probes plus managed reset checks |
| COMMIT acknowledgment and ROLLBACK tag | NOT RUN | Existing manual probes, raw metadata required |
| Advisory locks / remote TLS / rotation | BLOCKED | Additional reviewed managed-target probes and supported operational contracts required |
| Lost COMMIT and uncertain outcome recovery | BLOCKED | Driver fault injection and reviewed authoritative recovery adapter required |
| Business command/recipient authorization | BLOCKED | Trusted command/bootstrap/provider routines absent; no endpoints added |

## 11. Offline validation results

Executed in this preflight, all exit code 0:

| Command | Actual result |
| --- | --- |
| `npm run typecheck` | PASSED |
| `npm run lint` | PASSED |
| `npm test` | PASSED — 148 tests in 10 files; no skips reported |
| `npm run check:architecture` | PASSED |
| `npm run check:secrets` | PASSED; supported patterns only, not an exhaustive credential audit |

PostgreSQL tests: **NOT RUN**; no runner invocation, SQL or connection. Build: **NOT RUN**, reserved for platform validation. Offline success does not establish database enforcement. Final whitespace and workflow-diff checks passed. `.github/workflows/` remained untouched.

## 12. Remaining blockers and unknowns

No disposable target or future-run authorization exists. Managed role creation/login separation, migration principal/ownership, global-role isolation, non-superuser replacement for SESSION AUTHORIZATION, backend pool mode/direct endpoint, effective TLS settings, database freshness exceptions, credential rotation, plan eligibility and complete supported teardown remain unverified. The current harness is deliberately incompatible with remote managed targets and must remain fail-closed. No database constraints, RLS, concurrency or COMMIT-loss recovery has been proven on Netlify. Narrow business-command, provider/recipient verification and authoritative replay implementations remain absent.

## 13. Go/no-go recommendation

Accept this documentation-only Sprint 2.2A preflight for review. Retain Netlify Database as the selected platform, with a **NO-GO for provisioning/execution now and for runtime activation**. A later disposable run is conditional on operator authorization, documented platform feasibility and cleanup, and a reviewed managed-target harness. Production readiness additionally requires the complete security matrix and reliable uncertain-outcome recovery.

No production/staging changes, authentication activation, business endpoints, monitoring collection, credential logging, PATs, workflow changes, git writes, automatic merge or deployment occurred. Work stops after this preflight; Sprint 2.2B is not started.
