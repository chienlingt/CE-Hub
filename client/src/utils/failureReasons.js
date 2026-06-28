// client/src/utils/failureReasons.js
// FR-05-001 — five fixed failure reason enum values and display config.
// Keep in sync with server/services/deliveryFailureService.js FAILURE_REASONS.

export const FAILURE_REASONS = [
  'Customer Unreachable',
  'Access Blocked',
  'Customer Rejected',
  'Incorrect Address',
  'Other',
];

export const FAILURE_REASON_STYLES = {
  'Customer Unreachable': 'bg-orange-100 text-orange-800 border-orange-200',
  'Access Blocked':       'bg-red-100 text-red-800 border-red-200',
  'Customer Rejected':    'bg-purple-100 text-purple-800 border-purple-200',
  'Incorrect Address':    'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Other':                'bg-gray-100 text-gray-700 border-gray-200',
};
