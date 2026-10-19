// Read-only selected-day planning summary. Never optimises or changes assignments.
const personName = person => person?.display_name || person?.name || null;
const numberOrNull = value => value == null || !Number.isFinite(Number(value)) ? null : Number(value);

function summariseMetric(runs, field) {
  const active = runs.filter(run => run.total_do > 0);
  const known = active.filter(run => run[field] != null);
  return { value: !active.length ? 0 : known.length ? known.reduce((sum, run) => sum + run[field], 0) : null, incomplete: known.length < active.length };
}

function buildAdminDeliveryOverview(teams, slots, date) {
  const teamMap = new Map(teams.map(team => [team.id, { id: team.id, name: team.team_type || 'Delivery team', default_truck: team.truck?.plate_no || null, default_pair: [personName(team.primary_driver), personName(team.assistant_driver)].filter(Boolean), runs: [] }]));
  for (const slot of slots) {
    const id = slot.delivery_team_id || 'unassigned';
    if (!teamMap.has(id)) teamMap.set(id, { id, name: slot.delivery_team?.team_type || 'Unassigned team', default_pair: [], runs: [] });
    const team = slot.delivery_team;
    const trip = slot.lorry_trip;
    const driver = trip ? personName(trip.employees_lorry_trips_driver_idToemployees)
      : personName(team?.primary_driver) || personName(slot.truck?.employees_trucks_driver_idToemployees);
    const assistant = trip ? personName(trip.employees_lorry_trips_assistant_idToemployees)
      : personName(team?.assistant_driver) || personName(slot.truck?.employees_trucks_assistant_idToemployees);
    const plan = slot.route_plan || {};
    const rank = new Map((plan.stops || []).map((stop, index) => [stop.order_id, index]));
    const orders = [...(slot.orders || [])].sort((a, b) => {
      const routeOrder = (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER);
      if (routeOrder) return routeOrder;
      return (Number(b.truck_loading_sequence) || 0) - (Number(a.truck_loading_sequence) || 0);
    }).map(order => {
      const stop = (plan.stops || []).find(item => item.order_id === order.id);
      return {
        id: order.id, reference: order.odoo_order_ref || order.id,
        status: order.order_status, customer_name: order.customers?.full_name || '',
        address: [order.remarks_delivery_address || order.delivery_address, order.delivery_city, order.delivery_postcode].filter(Boolean).join(', '),
        area: order.delivery_city?.trim() || order.buildings?.zone?.zone_name || null,
        items: (order.order_products || []).reduce((sum, item) => sum + Math.max(0, Number(item.quantity ?? 1)), 0),
        latitude: numberOrNull(order.buildings?.latitude), longitude: numberOrNull(order.buildings?.longitude),
        eta: stop?.eta || order.scheduled_start_date_time || null,
        sequence: stop?.delivery_sequence || null,
      };
    });
    const counted = orders.filter(order => order.status !== 'Cancelled');
    teamMap.get(id).runs.push({
      id: slot.id, start: slot.time_window_start, end: slot.time_window_end, status: slot.slot_status,
      truck_plate: slot.truck?.plate_no || team?.truck?.plate_no || null,
      pair: [driver, assistant].filter(Boolean), total_do: counted.length,
      total_items: counted.reduce((sum, order) => sum + order.items, 0),
      distance_m: numberOrNull(slot.route_distance_m), drive_seconds: numberOrNull(slot.route_duration_s),
      used_fallback: Boolean(plan.used_fallback), route_polyline: slot.route_polyline || null,
      orders,
    });
  }
  const result = [...teamMap.values()].map(team => {
    team.runs.sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
    const areas = new Map();
    team.runs.flatMap(run => run.orders).filter(order => order.status !== 'Cancelled' && order.area).forEach(order => areas.set(order.area, (areas.get(order.area) || 0) + 1));
    const distance = summariseMetric(team.runs, 'distance_m');
    const duration = summariseMetric(team.runs, 'drive_seconds');
    return {
      ...team,
      truck_plates: [...new Set(team.runs.map(run => run.truck_plate).filter(Boolean).concat(team.runs.length ? [] : [team.default_truck].filter(Boolean)))],
      pairs: [...new Set(team.runs.map(run => run.pair.join(' + ')).filter(Boolean).concat(team.runs.length ? [] : [team.default_pair.join(' + ')].filter(Boolean)))],
      total_do: team.runs.reduce((sum, run) => sum + run.total_do, 0),
      total_items: team.runs.reduce((sum, run) => sum + run.total_items, 0),
      delivered: team.runs.flatMap(run => run.orders).filter(order => order.status === 'Delivered').length,
      failed: team.runs.flatMap(run => run.orders).filter(order => order.status === 'Failed').length,
      distance_m: distance.value, drive_seconds: duration.value,
      distance_incomplete: distance.incomplete, drive_time_incomplete: duration.incomplete,
      metrics_incomplete: distance.incomplete || duration.incomplete,
      areas: [...areas].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, orders]) => ({ name, orders })),
    };
  }).sort((a, b) => Number(b.total_do > 0) - Number(a.total_do > 0) || a.name.localeCompare(b.name));
  return { date, teams: result, total_do: result.reduce((sum, team) => sum + team.total_do, 0), total_items: result.reduce((sum, team) => sum + team.total_items, 0) };
}
module.exports = { buildAdminDeliveryOverview };
