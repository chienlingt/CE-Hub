export const FIELD_KEYS = ['driver', 'delivery', 'installation', 'warehouse', 'scanning'];

export const OFFICE_KEYS = ['dashboard', 'access', 'info', 'cases', 'schedule', 'settings'];

function normalizePermissions(permissions) {
  if (!Array.isArray(permissions)) return [];
  return permissions.map((p) => (p || '').toString().toLowerCase().trim());
}

/** True when user has field keys only — office or admin permissions block bottom nav. */
export function isFieldMobileUser(permissions) {
  const normalized = normalizePermissions(permissions);
  if (normalized.includes('admin')) return false;
  if (normalized.some((p) => OFFICE_KEYS.includes(p))) return false;
  return normalized.some((p) => FIELD_KEYS.includes(p));
}

/** Split nav entries into bottom-bar primary slots and overflow drawer items. */
export function partitionNavItems(filteredNavigation, maxPrimary = 5) {
  if (!filteredNavigation?.length) {
    return { primary: [], overflow: [] };
  }
  if (filteredNavigation.length <= maxPrimary) {
    return { primary: filteredNavigation, overflow: [] };
  }
  return {
    primary: filteredNavigation.slice(0, maxPrimary),
    overflow: filteredNavigation.slice(maxPrimary),
  };
}

/** Short label for bottom nav — first word or truncated title. */
export function shortNavLabel(title, maxLen = 10) {
  if (!title) return '';
  const first = title.split(/\s+/)[0];
  if (first.length <= maxLen) return first;
  return `${title.slice(0, maxLen - 1)}…`;
}
