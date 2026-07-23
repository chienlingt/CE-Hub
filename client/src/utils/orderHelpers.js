// client/src/utils/orderHelpers.js
// Helper utilities for order management

/**
 * Check if an order is editable based on status and deadline
 * @param {Object} order - Order object
 * @param {number} editDeadlineHours - Hours before scheduled delivery that editing is allowed
 * @returns {Object} { editable: boolean, reason: string|null }
 */
export function isOrderEditable(order, editDeadlineHours = 24) {
  // Delivered orders cannot be edited
  if (order.order_status === 'Delivered') {
    return { editable: false, reason: 'Order has been delivered' };
  }

  // Check deadline if order is scheduled
  if (order.scheduled_start_date_time) {
    const deadline = calculateEditDeadline(order.scheduled_start_date_time, editDeadlineHours);
    const now = new Date();

    if (now > deadline) {
      return {
        editable: false,
        reason: `Edit deadline has passed (${formatDateTime(deadline)})`
      };
    }
  }

  // Order is editable
  return { editable: true, reason: null };
}

/**
 * Calculate the edit deadline for an order
 * @param {string|Date} scheduledDateTime - Scheduled delivery date/time
 * @param {number} editDeadlineHours - Hours before scheduled delivery
 * @returns {Date} Edit deadline date
 */
export function calculateEditDeadline(scheduledDateTime, editDeadlineHours = 24) {
  const scheduledTime = new Date(scheduledDateTime);
  return new Date(scheduledTime.getTime() - (editDeadlineHours * 60 * 60 * 1000));
}

/**
 * Calculate remaining time until edit deadline
 * @param {string|Date} scheduledDateTime - Scheduled delivery date/time
 * @param {number} editDeadlineHours - Hours before scheduled delivery
 * @returns {Object} { hours: number, minutes: number, expired: boolean }
 */
export function getRemainingEditTime(scheduledDateTime, editDeadlineHours = 24) {
  const deadline = calculateEditDeadline(scheduledDateTime, editDeadlineHours);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();

  if (diffMs <= 0) {
    return { hours: 0, minutes: 0, expired: true };
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  return { hours, minutes, expired: false };
}

/**
 * Get status badge color and label
 * @param {string} status - Order status
 * @returns {Object} { color: string, bgColor: string, label: string }
 */
export function getOrderStatusBadge(status) {
  const statusMap = {
    'Pending':    { color: 'text-yellow-800', bgColor: 'bg-yellow-100', label: 'Pending'    },
    'Scheduled':  { color: 'text-blue-800',   bgColor: 'bg-blue-100',   label: 'Scheduled'  },
    'Delivering': { color: 'text-orange-800', bgColor: 'bg-orange-100', label: 'Delivering' },
    'Delivered':  { color: 'text-green-800',  bgColor: 'bg-green-100',  label: 'Delivered'  },
    'Installing': { color: 'text-purple-800', bgColor: 'bg-purple-100', label: 'Installing' },
    'Issue':      { color: 'text-red-800',    bgColor: 'bg-red-100',    label: 'Issue'      },
    'Failed':     { color: 'text-red-800',    bgColor: 'bg-red-100',    label: 'Failed'     },
    'Cancelled':  { color: 'text-gray-700',   bgColor: 'bg-gray-100',   label: 'Cancelled'  },
  };

  return statusMap[status] || {
    color: 'text-gray-800',
    bgColor: 'bg-gray-100',
    label: status || 'Unknown',
  };
}

/**
 * Format order status for display
 * @param {string} status - Order status
 * @returns {string} Formatted status
 */
export function formatOrderStatus(status) {
  if (!status) return 'Unknown';
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

/**
 * Format date/time for display
 * @param {string|Date} dateTime - Date/time to format
 * @returns {string} Formatted date/time string
 */
export function formatDateTime(dateTime) {
  if (!dateTime) return '-';
  const date = new Date(dateTime);
  return date.toLocaleString('en-MY', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Format date only (no time)
 * @param {string|Date} dateTime - Date/time to format
 * @returns {string} Formatted date string
 */
export function formatDate(dateTime) {
  if (!dateTime) return '-';
  const date = new Date(dateTime);
  return date.toLocaleDateString('en-MY', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
}

/**
 * Get total product count for an order
 * @param {Array} orderProducts - Array of order_products
 * @returns {number} Total product count
 */
export function getTotalProductCount(orderProducts) {
  if (!orderProducts || !Array.isArray(orderProducts)) return 0;
  return orderProducts.reduce((sum, op) => sum + (op.quantity || 0), 0);
}

/**
 * Get service type label
 * @param {string} serviceType - Service type code
 * @returns {string} Service type label
 */
export function getServiceTypeLabel(serviceType) {
  const typeMap = {
    'delivery': 'Delivery Only',
    'delivery_installation': 'Delivery + Installation',
    'stock_transfer': 'Stock Transfer'
  };
  return typeMap[serviceType] || serviceType;
}

/**
 * Filter orders by date range
 * @param {Array} orders - Array of orders
 * @param {string} range - Date range ('today', 'week', 'month', 'custom')
 * @param {Date} customStart - Custom start date (for 'custom' range)
 * @param {Date} customEnd - Custom end date (for 'custom' range)
 * @returns {Array} Filtered orders
 */
export function filterOrdersByDateRange(orders, range, customStart = null, customEnd = null) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let startDate, endDate;

  switch (range) {
    case 'today':
      startDate = today;
      endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      break;

    case 'week':
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
      startDate = weekStart;
      endDate = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;

    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      break;

    case 'custom':
      if (!customStart || !customEnd) return orders;
      startDate = new Date(customStart);
      endDate = new Date(customEnd);
      endDate.setHours(23, 59, 59, 999);
      break;

    default:
      return orders;
  }

  return orders.filter(order => {
    const createdAt = new Date(order.created_at);
    return createdAt >= startDate && createdAt <= endDate;
  });
}

/**
 * Search orders by keyword
 * @param {Array} orders - Array of orders
 * @param {string} keyword - Search keyword
 * @returns {Array} Filtered orders
 */
export function searchOrders(orders, keyword) {
  if (!keyword || keyword.trim() === '') return orders;

  const searchTerm = keyword.toLowerCase().trim();

  return orders.filter(order => {
    // Search in order ID
    if (order.id && order.id.toLowerCase().includes(searchTerm)) return true;

    // Search in customer name
    if (order.customers?.full_name && order.customers.full_name.toLowerCase().includes(searchTerm)) return true;

    // Search in customer phone
    if (order.customers?.phone && order.customers.phone.includes(searchTerm)) return true;

    // Search in building name
    if (order.buildings?.building_name && order.buildings.building_name.toLowerCase().includes(searchTerm)) return true;

    return false;
  });
}
