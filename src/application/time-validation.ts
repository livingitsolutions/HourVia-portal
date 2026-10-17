import { z } from 'zod';
const instant = z.number().int().min(0).max(8640000000000000);
export const detailsSchema = z.object({ description: z.string().trim().max(2000), billable: z.boolean(), projectId: z.string().trim().min(1).max(200).optional(), clientId: z.string().trim().min(1).max(200).optional() }).strict();
export const manualSchema = detailsSchema.extend({ startedAt: instant, endedAt: instant, durationMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional() }).refine(x => x.startedAt < x.endedAt, 'Start must precede end');
