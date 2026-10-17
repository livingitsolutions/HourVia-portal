# Sprint 2.2C — Netlify Database verification preflight

2026-10-17. **GO for review of the offline preflight documentation; NO-GO for provisioning, connections, SQL execution or managed integration.** No resources were created, connected to, queried, migrated, deleted or deployed. Platform gaps remain UNVERIFIED and execution stops at that boundary.

## 1. Verified baseline commit

Public GitHub branch API `https://api.github.com/repos/livingitsolutions/Hourvia-V3/branches/main` returned `352389499477498c5d2aa423860640c54cab27eb`, matching local HEAD and the supplied deployment context. Public pull API `https://api.github.com/repos/livingitsolutions/Hourvia-V3/pulls/6` confirmed `merged: true`, the same merge commit and title “Netlify database compatibility hardening for Hourvia V3”. Local merge parents are Sprint 2.2A `dadb69ca9e892960e4b1902b299e05e866fa9c3d` and Sprint 2.2B implementation `e4388fec6ccea3f8b6bc6ee7dedcafebe93f4695`. Initial working tree was clean. `git ls-remote` is disabled by the runner; public HTTPS supplied current-main evidence without a PAT.

Reviewed the prior attempt history, Sprint 2.2B report, managed authorization/observation/teardown contracts, TLS policy, quarantined transaction adapter and tests, security matrix, local disposable runner and safeguards, installed SDK declarations/source and CLI database implementation. Existing application behavior, candidates and 193 tests were preserved. No runtime or executable diagnostic was added because authoritative collectors and platform guarantees remain unverified.

## 2. Files changed

- `docs/db-verification-readonly-runbook.md`: operator approval boundaries, isolated setup, evidence requirements, fixed diagnostic design, stop conditions and later teardown procedure.
- `docs/sprint-2.2c-report.md`: baseline, supported platform findings, validation and go/no-go assessment.
- `.netlify/results.md`: standalone delivery summary for the managed runner.

No changes to application code, dependencies, existing tests, SQL, configuration or `.github/workflows/`.

## 3. Verification project setup procedure

Proposed project: **hourvia-v3-db-verification**, separately owned and identified in Living IT Solutions, with a dedicated new database and independently issued credentials. No protected data, copied snapshots, shared application credentials or staging preview branches are acceptable. The existing staging project has a database; it is protected, not disposable.

The [operator runbook](db-verification-readonly-runbook.md) defines three distinct approvals: provisioning after platform blockers are resolved, read-only diagnostics after exact target evidence is available, and later destructive platform teardown. No approval is requested or inferred in this offline sprint. The UI manual database creation route is documented; an empty-project creation/removal flow without an unapproved deploy is still UNVERIFIED. Do not create resources while that or other prerequisites remain unresolved.

## 4. Provisioning and teardown findings

VERIFIED below means supported by retrieved official documentation or inspected installed source, not exercised against an account or database. All official references below were retrieved over HTTPS on 2026-10-17; no authenticated Netlify API, database or credential endpoint was invoked.

| Capability | Classification | Finding |
| --- | --- | --- |
| Manual database provisioning | VERIFIED, documentation | Getting started: project Data & Storage > Database > Create a database manually. Avoid code-first deploy/migration activation. |
| REST provisioning | VERIFIED, documentation | `POST /sites/{site_id}/database`, optional region; 201 new or 200 existing; response contains credentials. Creation is not a read-only identity check. |
| REST connection retrieval | VERIFIED, documentation | `GET /sites/{site_id}/database` and branch GET return connection strings, not the complete required identity/ownership tuple. Not called or logged. |
| Full database deletion | VERIFIED, documentation | Dashboard dedicated deletion section, Team Owner only; removes all data across branches and snapshots irreversibly. Actual operator access and cleanup evidence UNVERIFIED. |
| Full database DELETE REST method | UNVERIFIED | Reviewed API reference documents branch/snapshot deletion, not complete database deletion. No endpoint inferred. |
| Branch deletion | VERIFIED, documentation | `DELETE /sites/{site_id}/database/branch/{deploy_id}`; insufficient for whole database teardown. |
| Credential revocation / global-role removal | UNVERIFIED | No complete supported issuance/revocation/cleanup proof established. Database data deletion is not sufficient evidence for these claims. |
| Empty project creation/removal without deploy | UNVERIFIED | Supported account-specific operator procedure requires confirmation before resources are created. |
| Plan eligibility / permissions | UNVERIFIED for proposed project | Overview states Credit-based plans only; supplied staging plan does not prove new-project eligibility. Confirm with Team Owner. |
| CLI init/connect/status/reset safety | UNSUPPORTED for this gated workflow | CLI init can scaffold, apply starter migrations and query; connect uses ambient URL/local state or starts a local database; JSON without query prints credentials. Status can resolve connection data; reset is local, not remote teardown. None invoked. |

The runbook documents the supported UI deletion procedure, verification of database absence and required provider cleanup confirmation. It explicitly stops if credential/role cleanup cannot be established. No claim of safe end-to-end teardown is made.

Official references:

- [Database overview](https://docs.netlify.com/build/data-and-storage/netlify-database/): eligibility, automatic provisioning and preview copies.
- [Getting started](https://docs.netlify.com/build/data-and-storage/netlify-database/getting-started/): manual UI creation and CLI initialization side effects.
- [API reference](https://docs.netlify.com/build/data-and-storage/netlify-database/api/): SDK interfaces, own-driver support and site-scoped REST routes.
- [CLI reference](https://docs.netlify.com/build/data-and-storage/netlify-database/cli/): local operations and credential-bearing options.
- [Dashboard](https://docs.netlify.com/build/data-and-storage/netlify-database/dashboard/): complete database deletion across branches/snapshots.
- [Access control](https://docs.netlify.com/build/data-and-storage/netlify-database/access-control/): Team Owner deletion rights and Developer read-only production connection option.
- [Tooling](https://docs.netlify.com/build/data-and-storage/netlify-database/tooling/): ORM/driver integration.

Inspected installed CLI database source directly, without invoking commands or importing their modules. The implementation accepts an ambient database URL and can start a local database, so it must not be treated as an exact-target, fail-closed read-only connector. This narrows the earlier report's interface assessment; it does not change existing guards.

## 5. Target identity requirements

Before any connection, require authoritative team ownership and the exact project/database/branch/physical-name/hostname tuple, new-resource provenance, complete protected inventory, disposable label, teardown owner and fresh explicit approval. Reject staging project `368baa52-efc2-4775-ba46-da764d51ec2b`, all protected database IDs/hosts and shared credentials. SQL identity, certificate hostname and project slug alone cannot establish resource ownership. Standard connection-string API responses do not establish the missing immutable resource mapping; a supported collector remains UNVERIFIED.

Existing gates keep their five-minute authorization, one-minute provenance and five-second observation windows. A provider branch named `production` does not identify an application production target when the enclosing disposable project/database is independently verified. Do not relax physical-name, protected-target or loopback rules.

## 6. TLS and credential policy

No hardcoded credentials, ambient fallback, connection-string logging, raw driver/API errors, certificate bypass or plaintext fallback. The future server-side client must use the existing explicit TLS policy with chain and hostname validation, SNI and approved endpoint, with bounded acquisition/statement/lock/idle/overall duration. URL query overrides are rejected. Supported custom CA behavior, client-side TLS observation and actual endpoint certificate validation remain UNVERIFIED. Server `pg_stat_ssl` alone cannot prove client certificate validation.

The installed SDK accepts connection-string/debug options but not the explicit TLS policy; own-driver integration is documented. No client is instantiated and no dependency is added. Independent role-specific credentials must stay in a supported secret mechanism, outside logs, tracked artifacts and approval records.

## 7. Read-only diagnostic design

The linked runbook supplies an ordered evidence/transport/catalog/context/close workflow, fixed read-only inspection catalog, interpretation requirements and failure handling. It is intentionally documentation only. No executable connection entry point is exposed while platform support is incomplete; `requireManagedCollectors()` remains an unconditional blocker.

A future explicitly authorized reviewed runner uses pinned `BEGIN READ ONLY` transactions with acknowledged `ROLLBACK`, fixed built-in/catalog reads, restricted independent logins and cancellation. It inspects version, exact SQL identity, role memberships/privileges/ownership, RLS metadata and complete freshness inventory. Only explicitly approved transaction-local synthetic context settings change transient session state; no objects or rows change. It assesses rollback reset and observed pool reuse without assuming backend affinity. It never calls the transaction candidate, local integration runner, arbitrary SQL, migrations, fixture setup or cleanup SQL. Insufficient evidence is UNVERIFIED and stops the run.

Freshness checks must detect all unexpected schemas, relation kinds, types, routines, extensions, Hourvia roles, migration state and other sessions. Provider baseline exceptions require separate review. No catalog-only test proves new-resource provenance. Safe teardown capability is established through pre-connection platform evidence, never a destructive test.

## 8. Role and RLS capability assessment

| Requirement | Assessment |
| --- | --- |
| Independent restricted runtime/migration logins and issuance | UNVERIFIED; Netlify team roles and read-only connection options do not establish PostgreSQL role separation. |
| Runtime lacks superuser/BYPASSRLS/ownership/elevation | UNVERIFIED; future catalog/membership/default-grant/SECURITY DEFINER inspection required. No impersonation or superuser fallback. |
| Migration ownership, permitted bootstrap operations and global-role scope | UNVERIFIED; catalog privileges cannot prove provider policy or safe role lifecycle. No role creation attempted. |
| RLS / FORCE RLS suitability | PostgreSQL catalog inspection designed; managed capability and enforcement UNVERIFIED. Empty tables/policies are not passing evidence. FORCE RLS does not constrain superuser/BYPASSRLS. |
| Transaction-local settings and pool reset | UNVERIFIED on target; rollback-only synthetic context probe designed. Successful-COMMIT and concurrency evidence remain outside this sprint. |
| Credential revocation and role cleanup | UNVERIFIED; supported confirmation is required before provisioning. |

No capability is marked UNSUPPORTED merely because it has not been tested. No positive synthetic evidence is substituted into `verifyManaged`; its all-capabilities requirement remains intact. Live RLS denial tests and production readiness are not established.

## 9. Offline test results

| Check | Actual result |
| --- | --- |
| `npm run typecheck` | PASSED |
| `npm run lint` | PASSED |
| `npm test` | PASSED: 193 tests, 12 files, zero skips; existing suite unchanged |
| `npm run check:architecture` | PASSED |
| `npm run check:secrets` | PASSED for supported patterns; not an exhaustive credential audit |
| `git diff --check` | PASSED |
| Workflow changes | None; `.github/workflows/` untouched |
| PostgreSQL integration tests | **NOT RUN** |
| Production build | **NOT EXECUTED**; runner prohibits build commands; platform validation is separate |

## 10. Remaining platform blockers

Authoritative immutable identity and ownership mapping; new-project eligibility and creation/removal without automatic deployment; independent credential issuance/revocation; confined PostgreSQL role scope and migration ownership; client TLS observation and backend affinity; effective limits/cancellation; managed catalog freshness baseline; and complete confirmed database/role/credential teardown remain unresolved. Read-only observations cannot establish actual DDL or behavioral RLS correctness. Resolve support through authoritative platform evidence before approving creation; do not provision as an experiment to discover teardown capability.

## 11. Operator approval requirements

Require the distinct, exact-resource provisioning, diagnostic and teardown approvals described in the runbook. A later code review must supply authoritative collectors and an enforced bounded runner before any connection. Approval must name the operator, Team Owner/cleanup owner, protected inventory, permitted operations, reviewed commit, evidence sources and expiry. This report is not a resource authorization. No user permission is needed to complete this offline documentation and validation; no provisioning or live approval is solicited here.

## 12. Go/no-go and delivery

**GO for review of Sprint 2.2C offline preflight; NO-GO for resource creation, managed diagnostics, integration execution, migrations, adapter activation or production readiness.** Stop on the UNVERIFIED platform boundary. No authentication, business APIs, monitoring, workflows or application behavior changed. No PATs, direct Git writes, automatic merge or manual deployment occurred.

Changes were prepared for Netlify Agent Runner's supported managed pull-request workflow through workspace files and the delivery summary. No direct commit or pull-request creation was attempted; a managed delivery URL/status is not available within this run. Work stops after Sprint 2.2C.
