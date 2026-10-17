# Future persistence design — not activated

Sprint 1 supplies ports and pure proposals, not persistence. No database package, connection, schema, migration, or provisioning is included. Future implementation targets Netlify Database (PostgreSQL) with Drizzle; it requires a separate reviewed sprint. Use the supported Netlify adapter, Drizzle beta packages, and managed migration delivery at that point.

## Tables and constraints

Global users have immutable internal UUIDs, active/disabled status, and creation timestamps. Provider identities map unique (issuer, subject) to a global user; verified email is separate from identity and is never an automatic account-linking key. Sessions store internal user, issuer, subject, expiry, revocation time and version. Never store bearer credentials. Support individual and user-wide revocation.

Organizations have UUID, name, lifecycle state (provisioning, active, suspended, closed), and aggregate version. Memberships have organization/user foreign keys, role, lifecycle state, explicit monitoring delegation, and version. Unique (organization_id, user_id) prevents duplicate or revived parallel memberships. Revoked memberships are terminal; a new invitation/reactivation policy must be explicitly reviewed before rejoining. Suspended memberships may be activated by an authorized administrator; the OWNER cannot be suspended, revoked, or changed through general membership operations. A user may have multiple memberships. Every consultant still operates through an organization; no tenantless workspace exists.

Invitations have organization ID, normalized verified recipient email, non-owner proposed role, pending/accepted/revoked/expired state, credential digest, expiry, inviter, version, and acceptance metadata. Hash high-entropy random single-use credentials; never log raw links. Uniqueness for pending organization/recipient invitations prevents accidental duplicates. The verified recipient must match the invitation; consume token and create membership in one transaction. An expired invitation is denied even before its stored state is updated. Reject existing active, suspended, or revoked membership conflicts; do not silently reactivate membership or overwrite its role. OWNER invitation is forbidden.

All future tenant resources carry non-null organization IDs. Composite foreign keys (organization_id, resource_id) prevent cross-tenant references. Global identity records are accessible only through tightly scoped identity services, not tenant-wide browsing.

## Exactly one owner and transactions

A partial unique index on organization_id for active OWNER memberships enforces *at most* one owner. It does not enforce at least one. Add deferred constraint triggers checking owner counts for each affected active organization at commit, including organization state transitions, owner changes, membership deletes, and cascades. A trigger must reject an OWNER whose membership is inactive. Lock the organization row before every membership or ownership mutation so concurrent transactions cannot independently satisfy the invariant on stale snapshots. Implement the owner uniqueness constraint as deferrable where possible, or demote the existing owner before promotion within a transaction; the deferred count check rejects a commit with no owner. Test both trigger and index behavior against real PostgreSQL before release.

Provisioning atomically inserts organization, creator OWNER membership, audit event, and idempotency result. A provisioning organization grants no access; activation requires exactly one active owner. Failed provisioning leaves no active orphan. Reserve a creator-scoped idempotency key before generating a new organization ID; transaction-local provisioning context must be unavailable to ordinary tenant queries.

Ownership transfer locks the organization, reloads the actor and recipient, verifies live session and active owner status, checks aggregate version, demotes owner to ADMIN, promotes the active recipient, increments version, and writes audit and idempotency result before commit. Self-transfer, inactive/missing/cross-tenant targets, and non-owner actors fail. No general role change may assign or remove OWNER. Require step-up authentication and explicit confirmation when this operation is eventually exposed.

Membership changes use the same tenant lock and expected-version comparison, including invitation acceptance and revocation. Recheck actor authority under lock. Thus an administrator revoked concurrently cannot use a stale permission decision to commit another change. Clear monitoring delegation on role/status changes. Owner-transfer proposals and compare-version tests in Sprint 1 document the protocol; they cannot prove race safety without a database.

TransactionRunner must roll back all state and audit writes on a typed error or exception. Serialization/deadlock retries are bounded and repeat authorization with fresh state. An idempotency table scopes unique keys by actor, tenant, and operation, binds keys to a canonical input digest, and stores the typed outcome; mismatched reuse returns CONFLICT, replay returns the original outcome. External email delivery uses a transactional outbox and separate idempotent worker after commit. Sprint 1 sends no messages.

## Tenant isolation and runtime roles

Use FORCE ROW LEVEL SECURITY and both USING and WITH CHECK policies. Runtime roles must be non-owner, NOSUPERUSER, NOBYPASSRLS, without DDL, role-management, or unrestricted global-table privileges. Keep migration/administration credentials separate and inaccessible to the app runtime. Set actor and tenant context with transaction-local settings on the same pooled connection after server principal resolution. Policies verify the live active membership and organization state; client-provided tenant preferences never establish authority. Clear context on pool reuse. Fail closed on absent context.

Tenant background jobs and reports require scoped service actors and identical isolation. Explicit server-side resource policies are still required: role grants do not authorize arbitrary record IDs, self-approval, financial finalization, or access to colleagues' personal time entries. Restrict SECURITY DEFINER helpers, fix their search_path, and revoke public execution. Identity lookup and cross-organization listing need narrow audited queries/functions that return only the actor's memberships, without disabling general RLS.

## Audit and release verification

Append-only tenant audit history records actor, target, action, version, timestamp, and correlation/idempotency identifiers. Prevent runtime update/delete and redact credentials, session assertions, and invitation links. Restrict audit reads to the policy. Decide retention and access requirements before collecting live data.

Database integration acceptance requires parallel ownership transfers, role changes racing revocation, invitation replay/accept races, rollback injection, idempotency replay, RLS reads/writes/joins, pooled context leakage, restricted-role negative tests, and backup/restore constraint checks. None are claimed as passed in Sprint 1.
