# Sprint 4B.2 — Preview runtime database binding preflight

2026-10-17. **NO-GO for PostgreSQL connections, writes, migrations, and integration testing.** Phase 1 did not establish an operational supported mechanism that met the complete binding requirement for this preview. The requested limitation-report alternative was taken. No diagnostic Function was added, deployed, enabled, or invoked. This was a preflight result, not live runtime verification.

## 1. Verified baseline

Public GitHub main returned HTTP 200 at `dcfab8eec40096441dc7ce2ab4b277c39749916d`, with subject identifying the merge of PR #15. Local HEAD remained `615be809e07e044e6e58770cc7ac494ef4cc28f1`, decorated as `agent-for-hourvia-project-6b6e` and its remote tracking branch. The local checkout was not asserted to equal current main. Public main's Sprint 4B.1 report, quarantine installation manifest, and compatibility test file each returned HTTP 200 and matched local contents by SHA-256 comparison. These checks established those baseline artifacts, not a whole-repository equality claim. No Git writes occurred.

Reviewed Sprint 4B and 4B.1 reports, the database adapter assessment, read-only verification runbook, existing branch/managed/TLS gates, and the previous verification findings in this conversation. The previous run's transient results file was absent at this run's start. Sprint 4B.1 remained an offline candidate repair with no live installation or role enforcement claim. The existing managed harness remained unconditionally blocked, and its disposable-target authorization explicitly excluded this staging project. It was not repurposed or weakened for preview inspection.

## 2. Supported runtime capabilities

The published Functions API documented trusted invocation context fields for site ID, deploy ID, deploy context, and publication status. It also documented platform-verified `context.user` for project privacy/team-login protection; arbitrary client headers could not substitute for it. Basic password protection did not provide that user identity. These capabilities could establish invocation identity and support operator access controls, but did not attest a database target. Team-login protection, an approved operator allowlist, and a protected invocation were not verified for this site.

The installed `@netlify/database` 2.0.1 declarations and implementation were inspected without importing or initializing the SDK in this sprint. The SDK exposed `getConnectionString()` and `getDatabase({ connectionString?, debug? })`. Connection objects exposed a driver discriminator, SQL interface, pool, connection string, and a serverless HTTP interface where applicable. No database resource ID, branch ID, assignment revision, or signed binding attestation was exposed. Automatic environment selection was documented but was not accepted as independent target evidence. The SDK's options did not expose explicit TLS policy configuration. The project did not have a directly installed `@netlify/functions` package; no dependency was added for an unimplemented Function.

## 3. Binding mechanism and observed limitation

The database API documented a supported partial approach: authenticated GET `/sites/{site_id}/database/branch/{deploy_id}` returned a deploy-specific connection string. A successful response could provide a control-plane reference for a private in-memory comparison with the SDK-selected URL. This was a real documented interface, not an invented SDK method. Its documented response did not include a database resource ID or immutable branch ID/assignment revision. The SDK alone could not supply those missing assertions.

A fresh read-only authenticated site deploy listing returned HTTP 200. It identified Preview #15 as deploy `6ad3073c7999c4a220598fbf`, context `deploy-preview`, state `ready`, on the expected Git branch. Its database branch identifier was absent. The documented deploy-specific database GET for that exact site/deploy returned **HTTP 404**, reproducing the earlier blocker. No response body, credentials, or connection URLs were printed or persisted. No provisioning POST was used to repair discovery.

This established neither the runner's nor a deployed Function's connection binding. It did not invalidate the operator's dashboard evidence. No documented complete resource → immutable branch → deploy → endpoint chain was obtained for this target. Running the same lookup inside a Function was not assumed to resolve a control-plane 404 or supply additional attestation.

## 4. Exact evidence required before implementation

A reviewed implementation would need all of the following from supported platform sources:

- Trusted Function invocation site/deploy identity, matched to an exact approved preview deploy.
- Authenticated control-plane confirmation of site, preview context, PR association, and expected branch, rather than client-supplied claims.
- An authoritative database resource and immutable isolated branch assignment for that deploy, with production exclusion and freshness/reassignment semantics. The expected Git branch label alone could not supply this.
- Successful deploy-specific binding lookup and private comparison of its connection with the SDK-selected connection. A mismatch, unavailable binding, or undocumented endpoint alias relationship would stop execution. Any supported normalization would require a documented identity-preserving rule.
- A connection snapshot fixed for the operation, with no ambient credential refresh, target substitution, alternate endpoint, or production fallback.
- Explicit operator authorization, protected invocation, a reviewed certificate-verifying driver path, and authoritative restricted-login evidence before connecting. An owner credential could not be used as the application runtime merely to discover its privileges afterward.

A later connection would still need post-handshake certificate-chain and hostname verification using documented driver behavior before SQL. Server-reported SSL alone would not prove client certificate validation.

## 5. Diagnostic implementation and controls

No diagnostic was implemented because the complete Phase 1 prerequisite was unmet. It remained disabled by absence: there was no diagnostic route, enablement switch, secret, scheduled trigger, deployment hook, browser client, or connection factory. Production and branch deploys therefore acquired no diagnostic entry point. No authentication or business endpoint was activated. No metadata response or diagnostic logging channel was introduced.

The requirements for authentication-before-database-work, explicit enablement, rejection of missing identities/mismatches, sanitized errors, verified TLS, and restricted roles remained mandatory design requirements, not claimed implemented controls. A future design could use verified team-login context plus a separately reviewed allowlist and operator enablement, without creating a diagnostic secret. Availability of those controls still needed verification.

## 6. Exact changed files

Only `docs/sprint-4b2-report.md` and `.netlify/results.md` were written. Application source, dependencies/lockfile, existing gates/tests, Functions, active/quarantined migrations, and `.github/workflows/` were unchanged.

## 7. Offline validation

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 353 tests across 22 files |
| `npm run check:architecture` | PASS |
| `npm run check:secrets` | PASS for supported patterns |
| `git diff --check` | PASS |

No diagnostic-specific tests were added for a nonexistent handler. Consequently the requested production/branch rejection, missing/invalid authorization, missing deploy, site/branch mismatch, absent binding, SDK mismatch, invalid TLS, BYPASSRLS, disabled behavior, connection-order, and sanitization cases were **not implemented or claimed as passing diagnostic tests**. They remained acceptance requirements for a future implementation after preflight succeeds. Existing offline gate tests did not substitute for those handler tests or prove live security. No production build was run manually; managed validation remained responsible for it.

## 8. Deployment and live inspection status

This inspection ran in the Agent Runner workspace `/opt/build/repo`, in Build mode, using Node v24.22.0. It did not execute inside a deployed Function. The platform Preview #15 record above was control-plane evidence only. No new deployment or managed review URL was observed in-session, and no manual deployment, commit, push, PR creation, or merge was attempted.

Actual PostgreSQL connections: **0**. SQL statements: **0**. Live diagnostic execution: **NOT RUN**. Certificate-verified TLS: **UNVERIFIED**. Current/session PostgreSQL roles, superuser status, and runtime BYPASSRLS: **UNVERIFIED**.

Operator-provided console evidence remained separate: PostgreSQL 18.6, database `netlifydb`, console role `netlifydb_owner` with BYPASSRLS, and no `hourvia_%` roles found. That role was not treated as Hourvia's restricted runtime identity. Its known BYPASSRLS would fail the required runtime role gate if proposed for application execution. Successful catalog SELECTs would not prove tenant isolation or command restrictions.

## 9. Gate matrix

| Gate | Status | Basis |
| --- | --- | --- |
| Current public main and sampled Sprint 4B.1 baseline | PASS | Public API and exact file comparisons |
| Preview #15 deployment association | PASS | Authenticated deploy metadata |
| Invocation is the approved deployed Function | UNVERIFIED | No Function invocation |
| Exact database resource/branch/deploy binding | UNVERIFIED | Missing resource/branch metadata; binding GET returned 404 |
| Phase 1 clearance to implement a connection diagnostic | FAIL | Complete supported evidence chain not established |
| Diagnostic enabled or public output exposed | PASS | No diagnostic installed or invoked |
| Protected diagnostic invocation and authorization | UNVERIFIED | No handler or protection verification |
| SDK connection equals authoritative binding | UNVERIFIED | No binding obtained; SDK not invoked |
| Certificate-verified TLS | UNVERIFIED | No handshake |
| Restricted current/session roles and attributes | UNVERIFIED | No connection or role query |
| Offline existing checks | PASS | Results above; no live inference |
| No SQL, writes, migrations, provisioning, or endpoint activation | PASS | No such actions occurred |
| Clearance for integration testing | FAIL | Identity, TLS, role, and authorization gates unresolved |

## 10. Supported alternative and remaining blockers

The concrete next step was for the project/team operator to use Netlify's supported dashboard and support channel to reconcile Preview #15's active branch with the documented read-only API's 404. Supply the nonsecret site/deploy identifiers and request the supported resource ID, immutable branch ID, deploy assignment, connection mapping, and supported credential/role model. Do not POST to create a branch, retrieve the site's default database as a fallback, guess internal endpoints, or copy dashboard owner credentials into runtime configuration.

Once the supported lookup succeeds and Netlify supplies the missing mapping semantics, a separately reviewed protected Function can use trusted runtime site/deploy context, authenticated control-plane lookup, and private SDK comparison before any connection. If Netlify cannot expose a supported complete attestation path, retain the no-connection decision and obtain a provider-supported operator attestation/inspection workflow; console results alone cannot certify the SDK's runtime target. Neither alternative was represented as completed.

Restricted login issuance and its pre-connection privilege evidence remained separate blockers. No roles or credentials were created. TLS trust and driver observation interfaces still required review. Controlled PostgreSQL integration testing remained a separately authorized future step after those gates; it was not cleared here.

## 11. Disablement/removal and delivery

No diagnostic cleanup was required because no diagnostic existed. If later implemented, keep it disabled by default, restrict it to the approved preview and verified operator, remove its route and enablement immediately after the authorized evidence collection, and review the resulting deployment for removal. Do not leave a temporary probe as a production feature.

Delivery was left to Agent Runner's managed GitHub workflow. This sprint stopped after preflight reporting and offline validation.

References reviewed on 2026-10-17: [Netlify Database API](https://docs.netlify.com/build/data-and-storage/netlify-database/api/), [Functions API](https://docs.netlify.com/build/functions/api/), and the public GitHub main commit/files identified above. Published Markdown versions of the Netlify pages were fetched. Findings distinguished documented capabilities, actual API observations, and unresolved runtime claims.
