const DAY = 86400000;
const { APPOINTMENT_SESSIONS } = require('./odooAppointmentSessions');
function error(code, message, statusCode = 409) { return Object.assign(new Error(message), { code, statusCode, status: statusCode }); }
const malaysiaDate = (now = new Date()) => new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
function latestSchedule(now = new Date()) {
  let day = malaysiaDate(now);
  let scheduled = new Date(`${day}T17:00:00+08:00`);
  if (scheduled > now) { scheduled = new Date(scheduled.getTime() - DAY); day = malaysiaDate(scheduled); }
  return { scheduled, date: malaysiaDate(new Date(scheduled.getTime() + DAY)) };
}
function deadline(row) { return new Date(row.report?.deadline_at || new Date(row.created_at).getTime() + DAY); }
function assertDeadline(row, now = new Date()) {
  if (!Number.isFinite(deadline(row).getTime()) || now >= deadline(row)) throw error('RECOVERY_DEADLINE_EXPIRED', 'The original 24-hour recovery deadline has expired or is invalid; operational review is required.');
  if (row.target_date < malaysiaDate(now)) throw error('APPOINTMENT_DATE_EXPIRED', 'The original delivery date has passed; operational review is required.');
}
function appointmentMetadata(detail, targetDate, policy, now = new Date()) {
  const values = detail.fallback_appointment;
  const session = policy.sessionValues[values?.session];
  const reference = values?.reference;
  if (!APPOINTMENT_SESSIONS[session] || typeof reference !== 'string' || !reference.trim() || reference.length > 100) {
    throw error('INVALID_FALLBACK_APPOINTMENT', 'Odoo confirmed appointment session/reference is missing or invalid. Correct the DO or approved mapping.', 400);
  }
  let date;
  if (policy.dateType === 'date') date = values?.date;
  else {
    const raw = values?.date;
    const iso = typeof raw === 'string' ? raw.replace(' ', 'T') : '';
    const instant = new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
    if (Number.isFinite(instant.getTime())) date = malaysiaDate(instant);
  }
  if (date !== targetDate) throw error('APPOINTMENT_DATE_MISMATCH', 'Odoo appointment does not match the original target delivery date.', 400);
  const start = new Date(`${date}T${APPOINTMENT_SESSIONS[session][0]}:00+08:00`);
  if (now >= start) throw error('APPOINTMENT_WINDOW_EXPIRED', 'Appointment session has started or expired. Do not silently schedule late work.');
  return { appointment_status: 'confirmed', appointment_request_ref: reference.trim(),
    requested_appointment_date: date, requested_appointment_session: session,
    preferred_timeslot: start,
    appointment_requirements: { source: 'odoo_fallback', confirmed_date: date, confirmed_session: session, source_appointment_reference: reference.trim() } };
}
module.exports = { DAY, error, malaysiaDate, latestSchedule, deadline, assertDeadline, appointmentMetadata };
