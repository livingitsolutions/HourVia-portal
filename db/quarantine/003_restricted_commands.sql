-- QUARANTINED DESIGN CANDIDATE; never an active migration. NOT EXECUTED.
-- Review/apply only after 000, generated schema and 002 on an authorized disposable target.
-- Administrator-only installation. Never grant command-owner membership to runtime logins.
BEGIN;
RESET ROLE;
CREATE ROLE hourvia_command NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO hourvia_command;
GRANT SELECT ON public.global_users, public.sessions, public.provider_identities TO hourvia_command;
GRANT SELECT, INSERT, UPDATE ON public.organizations, public.memberships, public.invitations, public.idempotency_records TO hourvia_command;
GRANT INSERT ON public.audit_events TO hourvia_command;
GRANT EXECUTE ON FUNCTION public.hv_actor() TO hourvia_command;
CREATE POLICY command_users ON public.global_users FOR SELECT TO hourvia_command USING (true);
CREATE POLICY command_sessions ON public.sessions FOR SELECT TO hourvia_command USING (true);
CREATE POLICY command_identities ON public.provider_identities FOR SELECT TO hourvia_command USING (true);
CREATE POLICY command_organizations ON public.organizations TO hourvia_command USING (true) WITH CHECK (true);
CREATE POLICY command_memberships ON public.memberships TO hourvia_command USING (true) WITH CHECK (true);
CREATE POLICY command_invitations ON public.invitations TO hourvia_command USING (true) WITH CHECK (true);
CREATE POLICY command_claims ON public.idempotency_records TO hourvia_command USING (true) WITH CHECK (true);
CREATE POLICY command_audit ON public.audit_events FOR INSERT TO hourvia_command WITH CHECK (true);

CREATE UNIQUE INDEX audit_command_correlation ON public.audit_events(organization_id,correlation_id);

-- Business state stays in invitations. This queue contains no raw or encrypted token.
-- Future delivery must use a reviewed secure credential exchange, not reconstruct a token from its digest.
CREATE TABLE public.invitation_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  invitation_id uuid NOT NULL,
  delivery_key uuid NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','leased','delivered','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 10),
  next_attempt_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  lease_until timestamptz,
  provider_reference text,
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code IN ('unavailable','rate_limited','rejected')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  UNIQUE (organization_id, invitation_id),
  FOREIGN KEY (organization_id, invitation_id) REFERENCES public.invitations(organization_id,id)
);
ALTER TABLE public.invitation_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_deliveries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.invitation_deliveries FROM PUBLIC, hourvia_runtime;
GRANT SELECT, INSERT, UPDATE ON public.invitation_deliveries TO hourvia_command;
CREATE POLICY command_delivery ON public.invitation_deliveries TO hourvia_command USING (true) WITH CHECK (true);

-- One closed dispatcher, no caller SQL, no actor/role arguments, no internal helper EXECUTE surface.
-- Context is supplied ONLY by the trusted server using independent restricted credentials.
-- GUCs are not cryptographic authentication: runtime credentials must never reach a browser.
CREATE FUNCTION public.hv_command(action text, tenant uuid, expected_version integer,
  request_key text, request_digest text, correlation uuid, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  actor uuid; actor_member public.memberships%ROWTYPE; target public.memberships%ROWTYPE;
  org public.organizations%ROWTYPE; invitation public.invitations%ROWTYPE;
  stored public.idempotency_records%ROWTYPE;
  category text; scope_key text; claim_tenant uuid; claim_id uuid;
  result jsonb; target_id uuid; changed integer; recipient text; owner_count integer;
BEGIN
  IF current_setting('search_path') <> 'pg_catalog' OR current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'invalid execution context' USING ERRCODE = '42501';
  END IF;
  IF tenant IS DISTINCT FROM nullif(current_setting('hourvia.organization_id',true),'')::uuid OR correlation IS NULL
     OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR request_key !~ '^[A-Za-z0-9_-]{16,128}$'
     OR request_key IS NULL OR request_digest IS NULL OR request_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid command context' USING ERRCODE = '42501';
  END IF;
  category := CASE action WHEN 'provision' THEN 'provision' WHEN 'profile' THEN 'membership'
    WHEN 'membership' THEN 'membership' WHEN 'revoke_member' THEN 'membership'
    WHEN 'issue' THEN 'invite' WHEN 'accept' THEN 'accept' WHEN 'revoke_invitation' THEN 'invite'
    WHEN 'transfer' THEN 'transfer' ELSE NULL END;
  IF category IS NULL OR category IS DISTINCT FROM nullif(current_setting('hourvia.operation',true),'') THEN
    RAISE EXCEPTION 'unsupported operation' USING ERRCODE = '42501';
  END IF;
  -- All tenant mutations share this lock; lock live session/user after tenant ordering.
  IF action <> 'provision' THEN
    SELECT * INTO org FROM public.organizations WHERE id = tenant FOR UPDATE;
    IF NOT FOUND OR org.status <> 'active' THEN RAISE EXCEPTION 'tenant denied' USING ERRCODE = '42501'; END IF;
  END IF;
  actor := public.hv_actor();
  IF actor IS NULL THEN RAISE EXCEPTION 'actor denied' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.global_users WHERE id = actor AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user denied' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.sessions WHERE id = nullif(current_setting('hourvia.session_id',true),'')::uuid
    AND user_id = actor AND revoked_at IS NULL AND expires_at > clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session denied' USING ERRCODE = '42501'; END IF;
  IF action NOT IN ('provision','accept') THEN
    SELECT * INTO actor_member FROM public.memberships WHERE organization_id = tenant AND user_id = actor AND status = 'active' FOR UPDATE;
    IF NOT FOUND OR actor_member.role NOT IN ('OWNER','ADMIN') THEN
      RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF action = 'accept' THEN
    SELECT i.* INTO invitation FROM public.invitations i WHERE i.organization_id = tenant AND i.id = (payload->>'invitationId')::uuid FOR UPDATE;
    IF NOT FOUND OR invitation.credential_digest IS DISTINCT FROM payload->>'credentialDigest' THEN
      RAISE EXCEPTION 'invitation denied' USING ERRCODE = '42501';
    END IF;
    SELECT p.verified_email INTO recipient FROM public.provider_identities p JOIN public.sessions s ON s.identity_id = p.id AND s.user_id = p.user_id
      WHERE s.id = nullif(current_setting('hourvia.session_id',true),'')::uuid AND p.user_id = actor;
    IF recipient IS NULL OR lower(trim(recipient)) <> invitation.email THEN RAISE EXCEPTION 'recipient denied' USING ERRCODE = '42501'; END IF;
    IF invitation.state = 'accepted' AND NOT EXISTS (SELECT 1 FROM public.memberships WHERE organization_id = tenant AND user_id = actor AND status = 'active') THEN
      RAISE EXCEPTION 'revoked recipient' USING ERRCODE = '42501';
    END IF;
  END IF;
  scope_key := CASE WHEN action = 'provision' THEN 'creator' ELSE tenant::text END;
  claim_tenant := CASE WHEN action = 'provision' THEN NULL ELSE tenant END;
  -- Unique claim serializes creator retries before allocation/insertion. Any error aborts the outer transaction.
  INSERT INTO public.idempotency_records(actor_id,organization_id,scope,operation,key,input_digest)
    VALUES(actor,claim_tenant,scope_key,category,request_key,request_digest)
    ON CONFLICT (actor_id,scope,operation,key) DO NOTHING RETURNING id INTO claim_id;
  IF claim_id IS NULL THEN
    SELECT * INTO stored FROM public.idempotency_records WHERE actor_id = actor AND scope = scope_key AND operation = category AND key = request_key FOR UPDATE;
    IF stored.input_digest IS DISTINCT FROM request_digest OR stored.state <> 'completed' THEN RAISE EXCEPTION 'claim conflict' USING ERRCODE = '23505'; END IF;
    RETURN stored.outcome;
  END IF;
  IF action = 'transfer' AND actor_member.role <> 'OWNER' THEN RAISE EXCEPTION 'owner required' USING ERRCODE = '42501'; END IF;
  IF action <> 'provision' AND org.version IS DISTINCT FROM expected_version THEN RAISE EXCEPTION 'stale aggregate' USING ERRCODE = '40001'; END IF;
  target_id := tenant;
  IF action IN ('profile','provision') AND (length(trim(payload->>'name')) NOT BETWEEN 2 AND 120 OR payload->>'name' IS NULL) THEN
    RAISE EXCEPTION 'invalid name' USING ERRCODE = '23514';
  END IF;
  CASE action
  WHEN 'provision' THEN
    INSERT INTO public.organizations(id,name,status) VALUES(tenant,payload->>'name','provisioning');
    INSERT INTO public.memberships(organization_id,user_id,role,status) VALUES(tenant,actor,'OWNER','active') RETURNING * INTO actor_member;
    UPDATE public.organizations SET status = 'active', version = version + 1 WHERE id = tenant;
  WHEN 'profile' THEN
    UPDATE public.organizations SET name = payload->>'name', version = version + 1 WHERE id = tenant;
  WHEN 'membership', 'revoke_member', 'transfer' THEN
    SELECT * INTO target FROM public.memberships WHERE organization_id = tenant AND user_id = (payload->>'targetUserId')::uuid FOR UPDATE;
    IF NOT FOUND OR target.role = 'OWNER' OR target.status = 'revoked' OR (actor_member.role = 'ADMIN' AND target.role = 'ADMIN') THEN
      RAISE EXCEPTION 'target denied' USING ERRCODE = '42501';
    END IF;
    target_id := target.user_id;
    IF action = 'transfer' THEN
      IF target.status <> 'active' THEN RAISE EXCEPTION 'inactive target' USING ERRCODE = '42501'; END IF;
      UPDATE public.memberships SET role = 'ADMIN', monitoring_delegated = false, version = version + 1 WHERE organization_id = tenant AND id = actor_member.id;
      UPDATE public.memberships SET role = 'OWNER', monitoring_delegated = false, version = version + 1 WHERE organization_id = tenant AND id = target.id;
    ELSIF action = 'revoke_member' THEN
      UPDATE public.memberships SET status = 'revoked', monitoring_delegated = false, version = version + 1 WHERE organization_id = tenant AND id = target.id;
    ELSE
      IF payload->>'role' IS NULL OR payload->>'role' NOT IN ('ADMIN','MANAGER','EMPLOYEE','CONTRACTOR') OR (actor_member.role = 'ADMIN' AND payload->>'role' = 'ADMIN') THEN
        RAISE EXCEPTION 'role denied' USING ERRCODE = '42501';
      END IF;
      UPDATE public.memberships SET role = payload->>'role', monitoring_delegated = false, version = version + 1 WHERE organization_id = tenant AND id = target.id;
    END IF;
  WHEN 'issue' THEN
    IF (payload->>'expiresAt')::timestamptz > transaction_timestamp() + interval '7 days' OR (payload->>'expiresAt')::timestamptz <= clock_timestamp() THEN
      RAISE EXCEPTION 'invalid expiry' USING ERRCODE = '23514';
    END IF;
    IF payload->>'role' IS NULL OR payload->>'role' NOT IN ('ADMIN','MANAGER','EMPLOYEE','CONTRACTOR') OR (actor_member.role = 'ADMIN' AND payload->>'role' = 'ADMIN') THEN
      RAISE EXCEPTION 'role denied' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.invitations(id,organization_id,email,role,credential_digest,inviter_membership_id,expires_at)
      VALUES((payload->>'invitationId')::uuid,tenant,lower(trim(payload->>'email')),payload->>'role',payload->>'credentialDigest',actor_member.id,(payload->>'expiresAt')::timestamptz) RETURNING id INTO target_id;
    INSERT INTO public.invitation_deliveries(organization_id,invitation_id,delivery_key) VALUES(tenant,target_id,correlation);
  WHEN 'accept' THEN
    IF invitation.state <> 'pending' OR invitation.expires_at <= clock_timestamp() OR invitation.version IS DISTINCT FROM (payload->>'invitationVersion')::integer THEN
      RAISE EXCEPTION 'invitation unavailable' USING ERRCODE = '42501';
    END IF;
    -- Membership first: accepted_membership_id has an immediate composite foreign key.
    INSERT INTO public.memberships(organization_id,user_id,role,status) VALUES(tenant,actor,invitation.role,'active') RETURNING * INTO actor_member;
    UPDATE public.invitations SET state = 'accepted', accepted_membership_id = actor_member.id, accepted_at = transaction_timestamp(), version = version + 1
      WHERE organization_id = tenant AND id = invitation.id;
    target_id := invitation.id;
  WHEN 'revoke_invitation' THEN
    UPDATE public.invitations SET state = 'revoked', version = version + 1 WHERE organization_id = tenant AND id = (payload->>'invitationId')::uuid
      AND state = 'pending' AND version = (payload->>'invitationVersion')::integer RETURNING id INTO target_id;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN RAISE EXCEPTION 'invitation conflict' USING ERRCODE = '23505'; END IF;
  ELSE RAISE EXCEPTION 'unsupported command' USING ERRCODE = '42501';
  END CASE;
  IF action IN ('accept','revoke_invitation') THEN
    UPDATE public.invitation_deliveries SET state = 'cancelled', lease_until = NULL, version = version + 1
      WHERE organization_id = tenant AND invitation_id = target_id AND state IN ('queued','leased','failed');
  END IF;
  IF action NOT IN ('provision','profile') THEN UPDATE public.organizations SET version = version + 1 WHERE id = tenant; END IF;
  SELECT count(*) INTO owner_count FROM public.memberships WHERE organization_id = tenant AND role = 'OWNER' AND status = 'active';
  IF owner_count <> 1 THEN RAISE EXCEPTION 'owner invariant' USING ERRCODE = '23514'; END IF;
  SELECT * INTO org FROM public.organizations WHERE id = tenant;
  INSERT INTO public.audit_events(organization_id,actor_membership_id,action,target_id,correlation_id,aggregate_version)
    VALUES(tenant,actor_member.id,action,target_id,correlation,org.version);
  result := jsonb_build_object('organizationId',tenant,'targetId',target_id,'version',org.version,'correlationId',correlation);
  UPDATE public.idempotency_records SET state = 'completed', outcome = result, version = version + 1 WHERE id = claim_id;
  RETURN result;
  -- No exception handler: every failure propagates; the existing wrapper issues ROLLBACK.
END $$;
GRANT CREATE ON SCHEMA public TO hourvia_command;
ALTER FUNCTION public.hv_command(text,uuid,integer,text,text,uuid,jsonb) OWNER TO hourvia_command;
REVOKE ALL ON FUNCTION public.hv_command(text,uuid,integer,text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hv_command(text,uuid,integer,text,text,uuid,jsonb) TO hourvia_runtime;
-- No runtime table writes, no delivery-worker grants, no login membership grants.

-- Acceptance reserves its claim before membership insertion, but both commit together.
-- Existing membership uniqueness still rejects revoked-member re-entry.
ALTER TABLE public.idempotency_records ALTER CONSTRAINT idempotency_actor_tenant DEFERRABLE INITIALLY DEFERRED;
GRANT SELECT ON public.audit_events TO hourvia_command;
CREATE POLICY command_audit_read ON public.audit_events FOR SELECT TO hourvia_command USING (true);
CREATE FUNCTION public.hv_receipt(category text, request_key text, request_digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor uuid; tenant uuid; receipt jsonb;
BEGIN
  actor := public.hv_actor();
  tenant := nullif(current_setting('hourvia.organization_id',true),'')::uuid;
  IF actor IS NULL OR tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.memberships WHERE organization_id = tenant AND user_id = actor AND status = 'active') THEN
    RAISE EXCEPTION 'receipt denied' USING ERRCODE = '42501';
  END IF;
  SELECT c.outcome INTO receipt FROM public.idempotency_records c
    JOIN public.audit_events a ON a.organization_id = tenant AND a.correlation_id = (c.outcome->>'correlationId')::uuid
    JOIN public.memberships m ON m.organization_id = tenant AND m.id = a.actor_membership_id AND m.user_id = actor
    WHERE c.actor_id = actor AND c.operation = category AND c.key = request_key AND c.input_digest = request_digest AND c.state = 'completed'
      AND (c.organization_id = tenant OR (c.organization_id IS NULL AND c.scope = 'creator' AND category = 'provision'))
      AND c.outcome->>'organizationId' = tenant::text AND a.target_id = (c.outcome->>'targetId')::uuid AND a.aggregate_version = (c.outcome->>'version')::integer;
  RETURN receipt;
END $$;
ALTER FUNCTION public.hv_receipt(text,text,text) OWNER TO hourvia_command;
REVOKE ALL ON FUNCTION public.hv_receipt(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hv_receipt(text,text,text) TO hourvia_runtime;

-- Owner can execute only reviewed bodies and cannot replace them.
REVOKE CREATE ON SCHEMA public FROM hourvia_command;

COMMIT; -- Installation candidate only, never executed by application startup.
