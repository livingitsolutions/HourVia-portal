# Sprint 3B — Organization and membership application engine

Date: 2026-10-17. Scope: offline application workflows and explicitly simulated frontend integration. Native Netlify Database remains the intended persistence platform. No live authentication or persistence was activated.

## Verified baseline

The public GitHub API returned main commit `69e24ca05ac24b7d85a9eb26f3b0665196cfa345`. Pull request #10 was merged with that same merge commit. Local history contains that merge and Sprint 3A implementation `7155e17`. The checkout initially had no changes. The environment disallows `git ls-remote`; credential-free HTTPS API checks independently confirmed main and the merged Sprint 3A baseline.

Reviewed existing identity resolution, onboarding, organization, invitation, role matrix, domain rules, transaction and idempotency protocols, offline schema, architecture guard, and Sprint 2.2E security report. Existing domain entities and pure transitions were reused. Database code, quarantined SQL, verification gates, workflow files, dependencies, authentication composition and monitoring were preserved.

## Files changed

- `src/application/organization.ts`: extended existing use-case and persistence ports, durable replay requirements, invitation uniqueness and audit metadata.
- `src/application/organization-engine.ts`: application workflow implementation; no React, Netlify SDK or database dependency.
- `src/application/testing/organization-fake.test.ts`: isolated serial transaction fake and application tests. No fake is imported into runtime code.
- `src/infrastructure/preview-onboarding.ts`: public fixture adapters implementing a subset of existing use-case contracts.
- `src/presentation/OnboardingPages.tsx`: preview workflow integration and member listing states.
- `src/presentation/onboarding.test.ts`: rendered member listing and tenant-switch regression test; existing tests preserved.
- `docs/sprint-3b-report.md`: this report.
- `.netlify/results.md`: managed delivery description.

## Use cases implemented

Organizations: validate and create a trimmed 2–120 character name, assign the authenticated creator as the sole active OWNER, read details, update the name profile, list accessible organizations, select active context, and transition lifecycle. Creation and ownership installation are atomic. Organization industry and time zone remain onboarding review inputs; they are not fields in the existing Organization model and are not persisted.

Lifecycle follows the existing provisioning → active/closed, active → suspended/closed, suspended → active/closed rules. Closed is terminal. Only the current active OWNER can change lifecycle; suspended organizations can be resumed through this narrowly scoped owner operation. Ordinary reads and writes reject inactive organizations.

Memberships: list members, invite, validate invitation credentials and recipient, accept, revoke invitations, change roles, suspend, activate, remove through revocation, and transfer ownership. Revoked records remain for audit and cannot be reactivated through the ordinary activation use case. Existing revoked membership also prevents invitation-based re-entry; restoring access needs a separately designed recovery policy.

Invitations normalize email, reject OWNER/unknown roles, expire after seven days, and reject another pending invitation to the same normalized email. Existing expired pending rows must be explicitly expired by a future adapter maintenance workflow before replacement; there is no background task in this sprint. Acceptance verifies credential digest, server-verified recipient email, pending state, expiry, invitation version and active tenant. Membership installation and invitation consumption commit together. Acceptance cannot replace an existing membership or escalate its role. No credential is returned to presentation and no email is sent.

Ownership transfer uses the existing pure transition: the current OWNER becomes ADMIN and an active target becomes OWNER in one aggregate save. Exactly one active owner is checked before and after mutations. An owner cannot be removed, suspended or demoted through generic member changes.

## Authorization coverage

Opaque credentials enter a server composition factory, not request-submitted principals. PrincipalResolver remains the trusted authority for signature/provider/session verification. The engine rejects expired or malformed resolved sessions and resolves identity again inside mutation transactions. The actor cannot change between resolution and commit work.

Each organization request loads current tenant membership. Administrative writes reuse the existing OWNER/ADMIN matrix. ADMIN cannot grant ADMIN, alter another ADMIN, mutate an OWNER or transfer ownership. MANAGER, EMPLOYEE and CONTRACTOR receive no administrative writes. Every active member can read organization details and the member directory; that is an explicit application policy, not administrative authority.

Resource authorization continues to require matching organization and resource organization IDs. Actor identity comes from the resolver; client-supplied roles confer no authority. Acceptance is the only non-member entry path and requires the trusted credential locator and verified-email assertion. Revocation immediately removes authorization and selection on subsequent calls, including idempotent retries. No authorization decisions or membership roles are cached in the engine.

Selected context is returned to the caller rather than persisted as a global authority. Every subsequent request must independently authorize its organization. Browser sample selection is never a server authorization context.

## Transactions, idempotency and audit boundaries

WorkflowTransaction extends the existing transaction port. Future adapters must serialize all aggregate and invitation operations per tenant, check versions, and roll back aggregate writes, invitation writes, audit events and idempotency claims together on a typed failure or exception. Creation also requires a lock/unique claim for the actor creation scope, because the organization does not yet exist. IDs come from a trusted generator; live implementations must generate UUIDs.

All mutations require idempotency keys. Scope is actor plus organization (or actor creation scope) plus key; canonical tuple input includes action and expected version. Reusing a key with different input produces CONFLICT. Completed result and its digest must be durable in the same transaction as the mutation. Concurrent same-key retries return the original result without another audit event. Fresh membership/session checks still apply on replay. Acceptance verifies the credential again before replay. Keys must remain available throughout the published retry window; deleting a key while retries remain valid is prohibited.

The engine passes canonical tuple JSON to the transaction port. A future database adapter must hash this using the existing canonical SHA-256 protocol before storage, rather than treating JSON as an already hashed digest. Raw invitation credentials are deliberately excluded from replay input and audit. Void outcomes require an object envelope for the existing JSON outcome constraint. Bounded serialization retries reuse the same key; external side effects cannot run inside those retries.

Audit events include tenant, trusted actor, action, target, aggregate version, trusted correlation ID and timestamp. Creation, profile/lifecycle updates, invitation creation/revocation/acceptance, role/status changes and ownership transfer all append events before transaction completion. Audit failure aborts the business operation. Successful replays append nothing. Read operations and rejected attempts do not produce transactional business audit events; future security logging is separate and is not enabled here.

New invitation persistence requires transactional credential-digest issuance and an eventual delivery outbox. The adapter must enforce the existing pending-recipient unique constraint, resolve inviter/acceptor membership IDs, preserve credential digests on updates and set acceptance metadata. These requirements are defined on the port; no issuance, delivery or database adapter is composed.

## Offline verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 270 tests across 16 files.
- `npm run check:architecture`: passed.
- `npm run check:secrets`: passed for supported patterns.
- `git diff --check`: passed.

The new application suite covers validation, duplicate creation and conflicting input, tenant isolation, all non-administrative roles, ADMIN escalation restrictions, invitation lifecycle, expiry/revocation/recipient/credential failures, duplicate pending recipients, acceptance replay, membership revocation, suspension/reactivation, role changes, owner protection, lifecycle, concurrent transfer, audit fields, session changes, tenant switching and audit-failure rollback for creation, invitations and acceptance. The rendered test covers sample member loading, empty/error states and clearing prior tenant content. All prior tests remain present.

The fake serializes transactions and snapshots state to model rollback. Its fixtures and credentials are synthetic and test-local. These tests validate application behavior, not live PostgreSQL locking, RLS, connection isolation, provider verification or durable storage. No database integration tests, SQL, migrations or build commands were run.

## Frontend integration

Creation review calls a preview adapter shaped by the existing createOrganization contract. Completion continues to state that no organization was created. Industry and time zone remain visible review details.

Organization switching calls the preview select contract; a generation counter discards stale selection responses and clears pending responses after sign-out/context clear. Organization dashboard loads the selected sample member directory through the listMembers contract. Tenant-specific keys reset member/error/scenario state. Sample membership rows identify their role/status and explicitly label simulated data. Empty and unavailable selectors exercise those states. Existing invitation-state previews, role-aware navigation, creation errors and organization empty states remain intact.

The browser does not compose the server engine or a fake repository. Preview adapters only project public fixtures and transient review input. They accept no credentials and use no localStorage, files, database or network persistence. Authentication, acceptance and administrative action buttons remain disabled.

## Remaining live backend blockers

Sprint 2.2E's connection/branch identity, production-exclusion, immutable resource binding, TLS, restricted credentials and managed verification blockers remain unresolved and unchanged. No security gate was relaxed. Native Netlify Database is the intended backend; no alternative persistence or resources were introduced.

The application ports are deliberately not a ready-to-enable database adapter. Before activation, implement and verify trusted provider/session resolution, tenant transaction locking, credential issuance/lookup, verified email retrieval, delivery outbox, atomic audit metadata mapping and durable replay storage. Audit actor IDs must map to existing membership IDs on the transaction connection.

Reconcile port semantics with existing offline schema before adapter activation: the application creation scope must map to the schema's null-organization creator scope; operation categories, organization profile/lifecycle operations, key format/length and replay outcome envelopes need an explicitly reviewed mapping or future quarantined migration. No existing schema constraint is bypassed. A completed acceptance replay must remain available after credential consumption while revocation and current membership still deny access.

Do not infer live safety from the test fake or wire these ports to unverified ambient database credentials.

## Recommended next sprint and delivery

Next sprint: resolve authoritative database isolation and identity verification evidence first, then design and review a disabled native Netlify Database adapter with explicit schema mappings, invitation issuance/outbox and live security acceptance criteria. Perform approved adapter verification only once all existing gates are satisfied.

Changes are prepared for the platform's managed GitHub delivery. No direct commit, pull-request creation, merge or manual deployment was attempted. No workflow changes, provisioning, destructive SQL, authentication activation, persistence activation or monitoring enablement occurred. Work stops after Sprint 3B.
