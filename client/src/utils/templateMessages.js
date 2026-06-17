// client/src/utils/templateMessages.js
// WhatsApp message templates for the driver dashboard.
// Keep proactive copy in sync with server/notificationTemplateDefaults.js

const DEFAULT_BRAND_NAME = 'TBM Delivery';

const TEMPLATE_ON_THE_WAY = `Hi {customerName},

Your order {orderRef} is on the way with TBM Delivery.

Date: {slotDate}
Time: {timeWindow}
Delivery Address: {address}

Please ensure someone is available to receive the delivery. Our driver will contact you if needed.

— {brandName}`;

function applyTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

/**
 * Template sent to salesperson when a driver encounters an issue.
 */
export function salespersonIssueTemplate(orderId, customerName = '', address = '', status = '') {
  return `Hi! I am your delivery driver. I am having an issue with Order #${orderId} for customer ${customerName} at ${address}. Current status: ${status}. Please advise.`;
}

/**
 * Template sent to warehouse when a driver needs assistance.
 */
export function warehouseIssueTemplate(orderId, product = '', address = '') {
  return `Hi Warehouse team, I need help with Order #${orderId} — ${product} — delivery to ${address}. Please contact me as soon as possible.`;
}

/**
 * "On the way" template — matches admin template_on_the_way copy.
 */
export function onTheWayTemplate({
  customerName = '',
  orderRef = '',
  slotDate = '',
  timeWindow = '',
  address = '',
  brandName = DEFAULT_BRAND_NAME,
} = {}) {
  return applyTemplate(TEMPLATE_ON_THE_WAY, {
    customerName: customerName || 'Customer',
    orderRef: orderRef || 'your order',
    slotDate: slotDate || 'today',
    timeWindow: timeWindow || 'as scheduled',
    address: address || 'your delivery address',
    brandName,
  });
}

/**
 * Generic greeting template.
 */
export function greetingTemplate(customerName = '') {
  const name = customerName ? ` ${customerName}` : '';
  return `Hello${name}! I am a delivery driver from TBM. Is it convenient for you to receive your delivery now?`;
}
