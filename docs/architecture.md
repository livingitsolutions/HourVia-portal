# Sprint 0 foundation

Presentation owns React, routing, transient theme and navigation state. Application owns validated query inputs and source ports. Infrastructure provides a static demonstration source. Domain owns framework-independent contracts and invariant predicates. No persistent state exists. Demo fixtures are not a persistence implementation. No V1 or V2 source was imported.

The composition connects the demonstration source in presentation. Production composition must replace it only after backend authorization is implemented. Local checks enforce inward dependencies and prohibit domain package imports. They are guardrails, not full static security analysis.

## Organization isolation and ownership

Every tenant record must carry a non-null organization ID. Personal workspaces are unsupported. A user can have multiple memberships, uniquely constrained by (organization ID, user ID), with OWNER, ADMIN, MANAGER, EMPLOYEE, or CONTRACTOR roles. Exactly one OWNER must exist per organization. Creation and owner transfer must be atomic; serialize concurrent ownership changes and prevent deletion or demotion of the sole owner. The domain predicates document these rules but do not constitute authorization or database enforcement.

Future Netlify Functions must authenticate identity, derive actor ID from verified server-side credentials, validate request schemas, load the actor's membership for the requested organization, and enforce an explicit deny-by-default permission policy for every action. Never trust browser roles, IDs, dashboard state, or membership predicates as proof of authority. Active organization selection is a navigation preference only. Invitations require expiring single-use tokens and server-side role checks. Owner transfers require a dedicated secured operation.

PostgreSQL and Drizzle are planned for later sprints. Future isolation must combine organization-scoped queries, composite tenant foreign keys, unique constraints, and row-level security with transaction-local tenant context. Runtime database roles must not bypass RLS. Test cross-tenant reads, writes, joins, background tasks, and owner-transfer races before activation. No connections, schemas, migrations, or database provisioning are included here.

Audit records must be organization scoped, append-only, and redact credentials and sensitive payloads. No audit or monitoring collection is activated. Desktop monitoring is future work, OFF by default, requiring permissions, notice, and consent. Payroll, salary disbursement, statutory deductions, and payslips are excluded.

## Deployment

Netlify builds the Vite app and serves browser routes through the SPA fallback. The Functions directory is reserved and contains no executable endpoints. Headers restrict framing and browser device access. Authentication, authorization enforcement, business APIs, external data, and production operations remain inactive. The demonstration workspace is intentionally public and is not a protected application.

# Sprint 1 identity and organization contracts

The Sprint 0 dashboard, source ports and public routes remain intact. New domain modules define identity values, explicit results, the role/permission matrix, organization aggregate validation, immutable membership and ownership proposals, and invitation state transitions. Application modules define provider and identity repository ports, a server principal resolver factory, a server authorization evaluator, organization use-case interfaces, scoped repositories, and atomic transaction ports. No concrete organization command implementation or HTTP endpoint is exposed. The browser imports only the public permission policy for demonstration rendering; it does not compose the server resolver.

## Application boundary obligations

All organization use cases obtain the actor through PrincipalResolver, validate unknown request inputs at their future transport boundary, use injected clock/repositories/transactions, return Result with explicit safe errors, and deny missing dependencies. No browser actor ID or role is accepted by the command interfaces. Create and acceptance are special bootstrapping operations; they must not use a tenant preference as authorization.

| Use case | Required checks and atomic outcome |
| --- | --- |
| Create organization | Verified identity; validate name; creator-scoped idempotency; atomic organization plus exactly one OWNER, audit and result |
| Get current user's organizations | Verified identity; scoped query returns only active memberships and accessible organizations |
| Select organization | Verify active organization/membership; return context derived from principal; preference grants no additional access |
| Invite member | membership.admin; active organization; actor/target role restrictions; non-owner role; normalized recipient; pending duplicate protection; expiring credential digest and outbox |
| Accept invitation | Verified identity/email and credential digest; pending unexpired invitation; active organization; no conflicting membership; atomic membership activation, invitation consumption, audit and version |
| Change role | membership.admin plus target restrictions; forbid OWNER mutation or assignment; ADMIN cannot alter/grant ADMIN; clear delegation |
| Suspend/revoke membership | membership.admin plus target restrictions; forbid OWNER; revoke terminal; recheck actor/session under tenant lock |
| Activate membership | Same authorized boundary; only suspended membership; no implicit reactivation of revoked membership |
| Transfer ownership | Active current OWNER, active different recipient in same tenant, fresh version; single atomic proposal and commit |
| Evaluate authorization | Resolve identity, load current organization membership, check tenant/resource/action with deny-by-default policy |

Every mutation requires an idempotency key and expected aggregate version (invitation acceptance uses invitation version). Store and compare versions in the transaction; an in-process proposal cannot serialize concurrent callers. The future adapter must increment aggregate versions for invitation/membership mutations too. Transaction port failures and thrown errors roll back the complete operation.

See [security.md](security.md) for trust boundaries and [persistence-design.md](persistence-design.md) for the future PostgreSQL/Drizzle plan. Sprint 1 stops at enforceable pure rules, ports, demonstrations and unit tests. Production cryptographic authentication, persistence enforcement, monitoring and protected business APIs remain inactive.
