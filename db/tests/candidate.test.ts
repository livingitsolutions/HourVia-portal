import { expect, it } from 'vitest';
import { success } from '../../src/domain/result';
import { runCandidate, type ScopedQueries } from '../verification/transaction-candidate';
import type { TransactionConnection } from '../transaction';
const context = { actorId: '11111111-1111-4111-8111-111111111111', sessionId: '22222222-2222-4222-8222-222222222222', organizationId: '33333333-3333-4333-8333-333333333333' };
const claim = { actorId: context.actorId, organizationId: context.organizationId, operation: 'transfer' as const, key: 'request_offline_001', inputDigest: 'a'.repeat(64) };
function fixture(tag = 'COMMIT') {
  const commands: string[] = []; const releases: boolean[] = [];
  const client: TransactionConnection = { async query(sql) { commands.push(sql); if (sql === 'COMMIT') { if (tag === 'lost') throw new Error('lost'); return { command: tag }; } return { command: sql.split(' ')[0] }; }, release(discard) { releases.push(discard); } };
  return { commands, releases, client, deps: { context, claim, connect: async () => client, work: async () => success(1), pause: async () => {} } };
}
it('pins context, bounds queries, cleans session, and expires callbacks', async () => {
  const f = fixture(); let saved: ScopedQueries | undefined;
  expect((await runCandidate({ ...f.deps, work: async c => { saved = c; await c.query('SELECT 1'); return success(1); } })).status).toBe('committed');
  expect(f.commands[0]).toBe('DISCARD ALL'); expect(f.commands.at(-1)).toBe('DISCARD ALL');
  expect(f.commands.some(c => c.includes("set_config('hourvia.operation'"))).toBe(true);
  await expect(saved!.query('SELECT 2')).rejects.toThrow('EXPIRED'); expect(f.releases).toEqual([false]);
});
it.each(['ROLLBACK','SELECT','lost'])('rejects nonacknowledged COMMIT %s', async tag => {
  const f = fixture(tag); let calls = 0;
  const result = await runCandidate({ ...f.deps, work: async () => { calls++; return success(1); } });
  expect(result.status).toBe(tag === 'ROLLBACK' ? 'rolled_back' : 'commit_unknown'); expect(calls).toBe(1);
  expect(f.releases).toEqual([tag !== 'ROLLBACK']);
});
it.each(['match','mismatch','absent','failure'])('reconciles only a durable matching completed claim: %s', async mode => {
  const f = fixture('lost');
  const result = await runCandidate({ ...f.deps, reconcile: async () => {
    expect(f.releases).toEqual([true]);
    if (mode === 'failure') throw new Error('lookup failed');
    if (mode === 'absent') return { status: 'unresolved' };
    return { status: 'completed', claim: { ...claim, inputDigest: mode === 'match' ? claim.inputDigest : 'b'.repeat(64) }, value: 2 };
  } });
  expect(result).toEqual(mode === 'match' ? { status: 'committed', value: 2 } : { status: 'commit_unknown' });
});
it.each(['40001','40P01'])('bounds retries and expires previous scopes %s', async code => {
  const f = fixture(); const scopes: ScopedQueries[] = [];
  expect((await runCandidate({ ...f.deps, work: async c => { scopes.push(c); throw { code }; } })).status).toBe('unavailable');
  expect(scopes).toHaveLength(3); expect(f.releases).toEqual([false,false,false]);
  for (const scope of scopes) await expect(scope.query('SELECT 1')).rejects.toThrow('EXPIRED');
});
it('discards failed session cleanup while retaining acknowledged outcome', async () => {
  const f = fixture(); const query = f.client.query; let resets = 0;
  f.client.query = async (sql, params) => { if (sql === 'DISCARD ALL' && ++resets === 2) throw new Error('reset'); return query(sql, params); };
  expect((await runCandidate(f.deps)).status).toBe('committed'); expect(f.releases).toEqual([true]);
});
it('rejects cross-tenant claim before acquiring a client', async () => {
  const f = fixture(); await expect(runCandidate({ ...f.deps, claim: { ...claim, organizationId: context.actorId } })).rejects.toThrow('CLAIM_CONTEXT'); expect(f.commands).toEqual([]);
});

it('fails and discards before work when the initial reset fails', async () => {
  const f = fixture(); let work = false;
  f.client.query = async () => { throw new Error('reset'); };
  expect((await runCandidate({ ...f.deps, work: async () => { work = true; return success(1); } })).status).toBe('unavailable');
  expect(work).toBe(false); expect(f.releases).toEqual([true]);
});
it('cannot commit after a swallowed query failure', async () => {
  const f = fixture(); const query = f.client.query;
  f.client.query = async (sql, params) => { if (sql === 'SELECT bad') throw new Error('bad'); return query(sql, params); };
  expect((await runCandidate({ ...f.deps, work: async c => { try { await c.query('SELECT bad'); } catch { /* faulty callback */ } return success(1); } })).status).toBe('unavailable');
  expect(f.commands).not.toContain('COMMIT'); expect(f.commands).toContain('ROLLBACK');
});
