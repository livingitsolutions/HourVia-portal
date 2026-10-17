import { z } from 'zod';
export const periodSchema = z.enum(['week', 'last-week']);
export type Period = z.infer<typeof periodSchema>;
export interface ProjectSummary { name: string; client: string; initials: string; color: string; hours: number; budget: number; status: 'On track' | 'Needs attention' }
export interface Dashboard { source: 'demonstration'; hours: number; billable: number; activeProjects: number; members: number; daily: readonly number[]; projects: readonly ProjectSummary[] }
export interface DashboardSource { get(period: Period): Promise<Dashboard> }
export async function loadDashboard(source: DashboardSource, input: unknown): Promise<Dashboard> { return source.get(periodSchema.parse(input)); }
export function formatHours(hours: number): string { return `${hours.toLocaleString('en-US', { maximumFractionDigits: 1 })}h`; }
