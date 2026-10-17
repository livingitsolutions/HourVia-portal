import { expect, it } from 'vitest';
import { demoDashboard } from './demo-dashboard';
it.each(['week', 'last-week'] as const)('keeps %s demonstration hours internally consistent', async period => {
  const data = await demoDashboard.get(period);
  expect(data.source).toBe('demonstration');
  expect(data.daily.reduce((total, hours) => total + hours, 0)).toBeCloseTo(data.hours);
  expect(data.billable).toBeLessThanOrEqual(data.hours);
  expect(data.projects.every(project => project.hours <= project.budget)).toBe(true);
});
