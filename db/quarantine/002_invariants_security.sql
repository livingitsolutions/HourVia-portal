-- QUARANTINED CANDIDATE. Caller-owned transaction; follow install-order.json.
-- NO runtime mutation grants: command-specific audited routines remain an activation gate.
SET LOCAL ROLE hourvia_migration;
CREATE FUNCTION public.hv_lock_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'serializable mutation required' USING ERRCODE = '25001';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.organization_id, NEW.user_id, NEW.id) IS DISTINCT FROM (OLD.organization_id, OLD.user_id, OLD.id) THEN
    RAISE EXCEPTION 'immutable membership identity' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM 1 FROM public.organizations WHERE id = OLD.organization_id FOR UPDATE;
    RETURN OLD;
  END IF;
  PERFORM 1 FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;
  RETURN NEW;
END $$;
CREATE TRIGGER membership_lock BEFORE INSERT OR UPDATE OR DELETE ON public.memberships
FOR EACH ROW EXECUTE FUNCTION public.hv_lock_membership();

CREATE FUNCTION public.hv_owner_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE tenant uuid; lifecycle text; owners integer;
BEGIN
  IF TG_TABLE_NAME = 'organizations' THEN
    tenant := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    tenant := CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
  END IF;
  SELECT status INTO lifecycle FROM public.organizations WHERE id = tenant FOR UPDATE;
  IF lifecycle = 'active' THEN
    SELECT count(*) INTO owners FROM public.memberships WHERE organization_id = tenant AND role = 'OWNER' AND status = 'active';
    IF owners <> 1 THEN RAISE EXCEPTION 'active organization requires exactly one owner' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER organization_owner_count AFTER INSERT OR UPDATE OR DELETE ON public.organizations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.hv_owner_count();
CREATE CONSTRAINT TRIGGER membership_owner_count AFTER INSERT OR UPDATE OR DELETE ON public.memberships
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.hv_owner_count();

CREATE FUNCTION public.hv_version_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'serializable mutation required' USING ERRCODE = '25001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.created_at <> OLD.created_at OR NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'immutable identity or stale version' USING ERRCODE = '23514';
    END IF;
    NEW.updated_at := transaction_timestamp();
  END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['global_users','provider_identities','sessions','organizations','memberships','invitations','idempotency_records'] LOOP
    EXECUTE format('CREATE TRIGGER version_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.hv_version_guard()', tab);
  END LOOP;
END $$;

CREATE FUNCTION public.hv_lifecycle_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'pending' THEN
      RAISE EXCEPTION 'invitation must start pending' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'memberships' THEN
    IF OLD.status = 'revoked' OR (NEW.role, NEW.status) IS DISTINCT FROM (OLD.role, OLD.status) AND NEW.monitoring_delegated THEN
      RAISE EXCEPTION 'terminal membership or uncleared delegation' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'organizations' THEN
    IF NEW.status <> OLD.status AND NOT (
      (OLD.status = 'provisioning' AND NEW.status IN ('active','closed')) OR
      (OLD.status = 'active' AND NEW.status IN ('suspended','closed')) OR
      (OLD.status = 'suspended' AND NEW.status IN ('active','closed'))
    ) THEN RAISE EXCEPTION 'invalid organization transition' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'sessions' THEN
    IF (NEW.user_id, NEW.identity_id) IS DISTINCT FROM (OLD.user_id, OLD.identity_id) OR
       (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
      RAISE EXCEPTION 'immutable or revoked session' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'provider_identities' THEN
    IF (NEW.user_id, NEW.issuer, NEW.subject) IS DISTINCT FROM (OLD.user_id, OLD.issuer, OLD.subject) THEN
      RAISE EXCEPTION 'identity relinking forbidden' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'invitations' THEN
    IF OLD.state <> 'pending' OR NEW.state NOT IN ('accepted','revoked','expired') OR
       (NEW.organization_id, NEW.email, NEW.role, NEW.credential_digest, NEW.inviter_membership_id, NEW.expires_at)
       IS DISTINCT FROM (OLD.organization_id, OLD.email, OLD.role, OLD.credential_digest, OLD.inviter_membership_id, OLD.expires_at) OR
       (NEW.state = 'accepted' AND (OLD.expires_at <= clock_timestamp() OR NEW.accepted_at <> transaction_timestamp())) OR
       (NEW.state = 'expired' AND OLD.expires_at > clock_timestamp()) THEN
      RAISE EXCEPTION 'invalid invitation transition' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'idempotency_records' THEN
    IF OLD.state <> 'pending' OR NEW.state <> 'completed' OR
       (NEW.actor_id, NEW.organization_id, NEW.scope, NEW.operation, NEW.key, NEW.input_digest)
       IS DISTINCT FROM (OLD.actor_id, OLD.organization_id, OLD.scope, OLD.operation, OLD.key, OLD.input_digest) THEN
      RAISE EXCEPTION 'immutable idempotency result' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['organizations','memberships','sessions','provider_identities','invitations','idempotency_records'] LOOP
    EXECUTE format('CREATE TRIGGER lifecycle_guard BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.hv_lifecycle_guard()', tab);
  END LOOP;
END $$;
CREATE TRIGGER invitation_initial_state BEFORE INSERT ON public.invitations
FOR EACH ROW EXECUTE FUNCTION public.hv_lifecycle_guard();

CREATE FUNCTION public.hv_completed_claim() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.idempotency_records WHERE id = NEW.id AND state <> 'completed') THEN
    RAISE EXCEPTION 'incomplete idempotency claim' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER completed_claim AFTER INSERT OR UPDATE ON public.idempotency_records
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.hv_completed_claim();
CREATE FUNCTION public.hv_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'append-only record' USING ERRCODE = '42501'; END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON public.audit_events
FOR EACH STATEMENT EXECUTE FUNCTION public.hv_append_only();
CREATE TRIGGER idempotency_no_delete BEFORE DELETE OR TRUNCATE ON public.idempotency_records
FOR EACH STATEMENT EXECUTE FUNCTION public.hv_append_only();

-- SECURITY DEFINER helpers use a dedicated trusted owner, fixed search_path, no dynamic SQL.
-- They break recursive membership RLS through an explicit owner policy, not BYPASSRLS.
CREATE FUNCTION public.hv_actor() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog AS $$
  SELECT u.id FROM public.global_users u JOIN public.sessions s ON s.user_id = u.id
  WHERE u.id = nullif(current_setting('hourvia.actor_id', true), '')::uuid
    AND s.id = nullif(current_setting('hourvia.session_id', true), '')::uuid
    AND u.status = 'active' AND s.revoked_at IS NULL AND s.expires_at > statement_timestamp()
$$;
CREATE FUNCTION public.hv_tenant_role(tenant uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog AS $$
  SELECT m.role FROM public.memberships m JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.organization_id = tenant AND tenant = nullif(current_setting('hourvia.organization_id', true), '')::uuid
    AND m.user_id = public.hv_actor() AND m.status = 'active' AND o.status = 'active'
$$;
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['global_users','provider_identities','sessions','organizations','memberships','invitations','audit_events','idempotency_records'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tab);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tab);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, hourvia_runtime', tab);
    EXECUTE format('CREATE POLICY runtime_deny_mutation ON public.%I TO hourvia_runtime USING (false) WITH CHECK (false)', tab);
    EXECUTE format('CREATE POLICY migration_only ON public.%I TO hourvia_migration USING (true) WITH CHECK (true)', tab);
  END LOOP;
END $$;
CREATE POLICY users_self ON public.global_users FOR SELECT TO hourvia_runtime USING (id = public.hv_actor());
CREATE POLICY sessions_self ON public.sessions FOR SELECT TO hourvia_runtime USING (user_id = public.hv_actor() AND id = nullif(current_setting('hourvia.session_id', true), '')::uuid);
CREATE POLICY organizations_scoped ON public.organizations FOR SELECT TO hourvia_runtime USING (public.hv_tenant_role(id) IS NOT NULL);
CREATE POLICY memberships_scoped ON public.memberships FOR SELECT TO hourvia_runtime USING (public.hv_tenant_role(organization_id) IS NOT NULL);
CREATE POLICY invitations_admin ON public.invitations FOR SELECT TO hourvia_runtime USING (public.hv_tenant_role(organization_id) IN ('OWNER','ADMIN'));
CREATE POLICY audit_admin ON public.audit_events FOR SELECT TO hourvia_runtime USING (public.hv_tenant_role(organization_id) IN ('OWNER','ADMIN'));
CREATE POLICY idempotency_self ON public.idempotency_records FOR SELECT TO hourvia_runtime USING (actor_id = public.hv_actor() AND organization_id IS NOT NULL AND public.hv_tenant_role(organization_id) IS NOT NULL);
-- No provider identity browsing, bootstrap access, tenantless writes, or broad permissive write policy.
GRANT SELECT ON public.global_users, public.sessions, public.organizations, public.memberships, public.invitations, public.audit_events, public.idempotency_records TO hourvia_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, hourvia_runtime;
GRANT EXECUTE ON FUNCTION public.hv_actor(), public.hv_tenant_role(uuid) TO hourvia_runtime;
SET LOCAL ROLE NONE;
