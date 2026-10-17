import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ForeignKeyBuilder, getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../schema';
import plan from '../quarantine/install-order.json';

const read = (path: string) => readFileSync(`db/quarantine/${path}`, 'utf8');
const commands = read('003_restricted_commands.sql');
const guards = read('002_invariants_security.sql');
const roles = read('000_roles.sql');
const code = (sql: string) => sql.replace(/--[^\n]*/g, '');
const delta = read(plan.steps.find(s => s.id === 'command-metadata')!.path);

describe('Sprint 4B.1 offline SQL compatibility contracts, no PostgreSQL', () => {
  it('covers every command locking relation with the minimum intended UPDATE grants', () => {
    const body = commands.slice(commands.indexOf('CREATE FUNCTION public.hv_command'), commands.indexOf('END $$;'));
    const locking = code(body).split(';').filter(s => /FOR (?:UPDATE|SHARE)\b/.test(s));
    const tables = locking.map(s => s.match(/FROM public\.(\w+)/)?.[1]);
    expect(new Set(tables)).toEqual(new Set(['organizations','global_users','sessions','memberships','invitations','idempotency_records']));
    expect(tables).toHaveLength(7); // actor and target memberships lock separately
    expect(commands).toContain('GRANT UPDATE (id) ON public.global_users, public.sessions TO hourvia_command;');
    expect(commands).toContain('GRANT SELECT, INSERT, UPDATE ON public.organizations, public.memberships, public.invitations, public.idempotency_records TO hourvia_command;');
    expect(commands).not.toMatch(/GRANT\s+(?:ALL|UPDATE)\s+ON public\.(?:global_users|sessions)/);
    for (const table of ['global_users','sessions']) {
      expect(commands).toMatch(new RegExp(`ON public\\.${table} FOR UPDATE TO hourvia_command USING \\(true\\) WITH CHECK \\(false\\)`));
    }
    expect(guards).toContain('NEW.id <> OLD.id');
    expect(guards).toContain('NEW.version <> OLD.version + 1');
  });

  it('keeps runtime direct writes, owner membership and schema replacement unavailable', () => {
    const grants = code(roles + guards + commands).match(/GRANT\s+[^;]+TO hourvia_runtime;/g) ?? [];
    expect(grants.length).toBeGreaterThan(0);
    for (const grant of grants) expect(grant).toMatch(/^GRANT (?:USAGE ON SCHEMA|SELECT ON|EXECUTE ON FUNCTION) /);
    expect(code(roles + guards + commands)).not.toMatch(/GRANT\s+hourvia_(?:command|migration)\s+TO/);
    expect(roles).toContain('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    expect(commands).toContain('REVOKE CREATE ON SCHEMA public FROM hourvia_command');
    expect(guards).toContain('FORCE ROW LEVEL SECURITY');
    expect(commands).toContain('ALTER TABLE public.invitation_deliveries FORCE ROW LEVEL SECURITY');
    expect(commands).toContain('REVOKE ALL ON public.invitation_deliveries FROM PUBLIC, hourvia_runtime');
  });

  it('binds both command definer owners and exact EXECUTE signatures', () => {
    const signatures = ['hv_command(text,uuid,integer,text,text,uuid,jsonb)', 'hv_receipt(text,text,text)'];
    for (const signature of signatures) {
      expect(commands).toContain(`ALTER FUNCTION public.${signature} OWNER TO hourvia_command;`);
      expect(commands).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC;`);
      expect(commands).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO hourvia_runtime;`);
    }
    expect(commands.match(/SECURITY DEFINER SET search_path = pg_catalog AS/g)).toHaveLength(2);
    expect(guards).not.toContain('SET search_path = pg_catalog, public');
    expect(commands).not.toMatch(/EXECUTE\s+(?:payload|action|format)/);
    expect(guards).toContain('SET LOCAL ROLE hourvia_migration');
    expect(commands).toContain('NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
  });

  it('uses an explicit dependency order and caller-owned transaction without nested commits', () => {
    expect(plan.automaticExecution).toBe(false);
    expect(plan.scope).toBe('fresh-authorized-disposable-only');
    expect(plan.begin).toBe('BEGIN ISOLATION LEVEL SERIALIZABLE');
    expect(plan.searchPath).toBe('SET LOCAL search_path = public');
    expect(plan.onError).toBe('ROLLBACK');
    expect(plan.steps.map(s => s.id)).toEqual(['roles','foundation','invariants','command-metadata','commands']);
    const seen = new Set<string>();
    for (const step of plan.steps) {
      expect(step.dependsOn.every(id => seen.has(id))).toBe(true);
      expect(existsSync(`db/quarantine/${step.path}`)).toBe(true);
      // Remove PL/pgSQL/DO bodies before checking top-level transaction control.
      const topLevel = code(read(step.path)).replace(/\$\$[\s\S]*?\$\$/g, '');
      expect(topLevel).not.toMatch(/\b(?:BEGIN|COMMIT|ROLLBACK)\b/);
      expect(topLevel).not.toMatch(/(?:^|;)\s*(?:SET ROLE|RESET ROLE)\b/);
      seen.add(step.id);
    }
    expect(plan.steps.filter(s => s.id === 'foundation' || s.id === 'command-metadata').every(s => s.role === 'hourvia_migration')).toBe(true);
    expect(plan.steps.at(-1)?.role).toBe('NONE');
    expect(roles).toContain('ALTER DEFAULT PRIVILEGES FOR ROLE hourvia_migration');
    expect(commands).not.toMatch(/CREATE (?:TABLE|UNIQUE INDEX)/);
    expect(delta).toContain('CREATE TABLE "invitation_deliveries"');
    expect(delta).toContain('CREATE UNIQUE INDEX "audit_command_correlation"');
  });

  it('preserves serializable and trusted local context, tenant predicates and acceptance ordering', () => {
    expect(commands).toContain("current_setting('transaction_isolation') <> 'serializable'");
    expect(commands).toContain("tenant IS DISTINCT FROM nullif(current_setting('hourvia.organization_id',true),'')::uuid");
    expect(commands).toContain("category IS DISTINCT FROM nullif(current_setting('hourvia.operation',true),'')");
    expect(commands).toContain('actor := public.hv_actor()');
    expect(commands).toContain('i.organization_id = tenant');
    expect(commands).toContain('s.identity_id = p.id AND s.user_id = p.user_id');
    expect(commands).toContain('invitation.version IS DISTINCT FROM');
    const acceptance = commands.slice(commands.lastIndexOf("WHEN 'accept' THEN"), commands.lastIndexOf("WHEN 'revoke_invitation' THEN"));
    expect(acceptance.indexOf('INSERT INTO public.memberships')).toBeGreaterThan(0);
    expect(acceptance.indexOf('INSERT INTO public.memberships')).toBeLessThan(acceptance.indexOf('UPDATE public.invitations'));
    expect(commands.indexOf("SET role = 'ADMIN'")).toBeLessThan(commands.indexOf("SET role = 'OWNER'"));
    expect(commands).toContain('owner_count <> 1');
    expect(commands).not.toContain('EXCEPTION WHEN');
  });

  it('matches current Drizzle table/column/FK/check/index metadata to the generated snapshot', () => {
    const snapshot = JSON.parse(read(plan.steps.find(s => s.id === 'command-metadata')!.path.replace('migration.sql','snapshot.json')));
    expect(snapshot.version).toBe('8');
    for (const table of Object.values(schema)) {
      const config = getTableConfig(table);
      const entries = snapshot.ddl.filter((e: { table: string }) => e.table === config.name);
      expect(entries.filter((e: { entityType: string }) => e.entityType === 'columns').map((e: { name: string }) => e.name).sort()).toEqual(config.columns.map(c => c.name).sort());
      for (const fk of config.foreignKeys) {
        const ref = fk.reference();
        // ORM implicit getName() uses _fk; Kit generates PostgreSQL _fkey.
        // Compare semantic edges; only explicit names are a shared contract.
        expect(entries).toContainEqual(expect.objectContaining({ entityType: 'fks', ...(fk.isNameExplicit() ? { name: fk.getName() } : {}), columns: ref.columns.map(c => c.name), tableTo: getTableConfig(ref.foreignTable).name, columnsTo: ref.foreignColumns.map(c => c.name) }));
      }
      for (const column of config.columns) expect(entries).toContainEqual(expect.objectContaining({ entityType: 'columns', name: column.name, type: column.getSQLType(), notNull: column.notNull }));
      expect(entries.filter((e: { entityType: string }) => e.entityType === 'checks')).toHaveLength(config.checks.length);
      expect(entries.filter((e: { entityType: string }) => e.entityType === 'indexes')).toHaveLength(config.indexes.length);
    }
    const queue = getTableConfig(schema.invitationDeliveries);
    expect(queue.columns.map(c => c.name)).not.toEqual(expect.arrayContaining(['credential_digest','token','body']));
    expect(queue.uniqueConstraints.map(u => u.columns.map(c => c.name))).toEqual(expect.arrayContaining([['delivery_key'],['organization_id','invitation_id']]));
  });

  it('keeps unsupported FK deferrability explicit in SQL instead of inventing a Drizzle API', () => {
    expect('deferrable' in ForeignKeyBuilder.prototype).toBe(false);
    expect(commands).toContain('ALTER TABLE public.idempotency_records ALTER CONSTRAINT idempotency_actor_tenant DEFERRABLE INITIALLY DEFERRED;');
    expect(plan.sqlOverlays.some(s => s.purpose.includes('DEFERRABLE INITIALLY DEFERRED'))).toBe(true);
    expect(existsSync('netlify/database/migrations')).toBe(false);
  });
});
