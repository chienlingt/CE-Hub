// client/src/utils/escalationReasons.js
// 10 pre-departure / in-transit operational reasons for driver Report escalation.
// Used in ContactReportModal + displayed as badges in DeliveryIssues.

export const ESCALATION_REASONS = [
  'Customer Absent',
  'Installer Absent',
  'Wrong Address',
  'Access Denied',
  'Customer Refused Delivery',
  'Damaged Item',
  'Incorrect Item',
  'Traffic Delay',
  'Vehicle Breakdown',
  'Other',
];

export const ESCALATION_REASON_STYLES = {
  'Customer Absent':           'bg-orange-100 text-orange-800',
  'Installer Absent':          'bg-orange-100 text-orange-700',
  'Wrong Address':             'bg-yellow-100 text-yellow-800',
  'Access Denied':             'bg-red-100 text-red-800',
  'Customer Refused Delivery': 'bg-purple-100 text-purple-800',
  'Damaged Item':              'bg-red-100 text-red-700',
  'Incorrect Item':            'bg-amber-100 text-amber-800',
  'Traffic Delay':             'bg-blue-100 text-blue-800',
  'Vehicle Breakdown':         'bg-gray-100 text-gray-800',
  'Other':                     'bg-gray-100 text-gray-700',
};
