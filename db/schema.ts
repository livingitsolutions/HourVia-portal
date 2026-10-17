/** Offline metadata only. Importing this module never creates a database client. */
import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, unique, uniqueIndex, foreignKey, check } from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const time = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const lifecycle = () => ({ createdAt: time('created_at').notNull().defaultNow(), updatedAt: time('updated_at').notNull().defaultNow(), version: integer('version').notNull().default(0) });

export const users = pgTable('global_users', {
  id: id(), status: text('status').notNull().default('active'), ...lifecycle(),
}, t => [check('users_state', sql`${t.status} in ('active','disabled')`), check('users_version', sql`${t.version} >= 0`)]);
export const identities = pgTable('provider_identities', {
  id: id(), userId: uuid('user_id').notNull().references(() => users.id), issuer: text('issuer').notNull(), subject: text('subject').notNull(),
  verifiedEmail: text('verified_email'), ...lifecycle(),
}, t => [unique('identity_provider_subject').on(t.issuer, t.subject), unique('identity_user_pair').on(t.userId, t.id), check('identity_nonempty', sql`length(${t.issuer}) > 0 and length(${t.subject}) > 0`), check('identity_version', sql`${t.version} >= 0`)]);
export const sessions = pgTable('sessions', {
  id: id(), userId: uuid('user_id').notNull().references(() => users.id), identityId: uuid('identity_id').notNull(),
  expiresAt: time('expires_at').notNull(), revokedAt: time('revoked_at'), ...lifecycle(),
}, t => [foreignKey({ name: 'session_identity_user', columns: [t.userId, t.identityId], foreignColumns: [identities.userId, identities.id] }), check('session_expiry', sql`${t.expiresAt} > ${t.createdAt}`), check('session_version', sql`${t.version} >= 0`)]);
export const organizations = pgTable('organizations', {
  id: id(), name: text('name').notNull(), status: text('status').notNull().default('provisioning'), ...lifecycle(),
}, t => [check('organization_state', sql`${t.status} in ('provisioning','active','suspended','closed')`), check('organization_name', sql`length(trim(${t.name})) between 1 and 200`), check('organization_version', sql`${t.version} >= 0`)]);
export const memberships = pgTable('memberships', {
  id: id(), organizationId: uuid('organization_id').notNull().references(() => organizations.id), userId: uuid('user_id').notNull().references(() => users.id),
  role: text('role').notNull(), status: text('status').notNull().default('active'), monitoringDelegated: boolean('monitoring_delegated').notNull().default(false), ...lifecycle(),
}, t => [unique('membership_user').on(t.organizationId, t.userId), unique('membership_tenant_id').on(t.organizationId, t.id),
  uniqueIndex('one_active_owner').on(t.organizationId).where(sql`${t.role} = 'OWNER' and ${t.status} = 'active'`),
  check('membership_role', sql`${t.role} in ('OWNER','ADMIN','MANAGER','EMPLOYEE','CONTRACTOR')`),
  check('membership_state', sql`${t.status} in ('active','suspended','revoked')`), check('owner_active', sql`${t.role} <> 'OWNER' or ${t.status} = 'active'`),
  check('delegation_scope', sql`not ${t.monitoringDelegated} or (${t.role} = 'MANAGER' and ${t.status} = 'active')`), check('membership_version', sql`${t.version} >= 0`)]);
export const invitations = pgTable('invitations', {
  id: id(), organizationId: uuid('organization_id').notNull().references(() => organizations.id), email: text('email').notNull(), role: text('role').notNull(),
  state: text('state').notNull().default('pending'), credentialDigest: text('credential_digest').notNull(), inviterMembershipId: uuid('inviter_membership_id').notNull(),
  acceptedMembershipId: uuid('accepted_membership_id'), acceptedAt: time('accepted_at'), expiresAt: time('expires_at').notNull(), ...lifecycle(),
}, t => [unique('invitation_tenant_id').on(t.organizationId, t.id), unique('invitation_digest').on(t.credentialDigest),
  uniqueIndex('pending_recipient').on(t.organizationId, t.email).where(sql`${t.state} = 'pending'`),
  foreignKey({ name: 'invitation_inviter_tenant', columns: [t.organizationId, t.inviterMembershipId], foreignColumns: [memberships.organizationId, memberships.id] }),
  foreignKey({ name: 'invitation_acceptor_tenant', columns: [t.organizationId, t.acceptedMembershipId], foreignColumns: [memberships.organizationId, memberships.id] }),
  check('invitation_role', sql`${t.role} in ('ADMIN','MANAGER','EMPLOYEE','CONTRACTOR')`), check('invitation_state', sql`${t.state} in ('pending','accepted','revoked','expired')`),
  check('invitation_email', sql`${t.email} = lower(trim(${t.email})) and ${t.email} ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'`),
  check('invitation_digest_format', sql`${t.credentialDigest} ~ '^[0-9a-f]{64}$'`), check('invitation_expiry', sql`${t.expiresAt} > ${t.createdAt}`),
  check('invitation_acceptance', sql`(${t.state} = 'accepted' and ${t.acceptedMembershipId} is not null and ${t.acceptedAt} is not null and ${t.acceptedAt} < ${t.expiresAt}) or (${t.state} <> 'accepted' and ${t.acceptedMembershipId} is null and ${t.acceptedAt} is null)`), check('invitation_version', sql`${t.version} >= 0`)]);
export const auditEvents = pgTable('audit_events', {
  id: id(), organizationId: uuid('organization_id').notNull().references(() => organizations.id), actorMembershipId: uuid('actor_membership_id').notNull(),
  action: text('action').notNull(), targetId: uuid('target_id').notNull(), correlationId: uuid('correlation_id').notNull(),
  aggregateVersion: integer('aggregate_version').notNull(), occurredAt: time('occurred_at').notNull().defaultNow(),
}, t => [unique('audit_tenant_id').on(t.organizationId, t.id), foreignKey({ name: 'audit_actor_tenant', columns: [t.organizationId, t.actorMembershipId], foreignColumns: [memberships.organizationId, memberships.id] }), check('audit_version', sql`${t.aggregateVersion} >= 0`), check('audit_action', sql`length(${t.action}) between 1 and 100`)]);
export const idempotencyRecords = pgTable('idempotency_records', {
  id: id(), actorId: uuid('actor_id').notNull().references(() => users.id), organizationId: uuid('organization_id').references(() => organizations.id),
  scope: text('scope').notNull(), operation: text('operation').notNull(), key: text('key').notNull(), inputDigest: text('input_digest').notNull(),
  state: text('state').notNull().default('pending'), outcome: jsonb('outcome'), ...lifecycle(),
}, t => [unique('idempotency_claim').on(t.actorId, t.scope, t.operation, t.key),
  foreignKey({ name: 'idempotency_actor_tenant', columns: [t.organizationId, t.actorId], foreignColumns: [memberships.organizationId, memberships.userId] }),
  check('idempotency_scope', sql`(${t.organizationId} is null and ${t.scope} = 'creator' and ${t.operation} = 'provision') or (${t.organizationId} is not null and ${t.scope} = ${t.organizationId}::text and ${t.operation} in ('transfer','membership','invite','accept'))`),
  check('idempotency_key', sql`${t.key} ~ '^[A-Za-z0-9_-]{16,128}$'`), check('idempotency_digest', sql`${t.inputDigest} ~ '^[0-9a-f]{64}$'`),
  check('idempotency_outcome', sql`(${t.state} = 'pending' and ${t.outcome} is null) or (${t.state} = 'completed' and ${t.outcome} is not null and jsonb_typeof(${t.outcome}) = 'object')`), check('idempotency_version', sql`${t.version} >= 0`)]);
