# Sprint 4B — Native Netlify Database verification

2026-10-17. **NO-GO for database writes and PostgreSQL integration testing.** Database discovery was attempted through supported platform metadata interfaces. Exact database resource and connection-branch identity remain unverified; execution stopped before any database connection or SQL. This report does not authorize later diagnostics, provisioning, installation or teardown.

## 1. Verified GitHub baseline

Credential-free public GitHub `GET /repos/livingitsolutions/Hourvia-V3/branches/main` returned HTTP 200 and commit `384c3bb8e0633aa7eb955dfafefde431bd91f85f`. `GET /repos/livingitsolutions/Hourvia-V3/pulls/14` returned HTTP 200, merged=true, base=main and the same merge commit. Local HEAD matched; local history includes Sprint 4A.2 implementation `a5040f2`. Live Netlify published main also matched. The initial working tree was clean. A branch-display command was rejected by the runner; no Git writes were attempted.

Reviewed Sprint 2.2E branch evidence, Sprint 4A.1 restricted commands, Sprint 4A.2 application composition, the read-only runbook, managed identity/authorization/TLS/collector gates, installed SDK and CLI source, schema definitions, generated quarantined SQL, security candidates, repository/delivery adapters and architecture checks.

## 2. Exact changed files

- `docs/sprint-4b-report.md`
- `.netlify/results.md`

No reusable connector was necessary: existing pure contracts already fail closed, and no authoritative collector became available. Adding an executable connector would not resolve the identity gate. All execution blockers, hard-disabled live factories and runtime import restrictions remain unchanged. No active migration, dependency, runtime handler or workflow changed.

## 3. Database resource metadata

Authenticated supported site metadata reads confirmed:

| Observation | Result |
| --- | --- |
| Project | `hourvia-v3-staging` |
| Project ID | `368baa52-efc2-4775-ba46-da764d51ec2b` |
| Repository / configured Git branch | `livingitsolutions/Hourvia-V3` / `main` |
| Database presence | Present according to project metadata |
| Published deploy | `6ad303453df5f6796b8e1924` |
| Published Git branch / context | `main` / `production` |
| Published commit | `384c3bb8e0633aa7eb955dfafefde431bd91f85f` |
| Published database branch assignment | `production` |
| Independent database resource ID | UNVERIFIED |

Supported `getSiteDatabase` (`GET /sites/{site_id}/database`) and `listSiteDatabaseBranches` (`GET /sites/{site_id}/database/branches`) both returned **HTTP 401** with the current authentication. Site metadata access succeeded. Error bodies and credential-bearing responses were not printed or persisted. No alternate credentials or undocumented endpoint was attempted. The 401 establishes discovery failure in this session, not database absence or universal platform unavailability.

The database GET response contract supplies a connection string, not an independent resource identity. Branch inventory supplies branch identifiers, state, compute and metadata, and can contain credentials. Neither inspected response contract guarantees an immutable database resource ID, execution lease or credential scope attestation. An inventory result alone would still need careful binding verification.

## 4. Connection branch and lifecycle evidence

The production branch above is a **deploy assignment**, not proof of the endpoint used by this runner. The staging project is a protected application project. Its production branch is not an authorized disposable target. Production/staging data isolation is UNVERIFIED; the project name does not establish an independent database.

Presence-only checks confirm an ambient SDK connection and branch selector exist. In-memory comparisons show the selector is not production, while the runner context does not equal either production or deploy-preview. No selector name, hostname, URL, credential or arbitrary environment value is reproduced. No global TLS bypass or custom CA environment setting was detected; this is not proof of effective certificate validation. A non-production selector alone cannot prove isolation. Current runner assignment and endpoint binding remain UNVERIFIED.

Supported `listSiteDeploys` followed by individual `getDeploy` reads inspected the 30 most recent deploys. All 30 belonged to this project, and **none matched the current runner selector**. Nine had production assignments; 21 had deploy-preview context, of which 16 had non-null branch assignments and five had null/missing assignments. This bounded deploy sample is not a database branch inventory. Representative latest assignments and all missing-assignment observations are:

| Deploy | Git branch | Assigned database branch |
| --- | --- | --- |
| `6ad302d915f717c676afddd6` | `agent-for-hourvia-v3-0698` | `agent-for-hourvia-v3-0698` |
| `6ad3012e1409cb6c3ee39594` | `agent-6ad3001989aace1468f706` | `agent-6ad3001989aace1468f706` |
| `6ad2f5783df5f6796b820e90` | `agent-for-hourvia-project-25b4` | Null/missing |
| `6ad2ed621060b4c67bf35d29` | `agent-only-pull-request-6422` | Null/missing |
| `6ad2eaedfc6b68365b2624e8` | `agent-for-hourvia-v3-075e` | Null/missing |
| `6ad2e9aafb4d6fa08dbe2323` | `agent-for-hourvia-v3-075e` | Null/missing |
| `6ad2e7117b4cafb02a3fbbaf` | `agent-for-hourvia-v3-075e` | Null/missing |

Null and absent assignments were normalized for comparison; neither proves isolation or production fallback. Assignments to named previews establish metadata availability only, not an active connection or data isolation.

The installed supported OpenAPI describes branch creation with an explicit parent, branch GET, branch DELETE and branch reset. Creation defaults to the production parent when a parent is omitted and may return an already-existing branch. These are interface capabilities only; no create, reset, delete, snapshot or restore operation was invoked. They do not establish that a disposable empty target exists, that copied data is safe, that teardown removes global roles, or that this operator is authorized for lifecycle operations. Preview availability and complete branch inventory remain UNVERIFIED because discovery returned 401.

Sprint 2.2E's historic sample included preview assignments and null/missing assignments. Those observations are not current proof. Even a current preview assignment cannot establish the ambient connection binding or production exclusion. No inference is made from branch-name shape, URL shape, DNS, TLS or `current_database()`.

**STOP boundary:** no operator-authorized exact resource/branch target, authoritative connection binding, production exclusion or immutable execution identity was established. The existing managed gate separately protects this staging project, and `requireManagedCollectors()` still unconditionally blocks execution. No SDK getter, SDK factory, pool, CLI database connection/status command or integration harness was invoked.

## 5. TLS verification

**Effective TLS certificate validation: UNVERIFIED / NOT ATTEMPTED.** There was no identity-verified target, so no database TLS handshake or SQL occurred. No TLS failure was observed; the safe blocking category is identity evidence unavailable, with platform discovery HTTP 401. This is not a certificate failure.

Offline SDK review confirms `@netlify/database` 2.0.1 accepts only an explicit connection string and debug option. It chooses a pg server pool or Neon serverless pool using runtime configuration; the serverless SQL helper uses HTTP, while its pool uses the serverless transport. Pools capture the initial URL; ambient connection getters and the HTTP helper can re-read configuration. Neither API attests project/resource/branch identity. Missing connection configuration throws, but this does not prove a supplied endpoint excludes production.

The SDK exposes no explicit trusted-CA, certificate/hostname validator or transport-observation option through its factory. This is a verification limitation, not evidence that SDK transport is insecure. Effective TLS depends on the selected transport, URL options, driver/runtime trust and platform endpoint. HTTPS success in platform metadata calls is not PostgreSQL TLS evidence.

The existing pure `verifiedPoolOptions` requires certificate validation, hostname checking and SNI, rejects URL query overrides and global certificate bypass, and enforces bounded pool settings. It has no network side effects and was not used to connect. Actual CA trust, certificate chain, hostname match, server TLS requirement and connection transport compatibility remain unverified. No custom CA was installed or certificate verification disabled. A future reviewed collector must stop on a classified certificate-chain, hostname, trust-configuration or transport failure without printing raw driver errors or retrying with weaker TLS. Server SSL metadata alone cannot prove client certificate validation.

## 6. PostgreSQL security inspection

**All live PostgreSQL observations are UNVERIFIED.** No version, current/session role, role attributes/membership, schemas, migration ledger, RLS policies, table ownership, effective runtime writes, restricted function ACLs or transaction capability was inspected through SQL. No claim is made that any quarantined object exists in the database.

Offline intent remains: separate NOLOGIN migration/runtime/command roles without superuser or BYPASSRLS, no runtime direct writes, forced RLS, narrowly granted definer commands and pinned serializable transactions. These definitions do not establish actual role restrictions, effective inherited/PUBLIC privileges or RLS enforcement. Even future catalog inspection can establish configuration only; behavioral RLS and concurrency testing needs separate authorization.

## 7. Quarantined candidate compatibility findings

All findings below come from source review, not PostgreSQL execution or SQL compilation. Candidates were not installed or edited.

1. **Restricted command privilege incompatibility — FAIL offline review.** In `003_restricted_commands.sql`, `hourvia_command` receives SELECT only on `global_users`, `sessions` and `provider_identities`. `hv_command`, running as that definer owner, issues `SELECT ... FOR SHARE` on both `global_users` and `sessions`. PostgreSQL locking SELECT requires UPDATE privilege on at least one column of each locked table in addition to SELECT. The supplied role grants do not provide it, so the intended least-privilege installation cannot execute these checks successfully. Live inherited privileges could mask the defect while violating the intended role isolation. Resolve the locking/privilege/RLS design in a separate candidate review; do not broaden runtime grants or bypass the check. Mock tests do not model this PostgreSQL privilege rule.
2. **Migration order and session dependency — FAIL readiness.** Required order is `000_roles.sql`, generated foundation schema, `002_invariants_security.sql`, then `003_restricted_commands.sql`. The first file retains `SET ROLE hourvia_migration` for the generated schema and security file; the latter resets it. The command candidate requires administrator ownership-transfer/role privileges. These files are deliberately outside active discovery. Merely moving them into a lexicographically sorted migration directory would not preserve this order (the generated timestamp sorts after `002`/`003`) or guarantee session role continuity. Installation also contains its own BEGIN/COMMIT and RESET ROLE; compatibility with any outer migration transaction must be reviewed. No approved installation plan or live migration history exists.
3. **Schema metadata mismatch — FAIL readiness.** `003` adds `invitation_deliveries`, unique `audit_command_correlation` and changes `idempotency_actor_tenant` to DEFERRABLE INITIALLY DEFERRED. These additions are absent from the baseline Drizzle schema/generated snapshot. Reconcile schema metadata and migration ordering before adoption. The deferred membership FK is necessary because acceptance reserves the idempotency claim before inserting membership; acceptance inserts membership before updating the invitation's immediate accepted-membership FK.
4. **Ownership and SECURITY DEFINER prerequisites — UNVERIFIED live.** `003` transfers dispatcher/receipt ownership to a separate NOLOGIN role, uses `pg_catalog` search paths and fully qualified application relations, revokes PUBLIC EXECUTE and removes temporary schema CREATE. `002` helpers/triggers depend on migration ownership and its explicit forced-RLS policy. The installation caller must have the necessary role administration, ownership and SET ROLE capabilities, with runtime unable to inherit or SET either privileged role or replace schemas/functions. PostgreSQL roles can extend beyond a single branch; branch deletion alone is not verified role cleanup. Fixed search paths and static bodies require live ownership/ACL/default-privilege validation before a safety claim. GUC actor/session values remain trusted-server inputs, not cryptographic authentication.
5. **RLS and invariants — UNVERIFIED behavior.** Foundation relations enable and force RLS with runtime SELECT policies, a false baseline policy and explicit migration policies. Command-owner policies intentionally permit privileged command work and must remain isolated from runtime membership. The delivery relation separately enables/forces RLS with command-owner access only. Owner uniqueness, deferred owner-count checks, lifecycle/version triggers and append-only audit protections need PostgreSQL behavioral tests. The false permissive policy alone does not prohibit writes granted by another policy; effective ACLs and role membership remain essential.
6. **Audit/idempotency and delivery — incomplete integration.** Commands propose atomic claim, business mutation, audit receipt and delivery intent on one transaction. Delivery stores identifiers/digest-independent metadata, no raw token. Queue leasing/completion has only TypeScript contracts, no worker implementation or worker privilege model. Secure credential exchange, stable invitation preparation and actual delivery remain absent. Existing unique membership `(organization_id,user_id)` also prevents inserting a replacement membership for a revoked member; re-entry is unsupported and must not be assumed by acceptance clients.
7. **Application/repository compatibility — partial offline only.** The native pool bridge accepts an already-created explicit SDK instance and pins query/release operations; it does not initialize the SDK or verify identity/TLS. The candidate wrapper uses serializable transactions, transaction-local context and DISCARD ALL; those operations are unsuitable for a metadata-only diagnostic runner and require validation against the selected pooled transport. The command application uses receipts/TransactionOutcome, not the older aggregate-save/OrganizationUseCases contract. Discovery, stable invitation preparation, recipient digest/session/verified-email inspection and durable identity/session adapters remain missing. Acceptance requires both aggregate and invitation versions. Live application/repository factories remain hard-disabled.

## 8. Verification gate matrix

PASS means evidence obtained for the named scope. FAIL means an observed defect or failed attempt; UNVERIFIED means required proof is unavailable. An offline PASS never promotes a live gate.

| Gate | Result | Evidence / consequence |
| --- | --- | --- |
| Sprint 4A.2 GitHub baseline | PASS | Public main and merged #14 match local/published commit |
| Project identity and database presence metadata | PASS | Authenticated site GET |
| Database discovery attempt | FAIL | Database GET and branch inventory GET return HTTP 401 |
| Database resource identity | UNVERIFIED | No independent database resource ID |
| Exact connection branch | UNVERIFIED | No authoritative endpoint/credential binding |
| Production deploy branch assignment | PASS | Published assignment is `production`; assignment scope only |
| Production/staging isolation | UNVERIFIED | Protected project; no independent resource/connection proof |
| Disposable verification target | UNVERIFIED | No exact authorized disposable tuple/provenance/teardown |
| TLS certificate validation | UNVERIFIED | No database handshake attempted |
| Runtime role restrictions | UNVERIFIED | No live role/ACL/ownership inspection |
| RLS configuration | UNVERIFIED | Candidate text only; no installed catalog evidence |
| Migration compatibility | FAIL | Order/session assumptions and schema metadata mismatch unresolved |
| Restricted command compatibility | FAIL | Locking SELECT lacks required command-owner UPDATE privilege |
| Integration test authorization | UNVERIFIED | No exact authorized target or resolved prerequisites; execution prohibited |

**Decision: NO-GO for database writes, installation and integration execution.** Read-only PostgreSQL diagnostics are also blocked at identity, independently of later TLS and security gates.

## 9. Validation and execution inventory

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 344 tests across 21 files |
| `npm run check:architecture` | PASS |
| `npm run check:secrets` | PASS for supported patterns |
| `git diff --check` | PASS; new documentation also checked directly for whitespace errors |

Tests are offline existing regressions and controlled doubles/source checks. No new tests mirror this documentation-only change. Platform/GitHub GETs are metadata inspection. Actual PostgreSQL connections: **0**. Executed SQL statements, including read-only SQL: **0**. Integration tests, role/RLS probes, transaction probes, function compilation and installation: **NOT RUN**. Manual production build: **NOT RUN**, as managed validation prohibits manual builds. Automatic build/deployment validation is a separate later delivery step.

## 10. Unresolved blockers and required operator actions

The Team Owner must resolve database API authorization with Netlify using the project/deploy IDs and HTTP 401 category, without sending connection URLs or credentials. Obtain independent database resource identity, full branch inventory and authoritative current runner/deploy-to-connection binding, including production exclusion and execution stability. Ask the platform to explain null/missing preview assignments rather than assuming previews are isolated. Verify supported CA/transport observation and independent restricted credentials.

Retain the staging project in the protected inventory. Any proposed disposable target needs separate exact operator authorization, provenance excluding protected data copies, independent credentials, role-scope assessment and accountable lifecycle/teardown ownership. This sprint authorizes no provisioning/deletion and supplies no disposable target. The operator must resolve the command privilege defect and migration/Drizzle compatibility offline before proposing installation. No SQL can bootstrap the missing independent target proof.

## 11. Recommended next integration step

First obtain the missing platform identity/binding evidence and repair the offline candidate incompatibilities in a separately scoped review. Only then propose a fixed-catalog, server-only read-only collector bound to an exact authorized target and the existing gates. After identity and certificate-verified TLS pass, inspect version, roles, ownership, effective grants, schemas/migrations and RLS catalogs using bounded read-only transactions with rollback. Preserve the unconditional blocker until that collector is reviewed. A later, separately authorized disposable installation/security/concurrency sprint is required for behavioral RLS, commands, invariants, rollback and durable receipts; it is outside Sprint 4B.

## 12. Managed delivery status

Prepared this report and a standalone managed delivery description. Agent Runner owns GitHub commit/review and deployment handling. No direct commit, push, review creation, merge or manual deploy was attempted. A managed review URL and automatic build/deployment result are unavailable in this session. No workflows, authentication, business endpoints, persistence, invitation email, monitoring or payroll were activated. No database was provisioned/deleted and no migration or write SQL ran. Work stops after Sprint 4B.
