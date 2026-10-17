# Sprint 2.2D — Netlify Database initialization and isolation review

2026-10-17. **NO-GO for live diagnostics, further provisioning, migrations or business persistence.** Native Netlify Database already exists on the project. Read-only platform inspection established production and one preview branch assignment, including a match to the runner selector, but did not establish the connection URL's binding to that branch. GitHub main also lacks Sprint 2.2C. No database connection or SQL was executed.

## 1. Verified GitHub baseline

The public GitHub branch API returned main at `352389499477498c5d2aa423860640c54cab27eb`, titled “Merge pull request #6 from livingitsolutions/agent-for-hourvia-v3-4cf6”. This is the Sprint 2.2B baseline. The contents API for `docs/sprint-2.2c-report.md?ref=main` returned HTTP 404. Consequently, **the requested main-includes-Sprint-2.2C prerequisite is not satisfied**. Local HEAD is `b2bc4e24d7c36595470267be4b6e74ddf98c91a5` (“Agent runner [skip ci]”) and contains the Sprint 2.2C documentation; local presence is not proof of a merge to main. Initial working tree was clean. The runner disables `git ls-remote`; public HTTPS supplied evidence without a PAT. No Git writes were attempted.

Reviewed both prior attempt histories, database assessment and prior sprint reports, read-only runbook, managed authorization/TLS/harness contracts, transaction protocol and candidate, security matrix, disposable-target gate, schema and quarantined role/security/generated migration candidates. Existing managed execution still rejects this staging project and requires authoritative collectors. This sprint did not relax those gates or run the disposable harness on a managed branch.

## 2. Netlify Database initialization status

**Already present at project level; no initialization command executed.** An authenticated, read-only site metadata GET confirmed project `368baa52-efc2-4775-ba46-da764d51ec2b`, name `hourvia-v3-staging`, and database presence. This establishes availability on this actual project, beyond generic plan eligibility. Database health, schema state and full resource inventory remain unverified.

Installed interfaces: `@netlify/database` 2.0.1, `drizzle-orm` 1.0.0-beta.22, `drizzle-kit` 1.0.0-beta.22, and available CLI package 27.12.0. Node 22.23.3 satisfies the SDK's minimum Node 22.12 requirement. The CLI is outside the shell PATH; its installed source was inspected without invoking database commands. No dependencies changed. The native SDK's transitive Neon driver is not the legacy Netlify Neon extension; no legacy extension was installed or invoked.

Official getting-started documentation supports package-based setup with deployment-time provisioning, the interactive `netlify database init` scaffold, and manual creation under the project's Data & Storage > Database page. The installed initializer defaults to creating starter schema/seed migrations in non-interactive execution and can apply/query them through its connection helper. That violates this sprint's no-schema/no-seed constraints, so it was not run. The existing package installation already supplies the native SDK; repeating setup is unnecessary.

No database POST, branch POST, migration generation/application, local database startup, deploy or seed operation occurred. The quarantined Drizzle output path stayed unchanged and no active application migrations were created.

## 3. Production database resource status

The live site GET identified the published production deploy `6ad2e42ab56825e4ed546181`, main commit `352389499477498c5d2aa423860640c54cab27eb`, and database branch identity `production`. The database and that assignment predated this run. No production resource was provisioned, changed, connected to or queried. Metadata does not establish whether production contains application data or tables.

## 4. Agent Runner database branch identity

The runner selector was present and was not `production`; the supplied project identity matched the expected site. A comparison performed in memory matched the runner selector to a deploy branch, then a supported individual deploy metadata GET established the following assignment:

| Evidence | Observed result |
| --- | --- |
| Deploy | `6ad2e5fbaa750b1dcb2927e6` |
| Project | `368baa52-efc2-4775-ba46-da764d51ec2b` |
| Deploy context | `deploy-preview` |
| Assigned database branch, from deploy API | `agent-6ad2e48b86b09853cc8d07` |
| Runner selector matches assigned branch | Yes |
| Assigned branch differs from production | Yes |

No environment values or connection strings were printed or recorded; the branch identity above comes from the deploy API. This establishes the runner selector's correspondence to an assigned non-production branch. It does **not** prove that this run's ambient connection URL resolves to that branch, nor that a historical deploy's context establishes a new current deploy assignment. Exact database/endpoint-to-branch binding remains UNVERIFIED. No credentials endpoint was called and no client was instantiated.

## 5. Deploy Preview branch isolation evidence

Individual deploy GETs, rather than the abbreviated deploy list, supplied branch metadata:

| Deploy | Context | Database branch |
| --- | --- | --- |
| `6ad2e5fbaa750b1dcb2927e6` | deploy-preview | `agent-6ad2e48b86b09853cc8d07` |
| `6ad2e7117b4cafb02a3fbbaf` | deploy-preview | null |
| `6ad2e42ab56825e4ed546181` | production, published site metadata | `production` |

One preview's assignment is demonstrably separate from production. The other preview has no assigned branch in returned metadata; this is not evidence of production fallback or of isolation. Physical isolation and connection routing for every preview remain unverified. Official documentation describes automatic isolated preview copies of production; copied production data must not be assumed disposable or empty. No branch was created to test the claim.

## 6. Connection and TLS findings

**Live connection/TLS verification: NOT RUN.** An ambient database connection setting exists, but its contents were not printed or persisted. SDK source selects an explicit connection string or the ambient database URL; it does not validate the runner branch selector against authoritative metadata. Its driver selection also depends on environment. A selector match alone cannot prove the URL is non-production. The SDK throws when its URL is missing; that is not an exact-target production exclusion guarantee.

The CLI connection helper accepts ambient overrides or persisted local connection state and can start a local database. It is unsuitable as an unreviewed identity collector here. No `connect`, `status`, initializer or SDK connection method was invoked. The absence of SQL entry points in this change prevents a new test operation from falling back to production; a generally safe managed connector is still not implemented.

Existing TLS policy requires certificate-chain and hostname validation, explicit approved host, no URL overrides, no plaintext fallback, and bounded connection/statement/lock/idle/overall timeouts. It was preserved. The SDK options do not expose that complete explicit TLS configuration. Actual certificate validation, endpoint identity, negotiated TLS and client timeout behavior remain UNVERIFIED.

## 7. PostgreSQL role and privilege findings

**NOT RUN.** PostgreSQL version, current database/user, role memberships, ownership, schema/database privileges, role elevation, independent runtime/migration credential issuance and effective restricted-role behavior remain UNVERIFIED. Netlify team roles do not prove PostgreSQL role restrictions. No role was created, altered or impersonated.

## 8. RLS compatibility findings

**Live compatibility/enforcement: UNVERIFIED.** Quarantined candidates request restricted roles, RLS and FORCE RLS. Actual server capabilities, table ownership, BYPASSRLS/superuser status, policies and behavioral cross-tenant enforcement were not inspected. FORCE RLS does not constrain superuser/BYPASSRLS roles. No tables or policies were created and no security fixtures ran. Catalog inspection alone would not establish enforcement correctness.

## 9. Transaction and COMMIT findings

Installed declarations/source and official API documentation support `getDatabase()`, `pool.connect()`, explicit SQL transactions and a pinned query/release client. The SDK does not declare a callback `db.transaction()` method. Transaction work must remain on one pooled client; independent HTTP/tagged SQL statements do not establish affinity. These are interface findings, not live results.

The existing candidate preserves transaction-local security context, bounded retries, exact COMMIT command-tag checks, rejection of returned ROLLBACK as success, uncertain-outcome handling and durable reconciliation requirements. It remains quarantined. Read-only transactions, transaction-local context reset, physical backend affinity, pool reuse, actual COMMIT/ROLLBACK results and transport-loss behavior were **NOT RUN**. No successful-COMMIT claim follows from offline mocks.

## 10. Files changed

- `docs/sprint-2.2d-report.md`: actual platform evidence, baseline failure, initialization boundaries and remaining blockers.
- `.netlify/results.md`: standalone delivery summary.

Application code, dependencies, schema candidates, existing tests, Netlify configuration and `.github/workflows/` were unchanged. No authentication, business endpoint or monitoring activation occurred. No commits, direct pull requests, merges or deployments were attempted; delivery remains managed by the runner.

## 11. Test results

| Offline check | Actual result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS: 193 tests across 12 files; no skips |
| `npm run check:architecture` | PASS |
| `npm run check:secrets` | PASS for supported scanner patterns |
| `git diff --check` | PASS |

**Actual database verification is separate:** authenticated platform metadata reads succeeded; database connections, PostgreSQL diagnostic queries and integration tests were **NOT RUN**. Offline passes establish no live PostgreSQL security guarantee.

## 12. Production build status

**NOT EXECUTED.** Runner instructions prohibit build commands. Automatic platform build validation is separate and its result was unavailable during this report.

## 13. Remaining security blockers

Main must include the reviewed Sprint 2.2C baseline. Before any SQL, obtain supported authoritative evidence binding the exact runner/preview connection endpoint and database to a non-production branch, reject missing/null/production identity without fallback, and retain a fresh exact-target check. Resolve the preview with null branch metadata without assuming its target.

The existing managed verification harness still rejects this staging project, even for a selector assigned to its preview. This sprint does not authorize weakening that harness or treating copied production data as disposable. A separately reviewed read-only diagnostic path would need exact branch/connection provenance and explicit approval compatible with existing safeguards. Verified client TLS, restricted role separation, effective bounded timeouts and the required transaction/RLS evidence remain absent. Do not use the existing mutating integration harness to collect read-only diagnostics.

## 14. Explicit production migration impact

**This change has no production migration payload:** no active migrations were added, changed or applied, and no SQL or resource mutation was executed. The production resource already existed; schema/data contents were not inspected. No experimental changes were promoted.

For a project without a database, the supported manual creation action or database provisioning POST creates a managed project database, including its production resource; package-based deployment can also provision and apply discovered active migrations. That production provisioning effect is not approved by this report or inferred from the initialization request, and no such action was taken. Branch creation may copy production data and is also outside this run's actions. Re-running the installed initializer additionally risks schema replacement and starter/seed migration creation/application; it is not an acceptable no-schema initialization shortcut.

## 15. Go/no-go recommendation

**GO for review of this evidence report; NO-GO for declaring Sprint 2.2D fully verified, live SQL, further provisioning, migrations or business persistence.** Project-level native Database availability, production branch metadata and one runner-correlated preview assignment were established. Main's missing Sprint 2.2C baseline, incomplete connection binding and a null preview branch assignment prevent the requested full verification. Stop here; no business persistence or later sprint work begins.

Official references retrieved on 2026-10-17: [Getting started](https://docs.netlify.com/build/data-and-storage/netlify-database/getting-started/) and [API reference](https://docs.netlify.com/build/data-and-storage/netlify-database/api/). Read-only platform sources: site GET, deploy list GET and individual deploy GETs under `https://api.netlify.com/api/v1/`; public GitHub main branch and contents APIs. Responses were filtered in memory to non-secret metadata; raw authenticated responses were not printed or saved.
