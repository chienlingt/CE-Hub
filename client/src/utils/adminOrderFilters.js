export const ORDER_FILTER_DEFAULTS = { search: '', date: 'today', start: '', end: '', status: 'all', team: 'all', readiness: 'all', area: 'all', sync: 'all', view: 'all', sort: 'created_desc' };
export const ORDER_FILTER_STORAGE = 'cehub.admin.orderFilters.v1';
export function malaysiaDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function deliveryDate(order) {
  return malaysiaDate(order.scheduled_start_date_time) || order.requested_appointment_date || malaysiaDate(order.preferred_timeslot) || '';
}
export function orderTeam(order) {
  return order.time_slots?.delivery_team_id || 'unassigned';
}
export function orderArea(order) {
  return order.delivery_city || order.customers?.city || '';
}
export function needsScheduling(order) {
  return ['pending', 'unscheduled'].includes((order.order_status || '').toLowerCase());
}
export function preparationReady(order) {
  const lines = order.order_products || [];
  return order.doo_ready === true && lines.length > 0 && lines.every(line => {
    const quantity = Number(line.quantity || 0);
    const serials = line.assigned_serials?.length ? line.assigned_serials : line.assigned_serial ? [line.assigned_serial] : [];
    return quantity > 0 && Number(line.prepared_quantity || 0) >= quantity && (line.serial_tracking === 'none' || serials.length >= quantity);
  });
}
export function attentionReasons(order) {
  const status = (order.order_status || '').toLowerCase();
  const reasons = [];
  if (['failed', 'issue'].includes(status)) reasons.push('Delivery issue');
  if (!['delivered', 'completed', 'cancelled', 'failed'].includes(status) && order.odoo_picking_id && !preparationReady(order)) reasons.push('Preparation incomplete');
  if (['dead', 'failed', 'error'].includes(order.odoo_sync?.status || order.odoo_sync_status)) reasons.push('Sync error');
  return reasons;
}
export function filterAdminOrders(orders, filters, now = new Date()) {
  const today = malaysiaDate(now);
  const tomorrow = malaysiaDate(new Date(new Date(now).getTime() + 86400000));
  const search = filters.search.trim().toLowerCase();
  return orders.filter(order => {
    const date = deliveryDate(order);
    if (filters.date === 'today' && date !== today) return false;
    if (filters.date === 'tomorrow' && date !== tomorrow) return false;
    if (filters.date === 'custom' && (!date || (filters.start && date < filters.start) || (filters.end && date > filters.end))) return false;
    if (filters.status !== 'all' && order.order_status !== filters.status) return false;
    if (filters.team !== 'all' && orderTeam(order) !== filters.team) return false;
    if (filters.area !== 'all' && orderArea(order) !== filters.area) return false;
    if (filters.sync !== 'all' && (order.odoo_sync?.status || 'none') !== filters.sync) return false;
    if (filters.readiness !== 'all' && preparationReady(order) !== (filters.readiness === 'ready')) return false;
    if (filters.view === 'scheduling' && !needsScheduling(order)) return false;
    if (filters.view === 'attention' && !attentionReasons(order).length) return false;
    if (!search) return true;
    const lines = order.order_products || [];
    const values = [order.id, order.odoo_order_ref, order.odoo_sales_ref, order.customers?.full_name, order.customers?.phone,
      order.remarks_contact_phone, order.remarks_delivery_address, order.delivery_address, order.customers?.address,
      order.buildings?.building_name, ...lines.flatMap(line => [line.odoo_product_name, line.products?.product_name,
        line.assigned_serial, line.loaded_serial, line.unloaded_serial, ...(line.assigned_serials || []),
        ...(Array.isArray(line.unit_scans) ? line.unit_scans.flatMap(unit => [unit.assigned_serial, unit.loaded_serial, unit.unloaded_serial]) : [])])];
    return values.some(value => String(value || '').toLowerCase().includes(search));
  });
}
