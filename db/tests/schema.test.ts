import { readFileSync, existsSync } from 'node:fs';
import { expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../schema';
const generated = 'db/quarantine/generated/20261017014340_create_identity_tenant_foundation';
const ddl = readFileSync(generated + '/migration.sql', 'utf8');
const guards = readFileSync('db/quarantine/002_invariants_security.sql', 'utf8');
it('defines nine offline UUID-based tables with timezone-aware timestamps', () => {
  expect(Object.keys(schema)).toHaveLength(9);
  for (const table of Object.values(schema)) {
    const config = getTableConfig(table);
    expect(config.columns.find(c => c.name === 'id')?.getSQLType()).toBe('uuid');
    expect(config.columns.filter(c => c.name.endsWith('_at')).every(c => c.getSQLType() === 'timestamp with time zone')).toBe(true);
    if (config.name !== 'audit_events') expect(config.columns.some(c => c.name === 'version')).toBe(true);
  }
});
it('constrains tenant references with both organization and resource columns', () => {
  for (const table of [schema.invitations, schema.auditEvents]) {
    const foreign = getTableConfig(table).foreignKeys.filter(f => f.reference().columns.length === 2);
    expect(foreign.length).toBe(table === schema.invitations ? 2 : 1);
    for (const fk of foreign) expect(fk.reference().foreignColumns[0].name).toBe('organization_id');
  }
  expect(getTableConfig(schema.sessions).foreignKeys.some(f => f.reference().columns.length === 2)).toBe(true);
});
it('quarantines generated SQL and security candidates away from deployment discovery', () => {
  expect(existsSync('netlify/database/migrations')).toBe(false);
  expect(existsSync('drizzle.config.ts')).toBe(false);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(Object.values(pkg.scripts).some(v => /drizzle|migrate|db:|disposable/.test(String(v)))).toBe(false);
  expect(readFileSync('db/drizzle.offline.config.ts', 'utf8')).toContain("out: './db/quarantine/generated'");
  expect(ddl.match(/CREATE TABLE/g)).toHaveLength(8);
});
it('combines immediate owner uniqueness, deferred minimum count, tenant locks and serializable isolation', () => {
  expect(ddl).toContain('CREATE UNIQUE INDEX "one_active_owner"');
  expect(guards.match(/DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.hv_owner_count/g)).toHaveLength(2);
  expect(guards).toContain('owners <> 1'); expect(guards).toContain('FOR UPDATE'); expect(guards).toContain("<> 'serializable'");
});
it('forces RLS and denies runtime writes and global identity browsing', () => {
  expect(guards).toContain('FORCE ROW LEVEL SECURITY'); expect(guards).toContain('USING (false) WITH CHECK (false)');
  expect(guards).toContain("current_setting('hourvia.session_id', true)");
  expect(guards).toContain('s.revoked_at IS NULL'); expect(guards).toContain("o.status = 'active'");
  expect(guards).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)\s/i);
  const roles = readFileSync('db/quarantine/000_roles.sql', 'utf8');
  expect(roles).toContain('REVOKE CREATE, TEMPORARY ON DATABASE');
  expect(roles.match(/NOBYPASSRLS/g)).toHaveLength(2); expect(roles).not.toMatch(/GRANT hourvia_migration TO hourvia_runtime/);
  expect(guards).toContain('audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE');
  expect(guards).toContain("RAISE EXCEPTION 'incomplete idempotency claim'");
});
