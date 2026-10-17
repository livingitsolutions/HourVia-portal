import { manualSchema } from './time-validation';
import { describe, it, expect } from 'vitest';
import { createPreviewTimeTracking } from '../infrastructure/preview-time-tracking';
import { dayKey, formatDuration, selectEntries, totalDuration, weekDays, type TimeEntry } from '../domain/time-tracking';
import { failure, type Result } from '../domain/result';
import { createTimeEngine, type TimeCommand } from './time-tracking';
function value<T>(r: Result<T>): T { if (!r.ok) throw new Error(r.error); return r.value; }
const org = 'preview-living'; const other = 'preview-studio';
const details = { description: 'Focus session', billable: true, projectId: 'website' };
const input = { ...details, startedAt: Date.parse('2026-10-17T09:00:00Z'), endedAt: Date.parse('2026-10-17T10:00:00Z') };
function fixture() { let now = Date.parse('2026-10-17T23:59:00Z'); const preview = createPreviewTimeTracking({ now: () => now }); let seq = 0;
  return { ...preview, advance: (ms: number) => { now += ms; }, run: (command: TimeCommand, key = `key-${++seq}`, organizationId = org) => preview.engine.execute(organizationId, key, command), read: (organizationId = org) => preview.engine.read(organizationId) };
}
async function create(f: ReturnType<typeof fixture>) { return value(await f.run({ kind: 'create', entry: input })) as TimeEntry; }
describe('offline time commands with disposable serialized transactions', () => {
  it('starts, reads, updates description and stops with authoritative injected time across midnight', async () => {
    const f = fixture(); const started = value(await f.run({ kind: 'start', details }));
    expect(started && 'status' in started && started.status).toBe('running');
    const timer = value(await f.read()).timer!; expect(timer.id).toBe(started?.id);
    value(await f.run({ kind: 'describe', timerId: timer.id, description: 'Updated focus' }));
    f.advance(120000); const entry = value(await f.run({ kind: 'stop', timerId: timer.id })) as TimeEntry;
    expect(entry.durationMs).toBe(120000); expect(entry.description).toBe('Updated focus'); expect(entry.elapsedMs).toBe(entry.durationMs);
    expect(dayKey(entry.startedAt, 'UTC')).toBe('2026-10-17'); expect(dayKey(entry.endedAt, 'UTC')).toBe('2026-10-18');
    expect(value(await f.read()).timer).toBeNull(); expect(f.fixtures.snapshot().audit.map(e => e.action)).toEqual(['time.start', 'time.describe', 'time.stop']);
  });
  it('replays duplicate starts and stops without duplicate entries or audit; rejects reused keys with different payloads', async () => {
    const f = fixture(); const command = { kind: 'start' as const, details };
    const a = await f.run(command, 'same'); expect(await f.run(command, 'same')).toEqual(a);
    expect(await f.run({ ...command, details: { ...details, description: 'changed' } }, 'same')).toEqual(failure('CONFLICT'));
    expect(await f.run(command)).toEqual(failure('CONFLICT'));
    f.advance(1000); const id = value(a)!.id; const stop = { kind: 'stop' as const, timerId: id };
    const stopped = await f.run(stop, 'stop'); expect(await f.run(stop, 'stop')).toEqual(stopped); expect(await f.run(stop, 'new-stop')).toEqual(stopped);
    expect(value(await f.read()).entries).toHaveLength(1); expect(f.fixtures.snapshot().audit).toHaveLength(2);
  });
  it('simulates concurrent starts in one process, permitting exactly one timer (not a PostgreSQL guarantee)', async () => {
    const f = fixture(); const outcomes = await Promise.all(Array.from({ length: 12 }, () => f.run({ kind: 'start', details })));
    expect(outcomes.filter(o => o.ok)).toHaveLength(1); expect(Object.keys(f.fixtures.snapshot().timers)).toHaveLength(1);
  });
  it('does not stop, transfer, or leak a timer when switching organizations', async () => {
    const f = fixture(); value(await f.run({ kind: 'start', details }));
    expect(value(await f.read(other))).toEqual({ timer: null, entries: [] });
    value(await f.run({ kind: 'start', details }, 'other-start', other));
    expect(value(await f.read()).timer?.organizationId).toBe(org); expect(value(await f.read(other)).timer?.organizationId).toBe(other);
    expect(await f.run({ kind: 'stop', timerId: value(await f.read()).timer!.id }, 'cross-stop', other)).toEqual(failure('NOT_FOUND'));
  });
  it('rejects missing organization, unauthorized organization, foreign member entries and revoked membership even on replay', async () => {
    const f = fixture(); const created = await create(f);
    expect(await f.read('')).toEqual(failure('INVALID_INPUT')); expect(await f.read('unknown')).toEqual(failure('FORBIDDEN'));
    expect(await f.run({ kind: 'void', entryId: created.id, expectedVersion: 0, reason: 'void', confirmed: true }, 'foreign', other)).toEqual(failure('NOT_FOUND'));
    f.fixtures.seed({ ...created, id: 'foreign-entry', userId: 'other-member' });
    expect(await f.run({ kind: 'edit', entryId: 'foreign-entry', expectedVersion: 0, reason: 'change', entry: input })).toEqual(failure('NOT_FOUND'));
    value(await f.run({ kind: 'start', details }, 'replay'));
    f.fixtures.memberships[0] = { ...f.fixtures.memberships[0], status: 'revoked' };
    expect(await f.read()).toEqual(failure('FORBIDDEN')); expect(await f.run({ kind: 'start', details }, 'replay')).toEqual(failure('FORBIDDEN'));
  });
  it('creates and corrects manual entries with immutable snapshots, explicit adjustment and version conflicts', async () => {
    const f = fixture(); const original = await create(f);
    expect(original.durationMs).toBe(3600000);
    const corrected = value(await f.run({ kind: 'edit', entryId: original.id, expectedVersion: 0, reason: 'Correct recorded work', entry: { ...input, durationMs: 1800000 } })) as TimeEntry;
    expect(corrected.elapsedMs).toBe(3600000); expect(corrected.durationMs).toBe(1800000); expect(corrected.version).toBe(1);
    const revisions = f.fixtures.snapshot().revisions; expect(revisions[0].before).toEqual(original); expect(revisions[0].after).toEqual(corrected);
    revisions[0] = { ...revisions[0], reason: 'external mutation' }; expect(f.fixtures.snapshot().revisions[0].reason).toBe('Correct recorded work');
    expect(await f.run({ kind: 'edit', entryId: original.id, expectedVersion: 0, reason: 'stale', entry: input })).toEqual(failure('CONFLICT'));
  });
  it.each(['approved', 'submitted', 'locked', 'void'] as const)('rejects mutation of %s entries', async status => {
    const f = fixture(); const e = await create(f); f.fixtures.seed({ ...e, id: 'protected', status });
    expect(await f.run({ kind: 'edit', entryId: 'protected', expectedVersion: 0, reason: 'change', entry: input })).toEqual(failure('INVALID_STATE'));
    expect(await f.run({ kind: 'void', entryId: 'protected', expectedVersion: 0, reason: 'void', confirmed: true })).toEqual(failure('INVALID_STATE'));
  });
  it('voids only with confirmation and retains revision history, excluding voids from totals', async () => {
    const f = fixture(); const e = await create(f); const command = { kind: 'void' as const, entryId: e.id, expectedVersion: 0, reason: 'Mistake', confirmed: false };
    expect(await f.run(command)).toEqual(failure('INVALID_INPUT'));
    value(await f.run({ ...command, confirmed: true })); expect(totalDuration(value(await f.read()).entries)).toBe(0); expect(f.fixtures.snapshot().revisions).toHaveLength(1);
  });
  it('requires explicit confirmation to discard and resumes as a distinct session', async () => {
    const f = fixture(); const entry = await create(f);
    const timer = value(await f.run({ kind: 'start', details, resumeEntryId: entry.id }))!;
    expect(timer.id).not.toBe(entry.id); expect('resumedFrom' in timer && timer.resumedFrom).toBe(entry.id);
    expect(await f.run({ kind: 'discard', timerId: timer.id, confirmed: false })).toEqual(failure('INVALID_INPUT'));
    value(await f.run({ kind: 'discard', timerId: timer.id, confirmed: true })); expect(value(await f.read()).entries).toHaveLength(1);
  });
  it('rejects invalid durations, ranges and same-instant stops without losing the timer', async () => {
    const f = fixture();
    for (const entry of [{ ...input, durationMs: -1 }, { ...input, durationMs: 0.5 }, { ...input, endedAt: input.startedAt }, { ...input, startedAt: NaN }, { ...input, billable: 'yes' }]) expect(manualSchema.safeParse(entry).success).toBe(false);
    expect(await f.run({ kind: 'create', entry: { ...input, durationMs: -1 } })).toEqual(failure('INVALID_INPUT'));
    const timer = value(await f.run({ kind: 'start', details }))!;
    expect(await f.run({ kind: 'stop', timerId: timer.id })).toEqual(failure('INVALID_INPUT')); expect(value(await f.read()).timer).not.toBeNull();
  });
  it('calculates daily, weekly, billable and project totals, excluding voids', async () => {
    const f = fixture(); await create(f);
    value(await f.run({ kind: 'create', entry: { ...input, startedAt: input.startedAt - 86400000, endedAt: input.endedAt - 86400000, billable: false, projectId: 'research' } }));
    const entries = value(await f.read()).entries; const days = weekDays('2026-10-17'); expect(days[0]).toBe('2026-10-12');
    expect(totalDuration(selectEntries(entries, ['2026-10-17'], 'UTC'))).toBe(3600000);
    expect(totalDuration(selectEntries(entries, days, 'UTC'))).toBe(7200000);
    expect(totalDuration(selectEntries(entries, days, 'UTC', true))).toBe(3600000);
    expect(selectEntries(entries, days, 'UTC', undefined, 'research')).toHaveLength(1);
  });
  it('keeps preview instances isolated and returns defensive copies', async () => {
    const a = fixture(), b = fixture(); await create(a); const entries = value(await a.read()).entries;
    (entries as TimeEntry[]).splice(0); expect(value(await a.read()).entries).toHaveLength(1); expect(value(await b.read()).entries).toHaveLength(0);
  });
  it('uses existing transaction boundary and fails closed on repository failure', async () => {
    const engine = createTimeEngine({ actorId: 'member', clock: { now: () => 100 }, ids: { next: () => 'id' }, transactions: { async run() { throw new Error('offline'); } } });
    expect(await engine.read('org')).toEqual(failure('UNAVAILABLE'));
  });
  it('leaves entries, idempotency and audit unchanged for rejected input', async () => {
    const f = fixture(); const snapshot = f.fixtures.snapshot();
    expect(await f.run({ kind: 'create', entry: { ...input, endedAt: 0 } })).toEqual(failure('INVALID_INPUT')); expect(f.fixtures.snapshot()).toEqual(snapshot);
  });
});
describe('UTC primitives and explicit DST display', () => {
  it('formats integer elapsed units without floating hours', () => { expect(formatDuration(3661000)).toBe('01:01:01'); expect(formatDuration(90000000)).toBe('25:00:00'); });
  it('maps midnight and both repeated DST hours to explicit local dates', () => {
    expect(dayKey(Date.parse('2026-10-18T00:30:00Z'), 'America/New_York')).toBe('2026-10-17');
    for (const utc of ['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z']) expect(dayKey(Date.parse(utc), 'America/New_York')).toBe('2026-11-01');
    const spring = { ...input, startedAt: Date.parse('2026-03-08T06:30:00Z'), endedAt: Date.parse('2026-03-08T07:30:00Z') };
    expect(spring.endedAt - spring.startedAt).toBe(3600000); expect(dayKey(spring.endedAt, 'America/New_York')).toBe('2026-03-08');
    expect(() => dayKey(0, 'invalid-zone')).toThrow();
  });
});
