import { driverTab } from './driverStatusMap';

export const runWindowKey = run => `${run.start || ''}|${run.end || ''}`;

export function adminSlotOptions(teams, selectedTeam) {
  const windows = new Map();
  teams.filter(team => selectedTeam === 'all' || team.id === selectedTeam).forEach(team => team.runs.forEach(run => {
    const key = runWindowKey(run);
    if (!windows.has(key)) windows.set(key, { value: key, label: run.start || run.end ? `${run.start || '—'} – ${run.end || '—'}` : 'Unscheduled', count: 0 });
    windows.get(key).count += run.orders.length;
  }));
  const options = [...windows.values()].sort((a, b) => a.value.localeCompare(b.value));
  return [{ value: 'all', label: 'All time slots', count: options.reduce((sum, option) => sum + option.count, 0) }, ...options];
}

export function filterAdminTeamRoutes(teams, { selectedTeam = 'all', search = '', slot = 'all', status = 'all' } = {}) {
  const q = search.trim().toLowerCase();
  return teams.filter(team => selectedTeam === 'all' || team.id === selectedTeam)
    .map(team => ({ ...team, runs: team.runs
      .filter(run => slot === 'all' || runWindowKey(run) === slot)
      .map(run => ({ ...run, orders: run.orders.filter(order =>
        (status === 'all' || driverTab(order.status) === status) &&
        (!q || `${order.reference} ${order.customer_name} ${order.address} ${order.area || ''} ${team.name} ${run.truck_plate || ''}`.toLowerCase().includes(q))) }))
      .filter(run => run.orders.length) }))
    .filter(team => team.runs.length);
}
