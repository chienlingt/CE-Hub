// client/src/utils/phoneHelpers.js
// Utilities for calling and chatting with customers from the driver dashboard.

/**
 * Open a phone call to the given number.
 */
export function callCustomer(phone) {
  if (!phone) return;
  const cleaned = phone.replace(/\s+/g, '');
  window.location.href = `tel:${cleaned}`;
}

/**
 * Open a WhatsApp chat with a pre-filled message.
 * @param {string} phone   - customer phone (with or without country code)
 * @param {string} message - URL-encoded message body (use buildWhatsAppUrl for convenience)
 */
export function openWhatsApp(phone, message = '') {
  if (!phone) return;
  // Strip leading 0 and spaces; assume Malaysian numbers (60 prefix)
  const digits  = phone.replace(/\D/g, '');
  const withCode = digits.startsWith('60') ? digits : `60${digits.replace(/^0/, '')}`;
  const encoded  = encodeURIComponent(message);
  window.open(`https://wa.me/${withCode}?text=${encoded}`, '_blank');
}
