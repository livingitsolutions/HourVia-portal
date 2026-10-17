import { describe, expect, it } from 'vitest';
import { success, failure } from '../../src/domain/result';
import { runTransaction, type QueryReply, type TransactionConnection } from '../transaction';
const context = { actorId: '11111111-1111-4111-8111-111111111111', sessionId: '22222222-2222-4222-8222-222222222222', organizationId: '33333333-3333-4333-8333-333333333333' };
function fake(commit: () => Promise<QueryReply> = async () => ({ command: 'COMMIT' })) {
  const commands: string[] = []; const releases: boolean[] = [];
  const connection: TransactionConnection = {
    async query(text) {
      commands.push(text);
      if (text === 'COMMIT') return commit();
      return { command: text.split(' ')[0] };
    }, release(discard) { releases.push(discard); },
  };
  return { connection, commands, releases };
}
describe('transaction acknowledgement protocol', () => {
  it('sets local context on the same connection, before work, and acknowledges COMMIT', async () => {
    const f = fake();
    const result = await runTransaction({ connect: async () => f.connection, context, work: async c => {
      expect(c).toBe(f.connection); expect(f.commands[1]).toContain("set_config('hourvia.actor_id', $1, true)"); return success(42);
    } });
    expect(result).toEqual({ status: 'committed', value: 42 });
    expect(f.commands[0]).toBe('BEGIN ISOLATION LEVEL SERIALIZABLE'); expect(f.commands.at(-1)).toBe('COMMIT'); expect(f.releases).toEqual([false]);
  });
  it('never treats a returned ROLLBACK as success', async () => {
    const f = fake(async () => ({ command: 'ROLLBACK' }));
    expect(await runTransaction({ connect: async () => f.connection, context, work: async () => success(1) })).toEqual({ status: 'rolled_back' });
  });
  it.each(['transport', 'unexpected command'])('discards uncertain COMMIT without retry: %s', async kind => {
    let connects = 0;
    const f = fake(async () => { if (kind === 'transport') throw new Error('connection lost'); return { command: 'SELECT' }; });
    const result = await runTransaction({ connect: async () => { connects++; return f.connection; }, context, work: async () => success(1) });
    expect(result.status).toBe('commit_unknown'); expect(connects).toBe(1); expect(f.releases).toEqual([true]); expect(f.commands).not.toContain('ROLLBACK');
  });
  it('rolls back typed failures, never sends COMMIT', async () => {
    const f = fake();
    expect(await runTransaction({ connect: async () => f.connection, context, work: async () => failure('FORBIDDEN') })).toEqual({ status: 'rejected', error: 'FORBIDDEN' });
    expect(f.commands.at(-1)).toBe('ROLLBACK'); expect(f.commands).not.toContain('COMMIT');
  });
  it('rolls back exceptions and bounds serialization retries with fresh work', async () => {
    const f = fake(); let calls = 0;
    const result = await runTransaction({ connect: async () => f.connection, context, pause: async () => {}, work: async () => { calls++; throw { code: '40001' }; } });
    expect(result.status).toBe('unavailable'); expect(calls).toBe(3); expect(f.commands.filter(c => c === 'ROLLBACK')).toHaveLength(3);
  });
  it('retries a definite COMMIT serialization abort after acknowledged rollback', async () => {
    let commits = 0; const f = fake(async () => { if (++commits === 1) throw { code: '40001' }; return { command: 'COMMIT' }; });
    expect((await runTransaction({ connect: async () => f.connection, context, pause: async () => {}, work: async () => success(1) })).status).toBe('committed'); expect(commits).toBe(2);
  });
  it('discards rollback failures and stops retries', async () => {
    const f = fake(); const query = f.connection.query;
    f.connection.query = async (sql, params) => { if (sql === 'ROLLBACK') throw new Error('lost'); return query(sql, params); };
    expect((await runTransaction({ connect: async () => f.connection, context, work: async () => { throw { code: '40P01' }; } })).status).toBe('unavailable');
    expect(f.releases).toEqual([true]);
  });
  it('does not retry application exceptions', async () => {
    const f = fake(); let calls = 0;
    expect((await runTransaction({ connect: async () => f.connection, context, work: async () => { calls++; throw new Error('invalid'); } })).status).toBe('unavailable'); expect(calls).toBe(1);
  });
  it('rejects absent or malformed context and excessive retries before connection', async () => {
    let connected = false; const connect = async () => { connected = true; return fake().connection; };
    await expect(runTransaction({ connect, context: { ...context, organizationId: '' }, work: async () => success(1) })).rejects.toThrow('INVALID_SECURITY_CONTEXT');
    await expect(runTransaction({ connect, context, maxAttempts: 4, work: async () => success(1) })).rejects.toThrow('INVALID_RETRY_BOUND'); expect(connected).toBe(false);
  });
  it('returns unavailable for connection failure', async () => {
    expect((await runTransaction({ connect: async () => { throw new Error('offline'); }, context, work: async () => success(1) })).status).toBe('unavailable');
  });
});
