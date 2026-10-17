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
