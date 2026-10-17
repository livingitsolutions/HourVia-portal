# Sprint 4B.1 — PostgreSQL candidate compatibility repair

2026-10-17. **Offline repairs only. NO-GO for database connection, installation, writes and integration execution remains unchanged.** No PostgreSQL connection or SQL execution occurred. SQL generation and source/metadata tests do not establish live enforcement.

## Verified baseline

Public GitHub main returned HTTP 200 and `384c3bb8e0633aa7eb955dfafefde431bd91f85f`. PR #14 returned merged=true with the same merge commit. Local HEAD was runner snapshot `f2ccd52`, immediately above that baseline, with a clean initial working tree and the previous Sprint 4B report. Public main's contents request for `docs/sprint-4b-report.md` returned HTTP 404: Sprint 4B was available locally but was not established as merged on public main. Its findings were reviewed as local evidence, not treated as live database observations.

Reviewed quarantined roles, foundation SQL/snapshot, invariants/RLS, restricted commands, invitation delivery contracts, Sprint 4A.1 repositories, Sprint 4A.2 command composition, transaction/idempotency contracts, installed Netlify Database 2.0.1 declarations/source, Drizzle ORM/Kit 1.0.0-beta.22 APIs, and existing security/activation gates. No SDK factory or connection getter was invoked.

## Defects, root causes and repairs

### Locking privileges

`hv_command` executes seven locking SELECT statements across six relations: organizations, global users, sessions, actor membership, invitation, idempotency claim and target membership. PostgreSQL locking SELECT requires SELECT plus UPDATE on at least one column, including FOR SHARE. Existing command-owner UPDATE covered organizations, memberships, invitations and claims, but users/sessions had SELECT only.

Added **UPDATE(id) only** on users/sessions to the isolated command owner. Added command-owner UPDATE policies with USING(true) and WITH CHECK(false): row selection for locks is permitted while actual updates are rejected. Existing immutable-ID/version triggers remain another restriction; no version-column UPDATE was granted. Runtime received no table or column write grants. No lock, live-session check or tenant predicate was removed. Migration-owned invariant triggers also lock organizations, covered by their owner privileges and explicit migration RLS policy.

### Installation/session compatibility

The earlier sequence leaked session SET ROLE from 000 into generated DDL and 002; 003 owned BEGIN/COMMIT despite potential outer installer transactions. Directory ordering put numeric security files before timestamped foundation SQL. Generated-folder enumeration assumed exactly one artifact.

Added a declarative dependency manifest and review contract. Installation now requires one pinned bootstrap connection, one caller-owned SERIALIZABLE transaction and explicit LOCAL ROLE before each phase. Default privileges name hourvia_migration directly. The security file sets its own LOCAL migration role and clears it; commands clear LOCAL ROLE and no longer BEGIN/COMMIT. The creation search path is public, with pg_catalog implicitly searched first; putting pg_catalog explicitly first would misdirect unqualified generated CREATE TABLE. Function search paths are separately fixed to pg_catalog.

The legacy loopback harness now explicitly selects its original foundation file, LOCAL role and creation search path instead of enumerating generated directories or inheriting a session role. It remains foundation-only, retains its authorization gates and was not run. The manifest is data only, with no automatic or newly executable installer.

### Structural metadata and Drizzle compatibility

Moved delivery-table/audit-index structural ownership into `db/schema.ts` and a newly generated forward SQL/snapshot pair. Removed the duplicate table/index creation from 003, which retains their RLS, permissions and command semantics. The original foundation SQL and snapshot remain unchanged. The current schema has nine tables and matches the new version-8 structural snapshot.

The installed FK builder exposes onUpdate/onDelete but no deferrability method. The existing explicit `idempotency_actor_tenant` ALTER to DEFERRABLE INITIALLY DEFERRED remains a documented SQL overlay. RLS, trigger and definer/ACL semantics also remain explicit overlays, not purported Drizzle snapshot features. No unsupported `.deferrable()` method, custom driver property or undocumented SDK call was introduced. A second offline generation found **no schema changes**.

Compatibility checks also account for a genuine naming difference: implicit ORM FK getName() uses `_fk`, whereas Kit emits `_fkey`. Tests compare semantic edges for implicit names and exact names for explicitly named constraints. Application repositories use explicit SQL/pinned injected connections, not implicit FK catalog-name guesses or an ORM aggregate-save interface. Their public contracts and application wiring remain unchanged.

## Privilege and definer review

This matrix describes candidate intent, not installed grants or effective inherited privileges.

| Role | Candidate privileges | Restrictions |
| --- | --- | --- |
| Bootstrap operator | Role creation, default privileges, policies, function ownership transfer | Separate exact authorization and capability verification required; not a runtime identity |
| hourvia_migration | Owns generated relations and invariant helpers/triggers; public schema CREATE; explicit forced-RLS policies on foundation relations | NOLOGIN, non-superuser, no BYPASSRLS/CREATEROLE/CREATEDB/replication; no runtime membership |
| hourvia_command | SELECT users/sessions/identities; UPDATE(id) users/sessions for locks; SELECT/INSERT/UPDATE tenant command tables and delivery queue; SELECT/INSERT audit; hv_actor EXECUTE | NOLOGIN with no privileged attributes; no runtime membership, DELETE, table ownership, persistent schema CREATE or users/sessions data-update policy |
| hourvia_runtime | Schema USAGE, existing tenant-scoped SELECT and exact helper/dispatcher/receipt EXECUTE | No INSERT/UPDATE/DELETE/TRUNCATE grants, no delivery-table access, no command/migration role membership |
| PUBLIC | Existing broad table/function revocations and schema/database creation restrictions preserved | Command and receipt EXECUTE explicitly revoked |

Both command functions retain explicit ownership transfer to hourvia_command, exact runtime EXECUTE signatures, PUBLIC revocation, static bodies and fully qualified application objects. Temporary schema CREATE for transfer is revoked before outer COMMIT. Migration helper/trigger ownership follows explicit LOCAL ROLE; all eight helper/trigger functions now fix search_path to pg_catalog, removing public from function lookup. Generated DDL still uses the explicit trusted creation namespace.

Caller-controlled payloads do not supply an actor role. Trusted transaction-local actor/session/tenant/operation values remain bound on the pinned connection, with tenant agreement, live session/user checks, membership checks and serializable enforcement in commands. GUCs are not authentication against stolen runtime credentials. Credential isolation, reviewed principal verification and actual role-membership/ACL validation remain mandatory. No live RLS guarantee is claimed.

## Candidate installation order and dependencies

| Order | Candidate | Required role / dependencies |
| --- | --- | --- |
| 1 | `000_roles.sql` | Bootstrap; creates isolated roles and role-specific default privileges |
| 2 | Original generated foundation | LOCAL hourvia_migration; creates eight tables, composite tenant FKs, audit/idempotency structures and owner indexes |
| 3 | `002_invariants_security.sql` | LOCAL hourvia_migration; foundation-dependent version/lifecycle/owner/claim triggers, helpers, forced RLS and runtime read grants |
| 4 | Generated command metadata delta | LOCAL hourvia_migration; creates delivery queue with composite invitation FK and tenant/correlation audit uniqueness |
| 5 | `003_restricted_commands.sql` | LOCAL NONE/bootstrap; command role, narrow lock grants, queue RLS, restricted functions/ownership, and deferred actor/membership claim FK |

Each step requires the manifest dependencies, explicit LOCAL ROLE, and the same outer transaction. Only the caller commits after all phases; any failure rolls back. An uncertain installation COMMIT must not trigger blind replay. This is a **fresh disposable target** plan, not an upgrade script for unknown installed state. Any externally applied candidate history requires separate state inventory and forward-only reconciliation; no applied migration is rewritten or replayed by this change. Nothing enters Netlify's active migration directory.

Acceptance still reserves the claim before inserting membership, needs the deferral overlay, inserts membership before consuming the immediate invitation FK, and keeps aggregate/invitation versions distinct. Ownership transfer still demotes before promotion and checks one active owner. Audit/claim/queue intent remains transactional, with no external email side effect. Delivery worker leasing, secure credential exchange and worker privileges remain unimplemented.

## Compatibility tests and validation

Added seven offline compatibility tests covering every command locking relation and its intended UPDATE grants, runtime write restrictions, owner separation and exact EXECUTE grants, dependency/role/transaction ordering, trusted context and tenant checks, transfer/acceptance statement order, structural Drizzle columns/FKs/checks/indexes and the explicit unsupported-deferrability overlay. Updated baseline tests to distinguish foundation SQL from current metadata. Added two simulated repository cases for transfer/acceptance across permission failure, receipt failure and lost COMMIT, checking pinned context, rollback and no uncertain replay.

The existing application/transaction suites also cover tenant denial, ownership transfer, invitation acceptance/replay/revocation, rollback, bounded retry, connection disposal and reconciliation. Source assertions and controlled driver replies do not parse/install SQL, enforce PostgreSQL grants/RLS, or prove concurrent locks and durable commits.

| Validation | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 353 tests across 22 files, nine added cases |
| `npm run check:architecture` | PASS |
| `npm run check:secrets` | PASS for supported patterns |
| `git diff --check` | PASS; new files also checked directly for trailing whitespace |
| Offline Drizzle generation consistency | PASS — second generation reported no schema changes |
| Original foundation SQL/snapshot and workflows | Unchanged, verified by scoped Git diff |

Actual database connections: **0**. Executed SQL statements: **0**. SQL compilation/installation and live PostgreSQL integration tests: **NOT RUN**. Offline generation produced files only; it did not execute their SQL. Manual production builds were not run and remain delegated to managed validation.

## Remaining database authorization blockers

Sprint 4B database discovery returned HTTP 401 and did not establish an independent resource ID, exact runner connection branch, immutable endpoint binding, production exclusion, disposable authorization, TLS validation or effective runtime roles/RLS. Those historical findings were not reclassified as passes, and no database metadata/SQL probe was attempted here. The managed collector blocker, protected staging inventory, branch/TLS authorization gates, hard-disabled live factories and browser/runtime import restrictions remain intact.

The Team Owner must resolve platform discovery permissions and authoritative binding evidence, then approve an exact compatible disposable target and reviewed collector. Live SQL compilation, lock privilege behavior, effective role memberships/ownership, certificate validation, behavioral RLS and concurrency testing remain separate prerequisites. No connection or migration execution is authorized by this repair.

## Exact changed files

- `db/quarantine/000_roles.sql`
- `db/quarantine/002_invariants_security.sql`
- `db/quarantine/003_restricted_commands.sql`
- `db/quarantine/README.md`
- `db/quarantine/install-order.json`
- `db/quarantine/generated/20261017052144_add_command_delivery_metadata/migration.sql`
- `db/quarantine/generated/20261017052144_add_command_delivery_metadata/snapshot.json`
- `db/schema.ts`
- `db/tests/compatibility.test.ts`
- `db/tests/disposable.integration.mjs`
- `db/tests/repositories.test.ts`
- `db/tests/schema.test.ts`
- `docs/sprint-4b1-report.md`
- `.netlify/results.md`

## Managed delivery and stop boundary

Agent Runner owns the managed GitHub review and deployment workflow. No direct Git write, PAT, review creation, push, automatic merge or manual deployment occurred. A resulting review URL and automatic deployment/build status are unavailable in-session. No workflows, active migrations, database provisioning, authentication, business endpoints, email, monitoring or payroll were changed or activated. Work stops after Sprint 4B.1; live database use remains NO-GO.
