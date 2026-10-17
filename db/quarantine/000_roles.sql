-- QUARANTINED CANDIDATE. Fresh, explicitly authorized disposable database only.
-- Bootstrap administrator executes this; never grant these roles to app/client users.
CREATE ROLE hourvia_migration NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hourvia_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
DO $$ BEGIN
  EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO hourvia_migration;
GRANT USAGE ON SCHEMA public TO hourvia_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE hourvia_migration IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE hourvia_migration IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- Caller owns the serializable installation transaction. No session role leaks.
-- Follow install-order.json; each generated phase explicitly uses SET LOCAL ROLE.
