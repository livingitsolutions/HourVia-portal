CREATE TABLE "invitation_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"delivery_key" uuid NOT NULL CONSTRAINT "delivery_key" UNIQUE,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT transaction_timestamp() NOT NULL,
	"lease_until" timestamp with time zone,
	"provider_reference" text,
	"last_error_code" text,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "delivery_invitation" UNIQUE("organization_id","invitation_id"),
	CONSTRAINT "delivery_state" CHECK ("state" in ('queued','leased','delivered','failed','cancelled')),
	CONSTRAINT "delivery_attempts" CHECK ("attempts" >= 0 and "attempts" <= 10),
	CONSTRAINT "delivery_error" CHECK ("last_error_code" is null or "last_error_code" in ('unavailable','rate_limited','rejected')),
	CONSTRAINT "delivery_version" CHECK ("version" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "audit_command_correlation" ON "audit_events" ("organization_id","correlation_id");--> statement-breakpoint
ALTER TABLE "invitation_deliveries" ADD CONSTRAINT "delivery_invitation_tenant" FOREIGN KEY ("organization_id","invitation_id") REFERENCES "invitations"("organization_id","id");