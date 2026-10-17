export type TimeEntrySource = 'timer' | 'manual';
export type EntryStatus = 'draft' | 'submitted' | 'approved' | 'locked' | 'void';
export interface TimeDetails { readonly description: string; readonly billable: boolean; readonly projectId?: string; readonly clientId?: string }
export interface TimerSession extends TimeDetails { readonly id: string; readonly organizationId: string; readonly userId: string; readonly startedAt: number; readonly updatedAt: number; readonly resumedFrom?: string }
export interface RunningTimer extends TimerSession { readonly status: 'running' }
export interface TimeEntry extends TimeDetails {
  readonly id: string; readonly organizationId: string; readonly userId: string;
  readonly startedAt: number; readonly endedAt: number; readonly elapsedMs: number; readonly durationMs: number;
  readonly source: TimeEntrySource; readonly status: EntryStatus; readonly sessionId?: string;
  readonly createdAt: number; readonly updatedAt: number; readonly version: number;
}
export interface TimeEntryRevision { readonly entryId: string; readonly organizationId: string; readonly actorId: string; readonly occurredAt: number; readonly reason: string; readonly before: TimeEntry; readonly after: TimeEntry }
export interface ManualInput extends TimeDetails { readonly startedAt: number; readonly endedAt: number; readonly durationMs?: number }
export function formatDuration(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(v => String(v).padStart(2, '0')).join(':');
}
export function dayKey(timestamp: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(timestamp);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
}
export function weekDays(day: string): string[] {
  const d = new Date(`${day}T12:00:00Z`); const offset = (d.getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => new Date(d.getTime() + (i - offset) * 86400000).toISOString().slice(0, 10));
}
/** Reporting allocates an entry's entire recorded duration to its start date in the explicit display zone. */
export function selectEntries(entries: readonly TimeEntry[], days: readonly string[], timeZone: string, billable?: boolean, projectId?: string) {
  return entries.filter(e => e.status !== 'void' && days.includes(dayKey(e.startedAt, timeZone)) && (billable === undefined || e.billable === billable) && (!projectId || e.projectId === projectId)).sort((a, b) => b.startedAt - a.startedAt);
}
export function totalDuration(entries: readonly TimeEntry[]): number { return entries.filter(e => e.status !== 'void').reduce((sum, e) => sum + e.durationMs, 0); }
