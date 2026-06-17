// Shared default notification copy for A3 proactive messages.
// Keep in sync with client/src/utils/templateMessages.js and NotificationSettings PROACTIVE_DEFAULTS.

const DEFAULT_BRAND_NAME = 'TBM Delivery';

const TEMPLATE_ON_THE_WAY = `Hi {customerName},

Your order {orderRef} is on the way with TBM Delivery.

Date: {slotDate}
Time: {timeWindow}
Delivery Address: {address}

Please ensure someone is available to receive the delivery. Our driver will contact you if needed.

— {brandName}`;

const TEMPLATE_D1_REMINDER = `Hi {customerName},

Friendly reminder: your TBM delivery for order {orderRef} is scheduled for tomorrow.

Date: {slotDate}
Time: {timeWindow}
Delivery Address: {address}

Please ensure someone is available to sign for the delivery. Reply to this message if you need to reschedule.

— {brandName}`;

const SUBJECT_ON_THE_WAY = 'Your TBM delivery is on the way — {orderRef}';
const SUBJECT_D1_REMINDER = 'Reminder: delivery tomorrow — {orderRef}';

function applyTemplate(template, vars) {
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || '');
}

module.exports = {
  DEFAULT_BRAND_NAME,
  TEMPLATE_ON_THE_WAY,
  TEMPLATE_D1_REMINDER,
  SUBJECT_ON_THE_WAY,
  SUBJECT_D1_REMINDER,
  applyTemplate,
};
