// client/src/utils/templateMessages.js
// WhatsApp message templates for the driver dashboard.

/**
 * Template sent to salesperson when a driver encounters an issue.
 * @param {string} orderId  - short order reference
 * @param {string} customerName
 * @param {string} address
 * @param {string} status   - current order status
 */
export function salespersonIssueTemplate(orderId, customerName = '', address = '', status = '') {
  return `Hi! I am your delivery driver. I am having an issue with Order #${orderId} for customer ${customerName} at ${address}. Current status: ${status}. Please advise.`;
}

/**
 * Template sent to warehouse when a driver needs assistance.
 * @param {string} orderId
 * @param {string} product
 * @param {string} address
 */
export function warehouseIssueTemplate(orderId, product = '', address = '') {
  return `Hi Warehouse team, I need help with Order #${orderId} — ${product} — delivery to ${address}. Please contact me as soon as possible.`;
}

/**
 * "On the way" template
 * @param {string} orderId - short order reference shown to customer
 * @param {string} address - delivery address
 */
export function onTheWayTemplate(orderId, address = '') {
  return `Hello! I am your delivery driver.\nOrder ID: ${orderId}\nI am on my way to your address: ${address}\nI will be arriving soon, please be ready to receive your delivery. Thank you!`;
}
// export function onTheWayTemplate(orderId, address = '') {
//   return `您好！我是您的送货司机。\n订单编号：${orderId}\n我正在前往您的地址：${address}\n预计即将到达，请保持联系。谢谢！`;
// }


/**
 * Generic greeting template.
 */
export function greetingTemplate(customerName = '') {
  const name = customerName ? ` ${customerName}` : '';
  return `Hello${name}! I am a delivery driver from TBM. Is it convenient for you to receive your delivery now?`;
}
// export function greetingTemplate(customerName = '') {
//   const name = customerName ? `${customerName}` : '您';
//   return `您好${name === '您' ? '' : ' ' + name}！我是TBM的送货司机，请问您现在方便收货吗？`;
// }
