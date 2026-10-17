# Isolated Netlify Database verification — operator runbook

Design only, 2026-10-17. **BLOCKED / NO-GO for provisioning or connection.** This document is not authorization or an executable runner. No connection command, migration, cleanup script, SDK initialization, or ambient credential lookup is added. Stop at the first missing capability or evidence; record UNVERIFIED, never PASS. Resolve the blockers in the Sprint 2.2C report before a separately authorized session implements collectors or connects.

## Approval boundaries

1. **Before provisioning:** a Team Owner approves a new project named `hourvia-v3-db-verification`, dedicated new database, budget, region, disposable label, independent credentials, protected-resource inventory, accountable operator and teardown owner. Verify plan eligibility, ownership, available identity evidence, role issuance and complete supported teardown first. This sprint grants none of these approvals.
2. **Before connecting:** obtain separate read-only diagnostic approval bound to the reviewed commit, collector version, permitted fixed statements, exact identity tuple, evidence references, deadline and allowed log fields. No wildcard targets. No permission for migrations, fixtures, role creation, writes or security integration tests is implied.
3. **Before teardown:** obtain explicit approval bound to those exact resource IDs and the owner-controlled deletion operation. Teardown is a later destructive platform operation, outside the read-only diagnostic. Do not perform SQL cleanup.

Preserve `authorizeManaged`, `prepareManagedConnection`, `verifyManaged`, `confirmTeardown` and the unconditional `requireManagedCollectors` blocker. Do not convert human assertions or synthetic fixtures into authoritative observations. A future collector requires separate review; this runbook does not bypass that blocker. Do not call the existing local integration runner: it applies candidates and requires loopback/superuser authorization.

## Dedicated project setup, after blockers and approval

Use the Netlify UI as a Team Owner in Living IT Solutions. Create a separate project and verify its assigned ID, owner team ID and exact name. Do not reuse, rename, clone a database from, or relink this workspace to `hourvia-v3-staging`. Do not use staging deploy previews: they copy the parent project's production database. Do not import data, snapshots, credentials or team-shared application secrets.

The exact project-creation path that creates an empty project without an automatic deploy is UNVERIFIED in this review. Confirm it with the platform before proceeding; stop if setup requires an unapproved deploy. Do not use agent scaffolding or `netlify create`, which can generate migrations and deploy. Keep automatic Git deploys, migration discovery, application functions, authentication, APIs and monitoring inactive in the verification project. An isolated operator workspace must contain no migration-discovery directory or automatic database initialization.

Official Getting started documentation supports **Data & Storage > Database > Create a database manually** for provisioning without a code-first migration/deploy flow. The documented REST alternative is `POST /sites/{site_id}/database`, using supported OAuth authentication, not a new PAT. It returns a credential-bearing response and can return an existing database (200) instead of creating one (201). Neither a name nor a 201 response alone establishes full ownership or freshness. Do not call it until the new project is independently identified and creation approved. No platform API is called in this sprint.

After provisioning, capture redacted creation/ownership evidence and the provider's immutable database/branch identifiers. Obtain credentials via a supported secret mechanism for this project only. Do not print or persist credential values in tracked files, approvals, logs, shell history or results. If the provider cannot supply the required identity mapping, independent restricted logins or revocation evidence, stop and follow only the separately approved teardown procedure.

## Evidence required before the first connection

Record nonsecret evidence references, collection times, operator identity and:

- Team ID, exact project name and project ID; the team must be the approved owner.
- Database resource ID, branch ID, physical database name, exact hostname, port and intended login identity. Bind project → database → branch → endpoint using authoritative platform evidence, independently of the supplied URL. SQL database names, DNS resolution and a valid TLS certificate cannot prove this ownership mapping.
- New-resource provenance, no import/restore/fork from any protected source, and supported teardown/revocation route with a Team Owner available.
- Complete production/staging inventory including project `368baa52-efc2-4775-ba46-da764d51ec2b`, its database IDs and hosts. Reject any match on project, database or host using the existing gate. Never infer disposability from an existing project's database or the proposed verification name.
- External label matching `hourvia_disposable_[a-z0-9_]{8,64}`. A provider's internal branch label `production` is only acceptable inside an independently verified new verification project/database; it never authorizes an application production target.

Use the existing five-minute approval limit and maximum one-minute provenance age, renewing independent evidence as necessary. Post-connection observations must be at most five seconds old when checked. Redacted evidence belongs in the operator's approved audit location; credentials never belong in it.

## TLS, transport and resource bounds

Use only a reviewed, explicit-target, server-side PostgreSQL client with the existing pure TLS policy. Do not call `getDatabase()` or `getConnectionString()` with ambient defaults. The installed SDK does not expose the explicit TLS options needed by this policy. A later executable collector must declare its driver dependency rather than rely on a transitive dependency.

Require certificate-chain validation, default hostname validation and SNI for the approved hostname; reject global TLS bypass, all URL query overrides/fragments, alternate ports and endpoint substitutions. Never disable certificate verification, infer a direct hostname or fall back to plaintext. Custom CA and managed pooling behavior remain UNVERIFIED. Observe successful TLS authorization and expected hostname through a reviewed driver-supported mechanism; server `pg_stat_ssl` is supplemental and cannot prove client hostname/chain validation. If that observation interface cannot be verified, stop before SQL.

Apply the existing bounds: at most two clients, five-second connection/statement timeout, two-second lock timeout, ten-second idle-in-transaction timeout and five-minute overall deadline. A later runner must enforce cancellation, close clients on timeout/signals/errors and prevent work after approval expiry; constants alone do not enforce a deadline. No automatic retries or alternate targets. Log only fixed diagnostic IDs, classified outcomes, counts and evidence references; suppress URLs, configuration objects, parameters, raw rows, certificate dumps and raw driver/API errors.

## Fixed read-only diagnostic design

No statements below are executed in this sprint. A future reviewed runner allows only a fixed statement catalog, parameterizes values, pins each transaction to one client, verifies transaction command tags and always ends probes with `ROLLBACK`. It exposes no SQL textbox, callback accepting arbitrary SQL, migration file loader, DDL, DML, sequence calls, user routines, `SET ROLE`, `SET SESSION AUTHORIZATION`, `DISCARD ALL` or transaction candidate execution. PostgreSQL READ ONLY alone is not a SQL sandbox; fixed statements and restricted credentials are also required.

Start each metadata probe with `BEGIN READ ONLY`; confirm `current_setting('transaction_read_only') = 'on'` before further queries. Use bounded, reviewed catalog reads with `pg_catalog`-qualified relations and built-in functions. Stop on incomplete catalog visibility, unexpected role, identity mismatch, missing privilege or unknown results. No raw application data is selected.

| Probe | Approved read-only inspection design | Required interpretation |
| --- | --- | --- |
| Server identity/version | `current_database()`, `session_user`, `current_user`, `current_setting('server_version_num')`, `pg_backend_pid()`; supplementary `inet_server_addr()` / `inet_server_port()` | Match approved physical name/login; PostgreSQL 15+; compare independent provider mapping. Null/proxy addresses never prove identity. |
| Effective limits | Read only named settings: `transaction_read_only`, `statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout` | Confirm effective limits rather than configuration intent; no unrestricted settings dump. |
| Effective roles | Selected nonsecret attributes from `pg_roles`; membership edges from `pg_auth_members`; `pg_has_role` for approved role OIDs | Inspect session/effective role, superuser, BYPASSRLS, CREATEROLE, CREATEDB, inheritance and transitive SET/inheritance paths using version-appropriate semantics. Never read password catalogs. |
| Privileges/ownership | `pg_database`, `pg_namespace`, `pg_class`, `pg_default_acl`, `pg_proc` metadata plus `has_database_privilege`, `has_schema_privilege`, `has_table_privilege`, `has_function_privilege` | Account for PUBLIC and inherited grants, database/schema/table ownership and executable SECURITY DEFINER routines. Do not invoke inspected routines. Runtime must lack ownership/elevation paths; permission to create roles is not proof of isolated role scope. |
| RLS prerequisites | `pg_class.relrowsecurity`, `relforcerowsecurity`, owners, `pg_policy` metadata and relevant grants | Restricted runtime must have neither superuser nor BYPASSRLS nor ownership/SET path to migration role. FORCE RLS constrains ordinary owners, not superusers/BYPASSRLS. No relations/policies means applicability is UNVERIFIED, not enforced. |
| Freshness | Catalog inventory of schemas, all relation kinds, types, routines, extensions, Hourvia roles, migration relations, default privileges and `pg_stat_activity` session counts | Compare complete inventory with an explicitly reviewed provider baseline. No automatic metadata exemption. Missing visibility fails; no public-schema-only check. No migration rows or application rows need reading. |

Freshness requires zero unexpected schemas, relations, types, routines, extra extensions, Hourvia roles, migration state and other sessions under the existing contract. Provider baseline differences need a separate reviewed policy decision, not a weakened gate. Empty catalogs cannot prove the resource was newly created or never held protected data; require creation provenance too. Metadata inspection cannot prove all possible privilege escalation paths or behavioral RLS isolation; retain those limits in the assessment.

### Transaction-local context probe

Only after session affinity, secure transport and restricted-role access are established, use one pinned connection for the following sequence. This probe changes transient transaction-local settings only; it writes no database objects or rows. It requires explicit inclusion in the future read-only approval. If the provider forbids it, classify the capability UNVERIFIED and stop rather than substitute session-wide settings.

1. In a read-only transaction, read `current_setting(name, true)` for the four approved keys: `hourvia.actor_id`, `hourvia.session_id`, `hourvia.organization_id`, `hourvia.operation`. Require missing/empty values at baseline; use fixed synthetic nonpersonal context only.
2. Use parameterized built-in `pg_catalog.set_config(name, value, true)` for those fixed keys, with `true` selecting transaction-local scope. Confirm exact values with `current_setting` and verify unchanged backend PID within that transaction.
3. Require an acknowledged `ROLLBACK`. In a new read-only transaction on the same checked-out connection, require all four values to be absent/empty again and finish with acknowledged `ROLLBACK`. PostgreSQL can retain empty placeholders for custom settings; any nonempty value is a failure.
4. Repeat the baseline check after releasing and reacquiring through the approved pool, recording whether the same backend is actually observed. A different backend does not prove reuse cleanup. If safe, observed reuse cannot be established within bounds, classify reuse cleanup UNVERIFIED. Discard on failure or uncertain transaction completion, then close the pool.

This assesses local context after rollback only. Successful-COMMIT cleanup, transaction adapter behavior, RLS denial, concurrency and lost-COMMIT reconciliation remain separate integration work, NOT RUN. Do not use `runCandidate`, which performs broader session control and permits business work.

## Role assessment and stop conditions

Use separately issued diagnostic/runtime and migration login credentials only if the provider supports them; inspect each in a separate approved connection, never impersonate one using the other's elevated session. No roles are created or altered by this diagnostic. A single powerful credential or the Netlify dashboard's Developer read-only connection option does not establish the application's role separation.

Record each claim as VERIFIED from scoped evidence, UNSUPPORTED from authoritative platform evidence, or UNVERIFIED. Catalog grants may support a capability assessment; they cannot prove that independent credentials can be issued/revoked, migration execution uses the intended principal, cluster-global roles are confined, or future CREATE ROLE / FORCE RLS DDL succeeds. Those require platform confirmation or separately approved later tests. Existing `verifyManaged` requires all role claims plus TLS/identity/freshness: do not invoke it with invented positive booleans. Missing roles on a fresh target remain a blocker, never an instruction to bootstrap them.

## Teardown procedure — later, separately approved platform action

Before creating resources, verify that the authorized Team Owner can access the documented database deletion control and obtain authoritative evidence of credential/role cleanup. This capability is not proven by the docs alone.

After a diagnostic completes, fails or is cancelled: stop further work, acknowledge rollback where possible, discard uncertain connections, close all clients/pools and retain redacted outcomes. The Team Owner rechecks the approved project/database identity and, under separate teardown approval, uses the dedicated deletion section at the bottom of **Data & Storage > Database**. Official docs state deletion permanently removes data across every branch and snapshot. Do not execute that operation in this sprint.

Verify database absence via the supported platform interface and obtain provider confirmation of issued credential revocation and cluster-role cleanup. Never reconnect with old credentials to test deletion within this workflow. Project deletion alone, a failed connection, local `database reset`, branch deletion or a 204 branch response is not proof that the dedicated database was deleted. No complete-database DELETE REST endpoint is established by the reviewed API reference; do not invent one.

Only after database cleanup is independently confirmed may the operator retire the empty project through a separately verified supported project-management route; exact project-removal mechanics remain UNVERIFIED here. If deletion or revocation cannot be confirmed, record TEARDOWN_UNCONFIRMED, retain ownership and escalate to platform support. Do not delete unrelated resources or attempt destructive SQL. Populate `confirmTeardown` only from authoritative evidence, never as a cleanup implementation.
