// Shared badge components for the Exceptions views. Each view passes its own
// styles map so the reason vocabularies stay independent (failed-delivery
// reasons vs escalation reasons from utils/escalationReasons.js).
import React from 'react';

export const FAILED_DELIVERY_REASON_STYLES = {
  'Customer Unreachable': 'bg-orange-100 text-orange-800',
  'Access Blocked':       'bg-red-100 text-red-800',
  'Customer Rejected':    'bg-purple-100 text-purple-800',
  'Incorrect Address':    'bg-yellow-100 text-yellow-800',
};

export function ReasonBadge({ reason, styles = {} }) {
  const style = styles[reason] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {reason || 'Unknown'}
    </span>
  );
}
