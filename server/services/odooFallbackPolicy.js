// No scheduled-date-only fallback: GCA/TBM must approve the appointment rule.
const fieldName = value => typeof value === 'string' && /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/.test(value);
const policyError = message => Object.assign(new Error(message), { code: 'FALLBACK_POLICY_NOT_CONFIGURED' });

function validateDate(date) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw policyError('Fallback date must be a valid YYYY-MM-DD date.');
  return date;
}

function tomorrowMalaysia(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now.getTime() + 86400000));
}

function loadFallbackPolicy(env = process.env) {
  if (env.ODOO_FALLBACK_POLICY_APPROVED !== 'true') throw policyError('5 PM fallback is blocked until GCA/TBM eligibility mapping is approved and configured.');
  const dateField = env.ODOO_FALLBACK_DATE_FIELD;
  const dateType = env.ODOO_FALLBACK_DATE_TYPE;
  const statusField = env.ODOO_FALLBACK_APPOINTMENT_STATUS_FIELD;
  if (!fieldName(dateField) || !fieldName(statusField) || !['date', 'datetime'].includes(dateType)) throw policyError('Configure the approved fallback date field, date type and appointment-status field.');
  let confirmedValues, extraDomain;
  try {
    confirmedValues = JSON.parse(env.ODOO_FALLBACK_CONFIRMED_VALUES || 'null');
    extraDomain = JSON.parse(env.ODOO_FALLBACK_EXTRA_DOMAIN || '[]');
  } catch { throw policyError('Fallback eligibility values/domain must be valid JSON.'); }
  if (!Array.isArray(confirmedValues) || !confirmedValues.length || confirmedValues.some(value => value !== true && (typeof value !== 'string' || !value.trim()))) throw policyError('Configure a non-empty list of approved active-confirmed appointment values.');
  if (!Array.isArray(extraDomain) || extraDomain.some(term => !['|', '&', '!'].includes(term) && !(Array.isArray(term) && term.length === 3 && fieldName(term[0]) && typeof term[1] === 'string'))) throw policyError('Invalid extra fallback eligibility domain.');
  const pageSize = Number(env.ODOO_FALLBACK_PAGE_SIZE || 200);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw policyError('Fallback page size must be between 1 and 1000.');
  return { dateField, dateType, statusField, confirmedValues, extraDomain, pageSize };
}

function fallbackDomain(date, policy) {
  validateDate(date);
  const dates = policy.dateType === 'date' ? [[policy.dateField, '=', date]] : [
    [policy.dateField, '>=', new Date(`${date}T00:00:00+08:00`).toISOString().replace('T', ' ').slice(0, 19)],
    [policy.dateField, '<', new Date(new Date(`${date}T00:00:00+08:00`).getTime() + 86400000).toISOString().replace('T', ' ').slice(0, 19)],
  ];
  return [['picking_type_code', '=', 'outgoing'], ['state', 'not in', ['done', 'cancel']],
    [policy.statusField, 'in', policy.confirmedValues], ...dates, ...policy.extraDomain];
}

module.exports = { loadFallbackPolicy, fallbackDomain, validateDate, tomorrowMalaysia };
