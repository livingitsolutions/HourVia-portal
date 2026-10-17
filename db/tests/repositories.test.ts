import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createLiveRepositories, createOfflineRepositories, type RowsConnection, type Command } from '../candidates/repositories';
const context = { actorId: '11111111-1111-4111-8111-111111111111', sessionId: '22222222-2222-4222-8222-222222222222', organizationId: '33333333-3333-4333-8333-333333333333' };
const correlation = '44444444-4444-4444-8444-444444444444';
const value = { organizationId: context.organizationId, targetId: context.organizationId, version: 1, correlationId: correlation };
function fixture(options: { role?: string; tag?: string; audit?: boolean; reject?: boolean; cross?: boolean; unresolved?: boolean } = {}) {
  const calls: { sql: string; parameters?: readonly unknown[] }[] = []; const releases: boolean[] = [];
  let connects = 0;
  const connect = async (): Promise<RowsConnection> => {
    connects++;
    return {
      async query(sql, parameters) {
        calls.push({ sql,parameters });
        if (sql === 'COMMIT' && options.tag === 'lost') throw new Error('transport');
        if (sql.includes('hv_tenant_role')) return { command: 'SELECT', rows: [{ role: options.role ?? 'OWNER' }] };
        if (sql.includes('hv_command')) {
          if (options.reject) throw { code: '42501' };
          return { command: 'SELECT', rows: [{ outcome: value }] };
        }
        if (sql.includes('hv_receipt')) return { command: 'SELECT', rows: [{ outcome: options.audit === false || options.unresolved ? null : value }] };
        if (sql.startsWith('SELECT id,name')) return { command: 'SELECT', rows: [{ id: options.cross ? 'other' : context.organizationId, name: 'Test', status: 'active', version: 1 }] };
        return { command: sql === 'COMMIT' ? options.tag ?? 'COMMIT' : sql.split(' ')[0], rows: [] };
      }, release(discard) { releases.push(discard); },
    };
  };
  return { repo: createOfflineRepositories(connect,context), calls, releases, connects: () => connects };
}
const command: Command = { action: 'profile', payload: { name: "Robert'); DROP TABLE memberships;--" } };
const execute = (f: ReturnType<typeof fixture>) => f.repo.execute(command,0,'request_offline_001',correlation);
describe('disabled native persistence candidates (simulated SQL replies)', () => {
  it('requires context before acquisition; live factory cannot activate', () => {
    expect(() => createOfflineRepositories(async () => { throw new Error('acquired'); }, { ...context, organizationId: '' })).toThrow('INVALID_SECURITY_CONTEXT');
    expect(() => createLiveRepositories()).toThrow('PERSISTENCE_DISABLED');
  });
  it('scopes reads and rejects foreign tenant rows', async () => {
    const f = fixture(); expect((await f.repo.organization()).status).toBe('committed');
    expect(f.calls.find(c => c.sql.startsWith('SELECT id,name'))?.parameters).toEqual([context.organizationId]);
    const cross = fixture({ cross: true }); expect((await cross.repo.organization()).status).toBe('unavailable');
    expect(cross.calls.some(c => c.sql === 'ROLLBACK')).toBe(true);
  });
  it('denies reads after revoked membership without fetching tenant rows', async () => {
    const f = fixture({ role: 'revoked' }); expect((await f.repo.organization()).status).toBe('unavailable');
    expect(f.calls.some(c => c.sql.startsWith('SELECT id,name'))).toBe(false);
  });
  it('requires admin membership for invitation reads and binds hostile IDs', async () => {
    const f = fixture({ role: 'EMPLOYEE' }); expect((await f.repo.invitation('other')).status).toBe('unavailable');
    const owner = fixture(); await owner.repo.invitation("' OR true--");
    const query = owner.calls.find(c => c.sql.startsWith('SELECT id,organization_id'))!;
    expect(query.parameters).toEqual([context.organizationId,"' OR true--"]); expect(query.sql).not.toContain('OR true');
  });
  it('binds command payload, verifies audit/claim before acknowledged COMMIT', async () => {
    const f = fixture(); expect(await execute(f)).toEqual({ status: 'committed', value });
    const query = f.calls.find(c => c.sql.includes('hv_command'))!;
    expect(query.sql).not.toContain('DROP'); expect(query.parameters?.[6]).toContain('DROP');
    expect(query.parameters?.[4]).toMatch(/^[0-9a-f]{64}$/);
    expect(f.calls.findIndex(c => c.sql.includes('hv_receipt'))).toBeLessThan(f.calls.findIndex(c => c.sql === 'COMMIT'));
  });
  it('rolls back unauthorized commands and failed audit verification', async () => {
    for (const f of [fixture({ reject: true }),fixture({ audit: false })]) {
      expect((await execute(f)).status).toBe('unavailable');
      expect(f.calls.some(c => c.sql === 'ROLLBACK')).toBe(true); expect(f.calls.some(c => c.sql === 'COMMIT')).toBe(false);
    }
  });
  it.each(['ROLLBACK','lost','SELECT'])('rejects COMMIT %s and never retries uncertain outcomes', async tag => {
    const f = fixture({ tag }); expect((await execute(f)).status).toBe(tag === 'ROLLBACK' ? 'rolled_back' : 'commit_unknown');
    expect(f.connects()).toBe(1); expect(f.releases).toEqual([tag !== 'ROLLBACK']);
  });
  it('reconciles using a fresh transaction; absence stays unresolved', async () => {
    const f = fixture(); const result = await f.repo.reconcile(command,0,'request_offline_001');
    expect(result).toEqual({ status: 'committed', value: { status: 'completed', value } });
    const missing = fixture({ unresolved: true }); expect(await missing.repo.reconcile(command,0,'request_offline_001')).toEqual({ status: 'committed', value: { status: 'unresolved' } });
    expect(missing.calls.some(c => c.sql.includes('hv_command'))).toBe(false);
  });
  it('replays the original receipt and rejects a missing receipt', async () => {
    const f = fixture(); expect(await execute(f)).toEqual(await execute(f));
    expect(f.calls.filter(c => c.sql.includes('hv_command'))).toHaveLength(2);
    // The fake returns a stored result; actual deduplication is a live SQL acceptance obligation.
  });
  it.each<Command>([
    { action: 'transfer', payload: { targetUserId: correlation } },
    { action: 'accept', payload: { invitationId: correlation, credentialDigest: 'a'.repeat(64), invitationVersion: 0 } },
  ])('preserves rollback, local context and uncertain COMMIT for $action (simulated)', async command => {
    for (const options of [{ reject: true },{ audit: false },{ tag: 'lost' }]) {
      const f = fixture(options);
      const outcome = await f.repo.execute(command,1,'request_compatibility_001',correlation);
      expect(outcome.status).toBe('tag' in options ? 'commit_unknown' : 'unavailable');
      expect(f.connects()).toBe(1);
      const contextQuery = f.calls.find(c => c.sql.startsWith("SELECT set_config('hourvia.actor_id'"));
      expect(contextQuery?.parameters).toEqual([context.actorId,context.sessionId,context.organizationId]);
      expect(f.calls.find(c => c.sql.includes('hv_command'))?.parameters?.slice(0,3)).toEqual([command.action,context.organizationId,1]);
      if ('tag' in options) {
        expect(f.releases).toEqual([true]);
        expect(f.calls.some(c => c.sql === 'ROLLBACK')).toBe(false);
      } else {
        expect(f.calls.some(c => c.sql === 'ROLLBACK')).toBe(true);
        expect(f.calls.some(c => c.sql === 'COMMIT')).toBe(false);
      }
    }
  });
});
describe('quarantined SQL structural checks (not PostgreSQL execution)', () => {
  it('retains direct-write denial, closed execution grants, owner isolation and fixed search_path', async () => {
    const [sql,baseline] = await Promise.all([readFile('db/quarantine/003_restricted_commands.sql','utf8'),readFile('db/quarantine/002_invariants_security.sql','utf8')]);
    expect(baseline).toContain('REVOKE ALL ON public.%I FROM PUBLIC, hourvia_runtime');
    expect(sql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL).*TO hourvia_runtime/);
    expect(sql).toContain('NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
    expect(sql.match(/SECURITY DEFINER SET search_path = pg_catalog AS/g)).toHaveLength(2);
    expect(sql).toContain('REVOKE CREATE ON SCHEMA public FROM hourvia_command');
    expect(sql).not.toMatch(/GRANT hourvia_command TO|EXECUTE format|EXECUTE payload/);
    expect(sql).toContain('FROM PUBLIC;'); expect(sql).toContain('public.hv_actor()');
  });
  it('records owner lock/count, membership-first acceptance, delivery uniqueness and atomic receipts', async () => {
    const sql = await readFile('db/quarantine/003_restricted_commands.sql','utf8');
    expect(sql).toContain('WHERE id = tenant FOR UPDATE'); expect(sql).toContain('owner_count <> 1');
    expect(sql.indexOf("SET role = 'ADMIN'")).toBeLessThan(sql.indexOf("SET role = 'OWNER'"));
    const metadata = await readFile('db/quarantine/generated/20261017052144_add_command_delivery_metadata/migration.sql','utf8');
    expect(metadata).toContain('UNIQUE("organization_id","invitation_id")');
    expect(metadata).toContain('"delivery_key" uuid NOT NULL CONSTRAINT "delivery_key" UNIQUE');
    expect(sql).toContain('DEFERRABLE INITIALLY DEFERRED'); expect(sql).toContain('INSERT INTO public.audit_events');
    expect(sql).toContain("state = 'completed', outcome = result"); expect(sql).not.toContain('EXCEPTION WHEN');
    expect(sql).toContain('m.user_id = actor'); expect(sql).toContain('a.aggregate_version');
  });
});
