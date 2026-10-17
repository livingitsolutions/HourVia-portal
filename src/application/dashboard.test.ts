import { expect, it, vi } from 'vitest';
import { formatHours, loadDashboard } from './dashboard';
it('rejects invalid periods before accessing a source', async () => {
  const get = vi.fn();
  await expect(loadDashboard({ get }, 'all-time')).rejects.toThrow();
  expect(get).not.toHaveBeenCalled();
});
it('passes a valid period to the source', async () => {
  const get = vi.fn().mockResolvedValue({ source: 'demonstration' });
  await expect(loadDashboard({ get }, 'week')).resolves.toEqual({ source: 'demonstration' });
  expect(get).toHaveBeenCalledWith('week');
});
it('formats fractional hours consistently', () => { expect(formatHours(168.5)).toBe('168.5h'); });
