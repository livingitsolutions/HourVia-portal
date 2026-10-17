import { detailsSchema, manualSchema } from './time-validation';
import type { AuthenticatedPrincipal } from '../domain/identity';
import type { OrganizationContext } from '../domain/organization';
import { failure, success, type Result } from '../domain/result';
import { type ManualInput, type RunningTimer, type TimeDetails, type TimeEntry, type TimeEntryRevision } from '../domain/time-tracking';
import type { Clock, TransactionRunner, WorkflowTransaction } from './organization';
export interface TimerRepository { active(context: OrganizationContext): Promise<RunningTimer | null>; saveTimer(context: OrganizationContext, timer: RunningTimer | null): Promise<void> }
export interface TimeEntryRepository { entries(context: OrganizationContext): Promise<readonly TimeEntry[]>; saveEntry(context: OrganizationContext, entry: TimeEntry): Promise<void> }
export interface RevisionRepository { appendRevision(context: OrganizationContext, revision: TimeEntryRevision): Promise<void> }
/** Same transaction protocol as organization workflows: all repos, authorization, audit and replay share one boundary. */
export interface TimeTransaction extends TimerRepository, TimeEntryRepository, RevisionRepository, Pick<WorkflowTransaction, 'replay' | 'complete' | 'appendAudit'> {
  authorize(context: OrganizationContext, now: number): Promise<Result<AuthenticatedPrincipal>>;
}
export interface TimeDependencies { transactions: TransactionRunner<TimeTransaction>; clock: Clock; ids: { next(): string }; actorId: string }
export type TimeCommand =
  | { kind: 'start'; details: TimeDetails; resumeEntryId?: string }
  | { kind: 'stop'; timerId: string }
  | { kind: 'describe'; timerId: string; description: string }
  | { kind: 'discard'; timerId: string; confirmed: boolean }
  | { kind: 'create'; entry: ManualInput }
  | { kind: 'edit'; entryId: string; expectedVersion: number; entry: ManualInput; reason: string }
  | { kind: 'void'; entryId: string; expectedVersion: number; reason: string; confirmed: boolean };
export function createTimeEngine(deps: TimeDependencies) {
  async function within<T>(organizationId: string, work: (tx: TimeTransaction, ctx: OrganizationContext, now: number) => Promise<Result<T>>): Promise<Result<T>> {
    if (!organizationId || !deps.actorId) return failure('INVALID_INPUT');
    const ctx = { organizationId, actorId: deps.actorId };
    try { return await deps.transactions.run(ctx, async tx => {
      const now = deps.clock.now(); if (!Number.isSafeInteger(now) || now < 0) return failure('UNAVAILABLE');
      const auth = await tx.authorize(ctx, now);
      if (!auth.ok) return auth;
      if (auth.value.userId !== ctx.actorId || !auth.value.sessionId || !Number.isFinite(auth.value.expiresAt) || auth.value.expiresAt <= now) return failure('UNAUTHENTICATED');
      return work(tx, ctx, now);
    }); } catch { return failure('UNAVAILABLE'); }
  }
  return {
    read: (organizationId: string) => within(organizationId, async (tx, ctx) => {
      const timer = await tx.active(ctx), entries = await tx.entries(ctx);
      const owned = (record: { organizationId: string; userId: string }) => record.organizationId === ctx.organizationId && record.userId === ctx.actorId;
      return (timer && !owned(timer)) || entries.some(e => !owned(e)) ? failure('FORBIDDEN') : success({ timer, entries });
    }),
    execute: (organizationId: string, key: string, command: TimeCommand) => within<TimeEntry | RunningTimer | null>(organizationId, async (tx, ctx, now) => {
      if (!key || key.length > 200) return failure('INVALID_INPUT');
      const digest = JSON.stringify(command);
      const replay = await tx.replay<TimeEntry | RunningTimer | null>(ctx, key, digest);
      if (!replay.ok) return replay;
      if (replay.value.found) return success(replay.value.value);
      const entries = await tx.entries(ctx); const timer = await tx.active(ctx);
      if (timer && (timer.organizationId !== ctx.organizationId || timer.userId !== ctx.actorId)) return failure('FORBIDDEN');
      const owned = (id: string) => entries.find(e => e.id === id && e.organizationId === ctx.organizationId && e.userId === ctx.actorId);
      let value: TimeEntry | RunningTimer | null = null; let changed = true; let target = '';
      if (command.kind === 'start') {
        const details = detailsSchema.safeParse(command.details); if (!details.success) return failure('INVALID_INPUT');
        if (timer) return failure('CONFLICT');
        const resumed = command.resumeEntryId ? owned(command.resumeEntryId) : undefined;
        if (command.resumeEntryId && (!resumed || resumed.status === 'void')) return failure('NOT_FOUND');
        value = { ...details.data, id: deps.ids.next(), organizationId, userId: ctx.actorId, startedAt: now, updatedAt: now, status: 'running', resumedFrom: resumed?.id };
        target = value.id; await tx.saveTimer(ctx, value);
      } else if (command.kind === 'stop' || command.kind === 'describe' || command.kind === 'discard') {
        if (!timer || timer.id !== command.timerId) {
          const stopped = entries.find(e => e.sessionId === command.timerId && e.userId === ctx.actorId && e.organizationId === organizationId);
          if (command.kind !== 'stop' || !stopped) return failure('NOT_FOUND');
          value = stopped; changed = false;
        } else {
          target = timer.id;
          if (command.kind === 'describe') {
            const details = detailsSchema.safeParse({ description: command.description, billable: timer.billable, projectId: timer.projectId, clientId: timer.clientId });
            if (!details.success) return failure('INVALID_INPUT');
            value = { ...timer, description: details.data.description, updatedAt: now }; await tx.saveTimer(ctx, value);
          } else {
            if (command.kind === 'discard' && command.confirmed !== true) return failure('INVALID_INPUT');
            if (command.kind === 'stop') {
              if (now <= timer.startedAt) return failure('INVALID_INPUT');
              value = { id: deps.ids.next(), organizationId, userId: ctx.actorId, description: timer.description, billable: timer.billable, projectId: timer.projectId, clientId: timer.clientId, startedAt: timer.startedAt, endedAt: now, elapsedMs: now - timer.startedAt, durationMs: now - timer.startedAt, source: 'timer', status: 'draft', sessionId: timer.id, createdAt: now, updatedAt: now, version: 0 };
              await tx.saveEntry(ctx, value);
            }
            await tx.saveTimer(ctx, null);
          }
        }
      } else {
        const before = command.kind === 'create' ? undefined : owned(command.entryId);
        if (command.kind !== 'create') {
          if (!before) return failure('NOT_FOUND');
          if (before.status !== 'draft') return failure('INVALID_STATE');
          if (before.version !== command.expectedVersion) return failure('CONFLICT');
          if (!command.reason.trim() || command.reason.length > 500) return failure('INVALID_INPUT');
        }
        if (command.kind === 'void') {
          if (command.confirmed !== true || !before) return failure('INVALID_INPUT');
          value = { ...before, status: 'void', version: before.version + 1, updatedAt: now };
        } else {
          const parsed = manualSchema.safeParse(command.entry); if (!parsed.success) return failure('INVALID_INPUT');
          const { durationMs, ...details } = parsed.data;
          value = { ...before, ...details, id: before?.id ?? deps.ids.next(), organizationId, userId: ctx.actorId, elapsedMs: details.endedAt - details.startedAt, durationMs: durationMs ?? details.endedAt - details.startedAt, source: before?.source ?? 'manual', status: 'draft', createdAt: before?.createdAt ?? now, updatedAt: now, version: before ? before.version + 1 : 0 };
        }
        target = value.id; await tx.saveEntry(ctx, value);
        if (before && command.kind !== 'create') await tx.appendRevision(ctx, { entryId: value.id, organizationId, actorId: ctx.actorId, occurredAt: now, reason: command.reason.trim(), before, after: value });
      }
      if (changed) await tx.appendAudit({ ...ctx, action: `time.${command.kind}`, targetId: target, occurredAt: now, aggregateVersion: value && 'version' in value ? value.version : 0, correlationId: key });
      await tx.complete(ctx, key, digest, value);
      return success(value);
    }),
  };
}
