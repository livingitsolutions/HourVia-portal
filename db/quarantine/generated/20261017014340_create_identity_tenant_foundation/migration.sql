CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"aggregate_version" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_tenant_id" UNIQUE("organization_id","id"),
	CONSTRAINT "audit_version" CHECK ("aggregate_version" >= 0),
	CONSTRAINT "audit_action" CHECK (length("action") between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"actor_id" uuid NOT NULL,
	"organization_id" uuid,
	"scope" text NOT NULL,
	"operation" text NOT NULL,
	"key" text NOT NULL,
	"input_digest" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"outcome" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "idempotency_claim" UNIQUE("actor_id","scope","operation","key"),
	CONSTRAINT "idempotency_scope" CHECK (("organization_id" is null and "scope" = 'creator' and "operation" = 'provision') or ("organization_id" is not null and "scope" = "organization_id"::text and "operation" in ('transfer','membership','invite','accept'))),
	CONSTRAINT "idempotency_key" CHECK ("key" ~ '^[A-Za-z0-9_-]{16,128}$'),
	CONSTRAINT "idempotency_digest" CHECK ("input_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "idempotency_outcome" CHECK (("state" = 'pending' and "outcome" is null) or ("state" = 'completed' and "outcome" is not null and jsonb_typeof("outcome") = 'object')),
	CONSTRAINT "idempotency_version" CHECK ("version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "provider_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"verified_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "identity_provider_subject" UNIQUE("issuer","subject"),
	CONSTRAINT "identity_user_pair" UNIQUE("user_id","id"),
	CONSTRAINT "identity_nonempty" CHECK (length("issuer") > 0 and length("subject") > 0),
	CONSTRAINT "identity_version" CHECK ("version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"credential_digest" text NOT NULL CONSTRAINT "invitation_digest" UNIQUE,
	"inviter_membership_id" uuid NOT NULL,
	"accepted_membership_id" uuid,
	"accepted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invitation_tenant_id" UNIQUE("organization_id","id"),
	CONSTRAINT "invitation_role" CHECK ("role" in ('ADMIN','MANAGER','EMPLOYEE','CONTRACTOR')),
	CONSTRAINT "invitation_state" CHECK ("state" in ('pending','accepted','revoked','expired')),
	CONSTRAINT "invitation_email" CHECK ("email" = lower(trim("email")) and "email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
	CONSTRAINT "invitation_digest_format" CHECK ("credential_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "invitation_expiry" CHECK ("expires_at" > "created_at"),
	CONSTRAINT "invitation_acceptance" CHECK (("state" = 'accepted' and "accepted_membership_id" is not null and "accepted_at" is not null and "accepted_at" < "expires_at") or ("state" <> 'accepted' and "accepted_membership_id" is null and "accepted_at" is null)),
	CONSTRAINT "invitation_version" CHECK ("version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"monitoring_delegated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "membership_user" UNIQUE("organization_id","user_id"),
	CONSTRAINT "membership_tenant_id" UNIQUE("organization_id","id"),
	CONSTRAINT "membership_role" CHECK ("role" in ('OWNER','ADMIN','MANAGER','EMPLOYEE','CONTRACTOR')),
	CONSTRAINT "membership_state" CHECK ("status" in ('active','suspended','revoked')),
	CONSTRAINT "owner_active" CHECK ("role" <> 'OWNER' or "status" = 'active'),
	CONSTRAINT "delegation_scope" CHECK (not "monitoring_delegated" or ("role" = 'MANAGER' and "status" = 'active')),
	CONSTRAINT "membership_version" CHECK ("version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"status" text DEFAULT 'provisioning' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "organization_state" CHECK ("status" in ('provisioning','active','suspended','closed')),
	CONSTRAINT "organization_name" CHECK (length(trim("name")) between 1 and 200),
	CONSTRAINT "organization_version" CHECK ("version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "session_expiry" CHECK ("expires_at" > "created_at"),
	CONSTRAINT "session_version" CHECK ("version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "global_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "users_state" CHECK ("status" in ('active','disabled')),
	CONSTRAINT "users_version" CHECK ("version" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pending_recipient" ON "invitations" ("organization_id","email") WHERE "state" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_owner" ON "memberships" ("organization_id") WHERE "role" = 'OWNER' and "status" = 'active';--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_actor_tenant" FOREIGN KEY ("organization_id","actor_membership_id") REFERENCES "memberships"("organization_id","id");--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_actor_id_global_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "global_users"("id");--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_actor_tenant" FOREIGN KEY ("organization_id","actor_id") REFERENCES "memberships"("organization_id","user_id");--> statement-breakpoint
ALTER TABLE "provider_identities" ADD CONSTRAINT "provider_identities_user_id_global_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "global_users"("id");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitation_inviter_tenant" FOREIGN KEY ("organization_id","inviter_membership_id") REFERENCES "memberships"("organization_id","id");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitation_acceptor_tenant" FOREIGN KEY ("organization_id","accepted_membership_id") REFERENCES "memberships"("organization_id","id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_global_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "global_users"("id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_global_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "global_users"("id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "session_identity_user" FOREIGN KEY ("user_id","identity_id") REFERENCES "provider_identities"("user_id","id");