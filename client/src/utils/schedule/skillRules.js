// B.1 responsibility: "Check installation, crew, and skill requirements".
//
// The proposal (§5 Step 3) requires an installer-capable crew for orders needing
// installation. The database has no skills table: capability is inferred from
// products.installer_team_required_flag on the order side, and from team member
// role names on the crew side — which is how server/services/scheduler.js:499
// already does it ("role name contains 'install'").

import { orderServiceMinutes } from './serviceDuration';

const normalize = (s) => String(s ?? '').toLowerCase();

/** Does this order need a trained installer, not just a driver and assistant? */
export function requiresInstaller(order, productsById = {}) {
  return orderServiceMinutes(order, productsById).requiresInstaller;
}

/** Role-name keyword match, mirroring the server's inference. */
export function employeeIsInstaller(employee) {
  return normalize(employee?.roleName).includes('install');
}

export function employeeIsDriver(employee) {
  const role = normalize(employee?.roleName);
  return role.includes('driver') || role.includes('delivery');
}

/** Members of a team, resolved through the team's memberIds. */
export function teamMembers(team, employeesById = {}) {
  const ids = Array.isArray(team?.memberIds) ? team.memberIds : [];
  return ids.map(id => employeesById[id]).filter(Boolean);
}

export function teamHasInstaller(team, employeesById = {}) {
  return teamMembers(team, employeesById).some(employeeIsInstaller);
}

export function teamHasDriver(team, employeesById = {}) {
  return teamMembers(team, employeesById).some(employeeIsDriver);
}

/**
 * Can this crew serve this order?
 * @returns {{ok: boolean, reason: 'NO_INSTALLER'|null}}
 */
export function teamCanServe(team, order, { productsById = {}, employeesById = {} } = {}) {
  if (!team) return { ok: true, reason: null };   // unassigned crew is a separate issue
  if (!requiresInstaller(order, productsById)) return { ok: true, reason: null };
  return teamHasInstaller(team, employeesById)
    ? { ok: true, reason: null }
    : { ok: false, reason: 'NO_INSTALLER' };
}

/** Summary for the crew line on a slot header. */
export function teamCapabilitySummary(team, employeesById = {}) {
  const members = teamMembers(team, employeesById);
  return {
    memberCount: members.length,
    hasInstaller: members.some(employeeIsInstaller),
    hasDriver: members.some(employeeIsDriver),
    names: members.map(m => m?.name).filter(Boolean),
  };
}
