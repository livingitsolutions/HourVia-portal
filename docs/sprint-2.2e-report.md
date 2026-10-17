# Sprint 2.2E — Database branch isolation verification

2026-10-17. **NO-GO for PostgreSQL access or an isolation VERIFIED claim. GO for review of offline safeguards.** No PostgreSQL connections, SQL, migrations, transaction tests, provisioning, deletion or data writes occurred. PostgreSQL integration tests: **NOT RUN**. This sprint grants no diagnostic execution approval.

## 1. Verified GitHub baseline

**VERIFIED:** public GitHub `GET /repos/livingitsolutions/Hourvia-V3/branches/main` returned `19b61f147ea4d8b9d117d06b3407763ceb615eb4`, matching local HEAD and live published main. `GET /repos/livingitsolutions/Hourvia-V3/pulls/8` returned merged=true, base=main and that exact merge commit. The main contents API returned HTTP 200 for `docs/sprint-2.2d-report.md` (blob `7680a815d3017251bad6cabb27b6e884936131ef`). Thus PR #8 and Sprint 2.2D are present. The earlier baseline failure in the historical 2.2D report is not a current finding.

Reviewed Sprint 2.2B/C/D reports, the read-only verification runbook, managed authorization/identity/teardown contracts, TLS policy, managed preparation and unconditional execution blocker, and installed SDK declarations/source. Initial working tree was clean. No direct Git writes or PATs were used.

## 2. Existing Netlify Database configuration

**VERIFIED, platform metadata:** authenticated `GET /api/v1/sites/368baa52-efc2-4775-ba46-da764d51ec2b` confirms project `hourvia-v3-staging`, exact project ID `368baa52-efc2-4775-ba46-da764d51ec2b`, and database presence. This is a protected application project, not an authorized disposable target. An exact independent database resource ID remains **UNVERIFIED**; the site ID and branch identifier do not substitute for it.

Installed `@netlify/database` 2.0.1 exposes `getDatabase({ connectionString, debug })`, `getConnectionString()`, server/serverless pools and the connection-string getter. No SDK method or constructor was invoked. No dependency/configuration changes occurred. Build commands were prohibited and were **NOT RUN**; automatic platform build validation is separate.

## 3. Production database branch identity evidence

**VERIFIED, assignment only:** the live site response identifies published deploy `6ad2ef0d3df5f6796b8178ef`, main commit `19b61f147ea4d8b9d117d06b3407763ceb615eb4` and branch ID `production`. An independent individual deploy GET confirms the same project, production context and branch ID. This is authoritative deploy assignment evidence; it does not establish the actual endpoint, credential scope, immutable backend resource or data contents.

## 4. Agent Runner and Deploy Preview evidence

**VERIFIED, limited observation:** the current execution is Agent Runner. Presence checks establish that a database selector and ambient connection setting exist; the selector is not exactly `production`. No environment values are reproduced. Comparing the selector in memory against individual deploy responses found **no match** in the 30 most recent deploys. The current runner's platform-validated branch ID and deploy context therefore remain **UNVERIFIED**. A historical selector match from Sprint 2.2D is not current evidence.

Sources: site deploy list GET with `per_page=30`, followed by individual `GET /api/v1/deploys/{id}` for all 30 entries. All individual responses identify the expected project. The inventory is bounded, not a claim about every historical or future deploy.

**VERIFIED preview assignments in this sample:**

| Deploy | Assigned database branch ID |
| --- | --- |
| `6ad2ec7e22f09c70eebfcb77` | `agent-6ad2eb8556997b76287e64` |
| `6ad2ea4fc003cc836ba1ba48` | `agent-6ad2e48b86b09853cc8d07` |
| `6ad2e899c1c7fb35fd2c48e3` | `agent-6ad2e48b86b09853cc8d07` |
| `6ad2e5fbaa750b1dcb2927e6` | `agent-6ad2e48b86b09853cc8d07` |
| `6ad2e2ca4d7caecb6f5486ea` | `agent-6ad2e0f13ea95cb11b5b4c` |
| `6ad2ddbc525a65adb1613fe7` | `agent-6ad2dc6195f7a08bbee880` |
| `6ad2d9a94dc5ac2066e8bb18` | `agent-6ad2d81bc1984341a72c4a` |
| `6ad2d3d59feebc695b268c17` | `agent-6ad2d08044e1a5dcbff588` |

**VERIFIED missing/null assignment observations:** preview deploys `6ad2ed621060b4c67bf35d29`, `6ad2eaedfc6b68365b2624e8`, `6ad2e9aafb4d6fa08dbe2323`, `6ad2e7117b4cafb02a3fbbaf`, `6ad2e35c2d77a8ba4917e1f1`, `6ad2de327999c4a22054f530`, `6ad2da07a39997a176a44fb4`, `6ad2d46257bf69a6c0a77966`, `6ad2cb9cb2b18b34c548b44c`, `6ad2cb5a8896116c523f701d`, `6ad2c72f61a6558fed215f26`, `6ad2c71a303459fc3d91ebe2`, and `6ad2c0eeca237a72c104e145` return null or absent branch metadata. The collection normalizes absence to null, so it does not distinguish those two cases. These findings prove neither isolation nor production fallback. Every such state must block access.

## 5. Actual connection-to-branch binding evidence

**UNVERIFIED.** No authoritative mapping of the current ambient connection to an exact project/database/non-production branch tuple was obtained. No endpoint or credential scope was inferred from names, labels or URL shape.

The installed Netlify OpenAPI specification documents `GET /sites/{site_id}/database/branches` (`listSiteDatabaseBranches`). Its response schema includes branch ID, state, connection string and metadata. An authenticated read-only request to that supported route returned **HTTP 401**, despite successful site/deploy reads with the available authentication. No usable inventory or credential response was received. The response body was not logged. No alternate credentials, credential-specific endpoint or undocumented route was attempted. This does not prove the route is universally unavailable or that the database is absent.

Even a successful branch inventory with an exact in-memory URL comparison would only support a point-in-time mapping. The inspected schema supplies no guaranteed independent database resource ID, assignment revision lease, immutable execution binding, credential scope attestation or exclusion of server-side production fallback. No credential comparison was possible in this run. A repeated metadata read or timestamp alone cannot eliminate replacement between check and use.

**STOP boundary:** missing authoritative binding prevents any database access. No PostgreSQL observation can be used to bootstrap the required independent identity proof.

## 6. Unsupported or unavailable capabilities

| Requirement | Classification | Evidence and limit |
| --- | --- | --- |
| Site/deploy assignment metadata | VERIFIED | Authenticated supported GETs; assignment only |
| Branch inventory for current credentials | UNVERIFIED / unavailable in this run | Supported route returned 401 |
| Branch credential retrieval interface | VERIFIED interface only | Installed OpenAPI documents branch GET returning connection string and metadata; not called |
| SDK project/database/branch attestation | UNSUPPORTED by installed SDK interface | Options/exports contain no identity attestation API |
| SDK immutable branch selection or assignment lease | UNSUPPORTED by installed SDK interface | No branch/revision/lease option; explicit URL is not backend immutability proof |
| Full platform resource identity, no fallback, replacement exclusion | UNVERIFIED | No authoritative account-specific evidence obtained |
| Explicit complete TLS policy via SDK options | UNSUPPORTED by inspected options | Existing independent pg TLS builder remains preserved; effective TLS not tested |

SDK source reads the ambient URL when no override is given. Its serverless HTTP helper re-reads that value and refreshes its client on change; pools capture the initial URL, while connection getters re-read it. Thus ambient URL use supplies no stable target contract across interfaces. Missing URL throws rather than explicitly selecting production, but this is not proof that a supplied URL excludes production. No claim is made that production fallback actually occurred.

## 7. Offline implementation changes

Added `db/verification/branch-binding.ts`, a pure evidence-validation contract requiring an exact expected project/database/branch, unique database resource, non-production assignment, matching selector, short-lived evidence, authoritative connection binding, matching assignment revision, available credential/connection evidence, supported behavior, excluded production fallback and immutability for execution. Missing, mismatched or ambiguous evidence throws fixed error codes without including supplied values.

Added `db/tests/branch-binding.test.ts` with synthetic evidence only. Success validates contract completeness and **does not** authenticate assertions, establish live isolation or authorize access. No authoritative collector or diagnostic connector exists. The unconditional `requireManagedCollectors()` blocker and all existing authorization, protected-project, TLS, identity, read-only planning and teardown safeguards remain intact. The new contract has no runtime activation or call path into a connection.

## 8. Regression test results

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS: 215 tests across 13 files, no skips; 22 new cases |
| `npm run check:architecture` | PASS |
| `npm run check:secrets` | PASS for supported patterns |
| `git diff --check` | PASS |

Secret scanning covers supported patterns, not every possible disclosure.

New cases cover correct synthetic preview (with managed execution still blocked), production selection, missing metadata, wrong project, ambiguous/wrong database, stale/future/expired assignment, missing or unauthoritative endpoint binding, unsupported SDK behavior, unavailable credentials/connection metadata, unexpected production fallback, silent branch replacement, changed revision, wrong endpoint tuple, selector mismatch and missing evidence source.

PostgreSQL integration tests: **NOT RUN**. No transaction test or live SQL was executed. Offline mocks prove no live routing, TLS, roles, RLS or cleanup behavior.

## 9. Remaining security blockers

The exact current runner branch and independent database resource ID are unavailable. Connection scope, production exclusion and replacement prevention remain unproven. Preview assignments include missing metadata. Existing managed authorization independently rejects this staging project, and preview data may copy production. Effective TLS, restricted independent credentials, target identity, bounded execution and cleanup remain unverified. No existing safeguard may be bypassed because a preview has a non-production label.

## 10. Separately approved read-only diagnostics

**Not eligible for an execution proposal against the current target.** A future proposal first needs supported independent connection binding and replacement prevention, an authorized target compatible with the protected inventory, all existing safeguards, a reviewed collector and separate explicit approval. This sprint supplies none of that approval. The mutating disposable integration harness is unsuitable for read-only diagnostics.

## 11. GO / NO-GO

**GO** for review of this report and offline contract/tests. **NO-GO** for declaring Agent Runner or Deploy Preview connections authoritatively isolated, PostgreSQL diagnostics, migrations, provisioning or runtime activation. Baseline and assignment observations are VERIFIED; actual connection isolation is UNVERIFIED; required binding interfaces are UNSUPPORTED by the installed SDK.

## 12. Exact next operator action

The Netlify Team Owner opens a Netlify support request for project `368baa52-efc2-4775-ba46-da764d51ec2b`, supplies the non-secret deploy IDs above, and requests (1) a supported explanation/remedy for the branch inventory 401, (2) authoritative current Agent Runner assignment and exact database resource identity, (3) a supported endpoint/credential-to-branch attestation with explicit production exclusion and immutable execution binding, and (4) explanation of previews with null assignments. Do not send credentials or connection URLs. If guarantees are unavailable, retain NO-GO; do not test them with SQL. Any new isolated verification project or diagnostic requires its own previously documented approval process.

No workflows, authentication, business APIs or monitoring were changed or enabled. No commits, direct pull requests, merges or manual deploys were attempted. Delivery is delegated to Agent Runner's managed mechanism; its resulting URL/status is unavailable in this run. Work stops after Sprint 2.2E.
