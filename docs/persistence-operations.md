# Offline operator procedure

Sprint 2 is offline. Do not connect to staging/production, run Netlify database inspection or provisioning commands, activate Identity, move candidate files into automatic migration discovery, run push/migrate, deploy manually, or execute the application build from this task. No migration or disposable test ran during implementation. All credentials and environment values remain undisclosed.

## Candidate inventory and generation

1. `db/quarantine/000_roles.sql`: administrator bootstrap, separate restricted NOLOGIN runtime/migration roles, schema/default privilege hardening, SET ROLE for object ownership.
2. `db/quarantine/generated/20261017014340_create_identity_tenant_foundation/migration.sql`: eight generated tables, constraints, FKs and indexes. Adjacent `snapshot.json` records Drizzle generation state.
3. `db/quarantine/002_invariants_security.sql`: serializable/locking and version/lifecycle guards, deferred exactly-one-owner and completed-claim checks, append-only audit, FORCE RLS and scoped helper/policy/grant definitions.

The only generation command used was `npx --no-install drizzle-kit generate --config db/drizzle.offline.config.ts --name create_identity_tenant_foundation`. Generation writes files only; it does not initialize a database. There is no package hook or root auto-discovered config. Keep applied migrations immutable and forward-only; regenerate never-applied offline artifacts from schema when necessary, and review custom SQL separately. Do not use live platform migration reset commands for offline artifacts.

## Explicit disposable integration authorization

`db/tests/disposable.integration.mjs` is a prepared manual harness, **NOT RUN**. It is excluded from Vitest and package scripts. It is destructive to its target and creates cluster-global roles. Obtain explicit authorization for a fresh disposable database **and a dedicated isolated PostgreSQL cluster**, including candidate application, before executing. A deploy preview or a fresh staging database is not such authorization.

The authorized operator supplies a secret target through `HOURVIA_DISPOSABLE_DATABASE_URL` without printing it, with an exact database name `hourvia_disposable_` followed by 8–64 lowercase letters/digits/underscores. Only literal localhost/loopback URLs with no query/fragment are accepted; this is an additional restriction, not proof that localhost is disposable (tunnels must not point at protected environments). The environment must not select serverless transport. The command shape, shown with a non-executable placeholder, is:

```text
node db/tests/disposable.integration.mjs --authorize-disposable=<exact-authorized-database-name> --authorize-isolated-cluster --apply-quarantined-candidates
```

The three flags record authorization; they must never be inferred or automatically supplied. Pure offline tests verify the gate rejects missing flags, missing/remote/protected/ambiguous targets and inherited serverless transport. Passing this gate is not itself authorization; the human/operator approval must already exist.

After those gates, and only then, the harness initializes Netlify Database with the explicit target override. Before mutation it checks the actual database name, PostgreSQL >=15, no public application tables/views/sequences, and absence of the Hourvia cluster roles. It transactionally applies the ordered candidates, seeds synthetic data, tests privileges using SESSION AUTHORIZATION, and uses separate connections for races. Failures suppress driver detail to avoid credential leakage. Statement and lock timeouts bound mutation lock waits; the harness does not establish a pool-connect timeout, so the operator must also bound the process duration. The harness does not drop a database or cluster; destroy the entire authorized isolated cluster afterwards. Do not reuse it as staging. The privileged harness's SESSION AUTHORIZATION tests SQL permissions, not a separately issued real runtime login; actual login/credential isolation remains a release gate.

Prepared assertions cover FORCE RLS and role attributes, absent/malformed context, wrong actor/session and tenant, cross-tenant reads/joins, pooled context reset, denied identity browsing/DML/DDL/TRUNCATE/role escalation, tenant composite FKs, immediate and deferred owner failures, atomic invitation rollback, expiry and replay, parallel invitation consumption, append-only audit, pending/mismatched/duplicate idempotency and parallel key claims, full provisioning rollback, concurrent ownership transfer, stale authorization racing membership revocation, and revoked session denial. Snapshot-establishing reads make concurrent lock tests deterministic. These assertions are preparation, not evidence of PostgreSQL behavior until executed successfully against an authorized target.

Before live activation, additionally review/test the future bootstrap and command routines, wrong verified recipient/digest at their real trusted boundary, ADMIN restrictions, pooled driver disconnects/COMMIT loss, runtime credentials, platform role support, outbox if introduced, backup/restore, retention and schema/security drift. Offline mocks prove state-machine handling, not physical durability, PostgreSQL scheduling or platform behavior.

## Unknown COMMIT recovery

Never respond with success after COMMIT transport loss, unexpected tags or a returned ROLLBACK. Discard the uncertain connection. Keep the same idempotency scope/key/input digest and reauthenticate through a fresh trusted connection. Read the authoritative committed result through a scoped reviewed operation. Matching completed result permits replay; mismatched digest is conflict. If absent, reserve/retry the same unique key with bounded waiting and fresh authorization; absence alone does not prove the original attempt aborted. A later rollback acknowledgement cannot resolve an earlier uncertain COMMIT.

## Validation and handoff

Allowed checks: typecheck, lint, unit tests, architecture and secret scan. `npm run build` is **NOT EXECUTED** because this environment prohibits build commands and delegates builds to the platform. No platform build result is claimed. PostgreSQL integration is **NOT RUN** without the authorization above. There are no git commits, branch pushes, direct PR creation, merges or deployments; the hosting system handles delivery. `.github/workflows/` must remain untouched. Stop at Sprint 2.
