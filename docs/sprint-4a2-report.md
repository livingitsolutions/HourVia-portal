# Sprint 4A.2 — Offline application command-port integration

2026-10-17. Offline integration only. Live activation remains **NO-GO**.

## 1. Verified baseline and commit

The credential-free public GitHub commits/main API returned `f61ff089874ebd8fe01fd93a37d0c6d4174cc029`, merge #13, containing Sprint 4A.1 implementation `8d3255b`. Local HEAD matched that merge and the checkout initially had no changes. The runner disallowed `git ls-remote`; the public API supplied independent main verification instead. No repository internals or credential-bearing configuration were inspected.

Reviewed Sprint 4A.1 and Sprint 3C reports, Sprint 3B application/transaction/identity contracts and engine, role policies and organization rules, Sprint 3C session boundaries, restricted repository adapters, transaction wrapper, canonical idempotency hashing, quarantined commands and receipt function, architecture checks and existing deterministic tests. The required Sprint 4A.1 baseline was present.

## 2. Exact files changed

- `db/candidates/application.ts`
- `db/tests/application.test.ts`
- `docs/sprint-4a2-report.md`
- `.netlify/results.md`

Existing repositories, domain models, SQL, migrations, runtime handlers, browser code and GitHub workflows were unchanged.

## 3. Application composition architecture

`createOfflineCommandApplication` is a server-only source candidate beside the restricted repositories, outside browser/runtime composition. It injects the existing PrincipalResolver, Clock, explicit connection factory, discovery port, invitation preparation/inspection port and correlation ID generator. It constructs no database client and acquires no connection at construction. No environment lookup, provider, credential bootstrap, delivery worker or business endpoint was added. `createLiveCommandApplication` always throws.

Every operation resolves the opaque credential afresh and rejects invalid/expired principals. Trusted principal IDs supply actor/session context; requested tenant IDs confer no authority. Tenant repositories authorize reads on their pinned transactions. Writes use only the existing closed restricted command dispatcher, which rechecks current actor/session/tenant permissions and locks tenant mutations. The existing architecture guard rejects imports of these database candidates into browser code, server runtime composition and Functions. This remains a static import check, not a complete bundle security proof.

The new interface deliberately returns existing TransactionOutcome values and command receipts rather than pretending to implement the Sprint 3B Result-returning aggregate-save engine. Domain models and role policies are reused. No unrestricted aggregate save or SQL callback is exposed to application callers.

## 4. Implemented offline workflows

Organization: atomic provision/owner command, retrieval, profile update, accessible organization listing, advisory selection, current membership validation and permission evaluation. Creator tenant UUIDs are deterministically allocated server-side from a namespaced actor/key hash, keeping creator replay/reconciliation scope stable across composition instances and process restarts. This ID is not an authorization capability. Listing reauthorizes discovery candidates and fails closed on read failure rather than presenting an outage as a complete empty list.

Membership: list, role change, revoke, transfer ownership and validate current membership. Organization selection stores no membership or authorization. Switching resolves identity and reloads membership; subsequent operations do not consume a cached selection as authority.

Invitation: preparation through an explicit trusted injected port, restricted issuance, administrative retrieval, recipient validation, acceptance and revocation. Issuance records delivery intent through the existing atomic SQL command; no separate nontransactional queue write or email effect is introduced. Invitation preparation is preceded by current tenant membership administration authorization. SQL remains the authoritative locked mutation check. Only credential digests enter command payloads, claims and receipts. No token logging is added.

## 5. Authorization enforcement

Existing OWNER/ADMIN/MANAGER/EMPLOYEE/CONTRACTOR policies remain unchanged. Ordinary reads require active membership; invitation administrative reads require OWNER/ADMIN. The existing restricted SQL enforces ADMIN target/role limits, owner-only transfers, active single-owner invariant, tenant isolation and recipient verified-email/digest checks. The application uses the existing evaluateAuthorization policy for explicit permission requests and invitation preparation. It does not accept a caller principal or role claim as identity authority.

Selection and explicit authorization reads are advisory observations, not reusable mutation authorization. Read orchestration can span multiple acknowledged read transactions; every mutation reauthorizes under the persistence lock. Revocation denies future operations; this does not promise that a read completed before revocation can be retroactively revoked.

## 6. Transaction and idempotency handling

Restricted commands preserve runCandidate/runTransaction: pinned client, transaction-local actor/session/tenant/operation, bounded timeouts, at most three safe serialization/deadlock attempts, rollback on failure, positive COMMIT acknowledgment, returned ROLLBACK rejection and disposal on unsafe outcomes. No external delivery occurs during retries.

The actual repository verifies the matching durable claim/audit receipt before COMMIT. Command outcomes are not translated into ordinary Result success/failure. `commit_unknown` stays distinct and triggers no automatic application replay. Explicit `reconcileCommand` and `reconcileCreation` perform fresh authenticated receipt reads; missing receipts remain unresolved. Reconciliation uses exactly the original command payload, expected version and key. It performs no mutation.

Stable preparation is a required injected contract for invitation issuance: same actor/tenant/key/input must preserve invitation ID, digest and expiry. Acceptance explicitly carries both aggregate `expectedVersion` and `invitationVersion`; changing either changes the claim digest. The credential-verified inspection determines tenant identity, and acceptance rejects disagreement with the requested tenant. Accepted invitations are not pre-rejected before the SQL command, allowing the persistence contract to verify legitimate duplicate acceptance and current membership.

## 7. Offline integration test results

Added 19 deterministic tests using the real composition, restricted repositories, canonical digest generation, receipt verification and transaction wrappers. A controlled query driver models staged state, serial transaction access, claim/audit records and command effects using existing domain rules. Memory is confined to test doubles and is not runtime persistence.

Coverage includes creation plus owner assignment and creator replay, unauthorized/cross-tenant reads and mutations, profile updates, all five role classes, escalation rejection, revocation/stale selection, competing ownership attempts, invitation issue/retrieve/validate/accept/revoke, duplicate issue/accept, expired/revoked/invalid credentials, delivery intent, audit mismatch rollback, returned ROLLBACK, uncertain COMMIT disposal/no replay, explicit completed/unresolved reconciliation, switching, revoked sessions, forged identity and hard-disabled live construction.

Executed successfully:

- `npm run typecheck`
- `npm run lint`
- `npm test` — **344 tests across 21 files**, including 19 new workflow tests
- `npm run check:architecture`
- `npm run check:secrets`
- `git diff --check`

These are offline workflow tests, not live PostgreSQL integration. The simulated driver does not parse or execute SQL or prove PostgreSQL locks, serialization, RLS, privileges, constraints, receipt durability or concurrent behavior. Existing transaction tests independently exercise bounded retry and disposal paths. No manual production build ran because managed runner instructions prohibit build commands; automatic build validation belongs to delivery.

## 8. Missing or incompatible contracts

The Sprint 3B WorkflowTransaction aggregate-save interface cannot safely wrap these restricted commands. No broad save emulation was introduced. The command-oriented service exposes receipts instead of full domain results; consumers needing updated objects must perform authorized reads. Lifecycle/suspend/reactivate commands outside this sprint remain unsupported rather than using unrestricted writes.

Three required dependencies remain without live persistence implementations: global accessible-organization discovery (reusing the existing listForUser port), stable invitation preparation/secure credential exchange, and digest/session/verified-email-bound recipient inspection before membership exists. New explicit ports permit offline integration without pretending administrative invitation reads can serve recipients. Inspection must support accepted replay without disclosing invitations to a different recipient, and revalidate current session/verified email. These adapters must be separately reviewed and implemented before live composition. No fallback supplies them.

The older acceptance API conflated invitation and aggregate concurrency versions. This command application requires both explicitly to match Sprint 4A.1 SQL. It is not a drop-in implementation of OrganizationUseCases. Issuance delivery intent is already atomic in the command and is not a new standalone delivery API.

## 9. Live database verification blockers

Existing authoritative resource/branch binding, production exclusion, immutable execution identity, TLS and restricted-runtime credential gates remain unresolved. The presence of a Netlify Database resource does not satisfy them. Quarantined function compilation/installation, effective grants, role isolation, RLS, single-owner enforcement, concurrent transfer/revocation/acceptance, durable replay, delivery uniqueness, rollback and connection disposal require separately authorized disposable PostgreSQL verification. Drizzle metadata and quarantined schema adoption still need reconciliation. No connections, provisioning, migration or SQL execution occurred.

## 10. Authentication activation blockers

Provider approval/configuration, reviewed provider SDK verification, identity bootstrap, durable attempts/sessions, revocation/rotation, verified-email mapping, CSRF/request integration, abuse controls and provider/browser acceptance tests remain unresolved. The existing authentication handler stays disabled. No provider was enabled, session issued, Identity activated or cookie authority changed.

## 11. Security limitations

Injected ports are trusted server dependencies, not client-configurable plugins. Their production security is not proven by deterministic doubles. SQL candidates remain quarantined and unexecuted. GUC context is not protection against stolen runtime credentials; credential isolation remains mandatory. Static architecture and supported-pattern secret checks have finite coverage. Raw invitation credential exchange and delivery are intentionally absent. No RLS bypass, runtime table writes, production fallback, active migration, workflow edit, secret, monitoring or payroll feature was added.

## 12. Recommended next sprint

Review the command API/version mapping and implement the missing restricted discovery, stable invitation preparation and recipient-inspection adapters. Resolve isolation evidence and run the reviewed disposable PostgreSQL security/concurrency matrix before considering live persistence. Complete authentication/session adapter review separately. Keep business endpoints and email delivery disabled until their prerequisites receive independent validation.

## 13. Managed delivery status

Prepared source changes and the standalone managed delivery description. Agent Runner owns commit, review and deployment handling. No direct push, commit, review creation, merge or deployment occurred. A managed review URL and automatic build/deployment result are unavailable during this session. Work stops at Sprint 4A.2; this change is offline integration, not live activation approval.
