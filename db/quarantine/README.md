# Offline candidate installation contract

Nothing in this directory is an active migration or an execution authorization.
No installer runs on import, test, build or deploy. Do not execute these candidates
against staging or a target whose identity, TLS, role scope and authorization are
unverified. The existing collector and protected-target gates remain mandatory.

`install-order.json` is a declarative review manifest, not an executable installer.
For a future separately approved **fresh** disposable target, a reviewed installer
must use one pinned bootstrap-admin connection and one caller-owned SERIALIZABLE
transaction. Set the transaction-local search path to `public` for the
unqualified generated DDL: PostgreSQL implicitly searches pg_catalog first, while
the creation namespace is public. Explicitly putting pg_catalog first would make
unqualified CREATE TABLE target pg_catalog. Before **every** phase set LOCAL ROLE to the
manifest role (`NONE` means the bootstrap session identity). Never depend on the
preceding file's role. None of the fragments may BEGIN or COMMIT the transaction.
Only acknowledge success after the final COMMIT acknowledgment; on a phase error
ROLLBACK, and on uncertain COMMIT discard the connection and retain uncertainty.
No automatic retries or replay of installation are authorized.

The dependency order is roles → generated foundation → invariants/RLS → generated
command metadata delta → restricted commands. Lexical traversal of this directory
is invalid. The invariants file sets its own LOCAL migration role and clears it;
the command file explicitly clears LOCAL ROLE to install as bootstrap. Default
privilege changes name their target role instead of leaking a session SET ROLE.
The generated delta runs as migration owner and therefore does not require a
later table-ownership transfer for the delivery queue. The command functions are
transferred to their isolated owner inside the still-open installation transaction.

The original generated SQL and version-8 snapshot are historical foundation
artifacts and remain unchanged. The new generated SQL/snapshot pair is a forward
structural delta: delivery table, composite invitation FK, constraints and audit
correlation index. Current `db/schema.ts` describes that structural result. No
candidate was applied here. If any prior candidate has been installed elsewhere,
do not replay this fresh-target plan or rewrite its applied migration history;
inventory it under separate authorization and prepare a reviewed forward-only
reconciliation migration for that exact state.

Installed Drizzle ORM/Kit beta.22 can represent the structural delta but has no
PostgreSQL foreign-key deferrability builder. The existing explicit ALTER in 003
remains the authoritative `idempotency_actor_tenant` deferral overlay. RLS,
privileges, definer ownership and triggers likewise live in reviewed SQL overlays,
not a purported full Drizzle snapshot. Never regenerate/apply a structural diff as
a complete security installation or assume it captures these manual semantics.
No custom metadata property or undocumented driver API is used.
ORM implicit foreign-key `getName()` uses an `_fk` suffix, whereas this Kit
version emits PostgreSQL-style `_fkey` names. Compatibility checks compare the
referenced tables/columns for implicit names and exact names only when explicit;
no adapter depends on an invented implicit catalog name.

`hourvia_command` receives UPDATE on `id` only for users/sessions, because locking
SELECT requires UPDATE permission even without DML. Its UPDATE RLS policies have
WITH CHECK(false); existing identity/version triggers also prevent updating that
key. The runtime receives no such grant and cannot SET the command role. Role
membership and effective PUBLIC/inherited privileges still require live review.
Every existing FOR UPDATE on organizations, memberships, invitations or claims
already has command-owner table UPDATE; invariant-trigger locks run as migration
owner. No lock or revocation check was removed.

The old loopback integration harness remains foundation-only and explicitly pins
that historical file; it is not a full command installer. It was not executed.
All source/metadata and simulated-driver tests are offline and prove no live SQL
compilation, privileges, tenant isolation, RLS, transaction or concurrency behavior.
