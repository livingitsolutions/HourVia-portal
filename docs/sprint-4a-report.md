# Sprint 4A — Persistence prerequisite review

2026-10-17. **BLOCKED: adapter implementation stopped at the requested prerequisite gate.** This delivery documents findings and existing regression checks; it does not complete Sprint 4A.

## 1. Verified baseline

The credential-free public GitHub branches API returned main `0016b6d65a99be7500a4fde3cf7945088478de47`, merge #12. Local history contains that merge and Sprint 3C implementation `146e453`. The initial working tree was clean. Both supplied prior-attempt histories were reviewed.

Reviewed existing domain models, organization application ports/engine, Sprint 3B/3C reports, Sprint 2 schema and security candidates, transaction/idempotency protocols, Sprint 2.2B transaction candidate and failure tests, Sprint 2.2E report and branch gate, managed execution blocker, installed SDK declarations/implementation and architecture guard. The merged baseline exists, but reviewed mutation/bootstrap security interfaces remain missing. The request requires stopping when prerequisites are missing and stopping incompatible operations without silently changing schema.

## 2. Exact files changed

- `docs/sprint-4a-report.md`
- `.netlify/results.md`

No source, dependency, test, workflow, schema, migration candidate or preview adapter changed. No duplicate models or repositories were added.

## 3. Native Netlify Database SDK compatibility

Installed `@netlify/database` 2.0.1 exposes `getDatabase(options?: GetDatabaseOptions)`. Options contain `connectionString?: string` and `debug?: boolean`. The returned connection exposes `sql`, `pool`, `connectionString` and a server/serverless driver discriminator. Documented `pool.connect()` supports transaction pinning. Installed Drizzle uses the compatible beta release line.

The SDK uses an explicit URL override when provided, otherwise an ambient connection URL. Runtime configuration selects PostgreSQL or Neon transport. Its public options provide no project/database/branch attestation, immutable binding, production-exclusion assertion or TLS/pool configuration. An explicit URL does not establish authoritative branch identity. No unsupported API was invented and no client was initialized.

Missing live evidence alone does not prevent offline source development. The additional unresolved command/security interfaces and schema mappings below prevent claiming the complete adapter against the current contracts. A future disabled factory can accept explicit verified dependencies without using ambient fallback; activation must retain all independent safety gates.

## 4. Repository implementations

No adapters were implemented in this stopped sprint.

| Operation | Status/dependency |
| --- | --- |
| Organization retrieval; membership lookup/listing | Deferred after prerequisite stop. Scoped SELECT candidates exist; trusted session binding and authorized cross-organization discovery remain necessary. |
| Organization creation/profile/lifecycle | Stopped: runtime mutation grants and reviewed command/bootstrap routines are absent. |
| Membership role changes/revocation; ownership transfer | Stopped at the same runtime mutation boundary. Migration-owner substitution or broad DML would bypass security contracts. |
| Invitation issuance | Stopped: transactional delivery requires an outbox absent from the schema. |
| Invitation validation/acceptance | Stopped: narrow credential/recipient bootstrap is absent; ordinary RLS requires existing membership. |
| Invitation revocation; audit writes; durable claims | Stopped: reviewed runtime write interfaces are absent. |

## 5. Transaction guarantees implemented offline

No new guarantees were implemented. Existing transaction modules remain unchanged. Existing controlled tests cover pinned context, acknowledged COMMIT, returned ROLLBACK, failed/uncertain COMMIT, connection disposal, rollback failures and bounded safe serialization/deadlock retries. The Sprint 2.2B candidate additionally tests callback expiry, cleanup failure, swallowed query failures and claim reconciliation. Simulated command replies do not establish PostgreSQL guarantees.

## 6. Tenant isolation design

Existing candidates use transaction-local actor/session/tenant settings, live user/session validation and same-tenant active membership. Application contexts omit session ID; server composition must bind the trusted session and revalidate under the tenant lock. Browser roles and requested organization IDs cannot grant authority.

The quarantined security candidate explicitly denies runtime mutations and defers command-specific routines. No elevated runtime login, broad grants, RLS bypass or cross-tenant bootstrap query was introduced. Sprint 2.2E evidence validation and the unconditional managed-collector blocker remain intact. Actual RLS enforcement remains unverified.

## 7. Security and failure tests

No new adapter tests were added. Existing suites passed, including transaction failures/disposal, synthetic branch identity and production-fallback rejection, missing/cross-tenant context rejection, and application fake coverage for replay, concurrent ownership transfer, revocation, invitation acceptance and audit rollback. The application fake serializes and snapshots state; it does not prove PostgreSQL locking or durability. Existing parameter-context tests do not establish injection resistance of an unimplemented repository. Requested adapter-specific tests remain outstanding.

## 8. Schema and contract compatibility gaps

- The quarantined security SQL grants runtime SELECT only, revokes mutation privileges and explicitly defers audited command routines. Implementing direct writes with migration credentials would bypass the existing boundary.
- Invitation persistence requires atomic credential-digest issuance and queued delivery. No outbox relation exists. Sending mail inside retries or silently adding storage is unacceptable.
- Recipient credential lookup/bootstrap is absent. Invitation SELECT is restricted to tenant administrators; it cannot serve as a new recipient's tenant locator. Runtime provider identity browsing is intentionally unavailable.
- Creation uses logical `create:<actor>` context while the transaction context requires UUIDs. Creator claims must precede tenant allocation through a deliberate mapping/protocol.
- Claim operation categories are restricted to `provision`, `transfer`, `membership`, `invite`, `accept`. Profile/lifecycle need reviewed category mappings. Application keys allow up to 200 characters; schema keys require a restricted 16–128-character format. Tuple JSON must be hashed and void outcomes need object envelopes.
- Application memberships omit database row IDs/versions; invitation metadata and audit actors need transaction-local mappings. Acceptance saves the invitation before installing aggregate membership, but the accepted-membership foreign key is immediate. Safe staging or reviewed sequencing is required.
- Ordinary organization RLS requires active status; owner-driven resumption of suspended organizations requires a narrow reviewed authorization path.

Some gaps admit code mappings rather than schema changes. This is not a claim that PostgreSQL cannot represent the domain. No SQL candidate was edited/moved, no active migration directory was created and no migration was generated/applied.

## 9. Offline validation results

`npm run typecheck`, `npm run lint`, `npm test` (312 tests across 19 files), `npm run check:architecture`, `npm run check:secrets` and `git diff --check` passed. Secret scanning covers supported patterns only. These are existing-code regression checks, not completed adapter validation. Manual production builds are prohibited by this runner and were not run.

## 10. Unverified live PostgreSQL behavior

Branch routing/immutability, production exclusion, TLS, effective roles, RLS, deferred owner constraints, locking/serialization, foreign-key sequencing, transaction command replies, durable replay, invitation races, audit atomicity and physical connection destruction remain unverified. PostgreSQL integration tests and browser E2E were not run. No SQL was executed.

## 11. Activation blockers

Retain authoritative connection/branch identity requirements, restricted credentials/TLS checks and all independent managed gates. Review command/bootstrap authorization and invitation delivery storage; resolve port mappings and implement/test adapters before activation. Provider/session verification remains disabled. No activation toggle or composition root was added to bypass these requirements.

## 12. Recommended Sprint 4B scope

Resolve blocked Sprint 4A design first: least-privilege command/bootstrap interfaces, trusted transaction/session binding, operation/key mappings, acceptance sequencing and durable invitation delivery. Any necessary schema proposal requires separately authorized quarantined candidate review. Complete disabled adapter source and injected-client failure tests after these decisions. Obtain supported authoritative platform binding before proposing separately authorized disposable live verification. This report neither completes Sprint 4A nor authorizes Sprint 4B activation.

## 13. Deployment readiness

**NO-GO for persistence deployment/activation.** Documentation only. No database provisioning/deletion, SQL, migrations, production schema changes, authentication/business activation, monitoring, manual deployment, commit, direct review creation or merge occurred. Managed Agent Runner delivery owns commit/review creation; its URL and deployment status are unavailable in this session. Work stopped at the Sprint 4A prerequisite gate.
