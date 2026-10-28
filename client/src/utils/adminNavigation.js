// Shared display order and titles; permission keys and URLs stay unchanged.
export const ADMIN_NAVIGATION = [
  { key: 'dashboard', title: 'Dashboard' },
  { key: 'order', title: 'Orders' },
  { key: 'schedule', title: 'Schedule' },
  { key: 'driver', title: 'Deliveries' },
  { key: 'scanning', title: 'Scan Station' },
  { key: 'cases', title: 'Exceptions' },
  { key: 'info', title: 'Information' },
  { key: 'access', title: 'Access Control' },
];

export function orderAdminNavigation(navigation) {
  return ADMIN_NAVIGATION.filter(item => navigation[item.key])
    .map(item => [item.key, { ...navigation[item.key], title: item.title }]);
}
