const prisma = require('../prismaClient');
async function sendRunAlert(id) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM odoo_sync_runs WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await tx.odoo_sync_runs.findUnique({ where: { id } });
    if (!row?.report?.pending_alert || row.run_key.startsWith('sync_preview:')) return;
    const report = JSON.parse(JSON.stringify(row.report));
    const key = `${report.pending_alert}:${report.cycle_start_attempt || 0}`;
    report.alerts ||= {};
    if (!report.alerts[key]) {
      const admins = await tx.employees.findMany({ where: { active_flag: true, role: { name: { contains: 'admin', mode: 'insensitive' } } }, select: { id: true } });
      if (!admins.length) return; // Retry when an administrator is available.
      const label = { missed_start: 'missed its scheduled start', needs_correction: 'needs correction', retry_exhausted: 'exhausted its recovery budget' }[report.pending_alert] || 'needs attention';
      await tx.notifications.createMany({ data: admins.map(admin => ({ user_id: admin.id, type: 'error',
        message: `5 PM Odoo fallback ${label}. Delivery date ${row.target_date}. Open Sync Monitor → Run history.`, is_read: false, created_at: new Date() })) });
      report.alerts[key] = new Date().toISOString();
    }
    report.pending_alert = null;
    await tx.odoo_sync_runs.update({ where: { id }, data: { report } });
  });
}
async function flushRunAlerts() {
  const rows = await prisma.odoo_sync_runs.findMany({ where: { source: 'fallback_5pm', OR: ['missed_start', 'needs_correction', 'retry_exhausted'].map(value => ({ report: { path: ['pending_alert'], equals: value } })) }, orderBy: { created_at: 'asc' }, take: 25 });
  for (const row of rows) { try { await sendRunAlert(row.id); } catch { console.error('[OdooSync] Admin alert remains pending.'); } }
}
module.exports = { sendRunAlert, flushRunAlerts };
