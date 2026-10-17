import type { DashboardSource } from '../application/dashboard';
export const demoDashboard: DashboardSource = { async get(period) {
  return { source: 'demonstration', hours: period === 'week' ? 168.5 : 152.2, billable: period === 'week' ? 142.5 : 126.8, activeProjects: 6, members: 12, daily: period === 'week' ? [30, 36, 27, 42, 33.5, 0, 0] : [26, 32, 28, 35, 31.2, 0, 0], projects: [
    { name: 'Website redesign', client: 'Orbit Studio', initials: 'OS', color: 'mint', hours: 48.5, budget: 80, status: 'On track' },
    { name: 'Brand identity', client: 'Layers & Co.', initials: 'LC', color: 'lavender', hours: 32, budget: 60, status: 'On track' },
    { name: 'Customer portal', client: 'Northstar', initials: 'NS', color: 'sand', hours: 62, budget: 70, status: 'Needs attention' },
    { name: 'Product discovery', client: 'Forma', initials: 'FO', color: 'blue', hours: 26, budget: 48, status: 'On track' }
  ] };
} };
