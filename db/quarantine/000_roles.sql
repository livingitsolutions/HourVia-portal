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
SET ROLE hourvia_migration;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- Run generated schema next on this same administrator connection with SET ROLE retained.
