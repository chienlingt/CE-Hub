// server/services/rolePermissions.js
//
// What an admin may save on a role's permission list.
//
// Every role, Admin included, follows its saved permissions. Two rules protect
// the Admin role so an admin can never lock themselves out or end up with a tab
// that makes no sense for them:
//   - "access" (the Access Control tab) is always kept on.
//   - "my_performance" is never kept: it is the personal page of crew members.

const ALWAYS_ON_FOR_ADMIN = 'access';
const NEVER_FOR_ADMIN = ['my_performance'];

const isAdminRole = role => role?.name?.trim().toLowerCase() === 'admin';

/** The permission list to store for `role`, given the list the caller asked for. */
function permissionsToStore(role, requested) {
  const unique = [...new Set(requested)];
  if (!isAdminRole(role)) return unique;
  const allowed = unique.filter(key => !NEVER_FOR_ADMIN.includes(key));
  return allowed.includes(ALWAYS_ON_FOR_ADMIN) ? allowed : [...allowed, ALWAYS_ON_FOR_ADMIN];
}

module.exports = { isAdminRole, permissionsToStore, ALWAYS_ON_FOR_ADMIN, NEVER_FOR_ADMIN };
