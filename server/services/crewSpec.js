// server/services/crewSpec.js
//
// Which delivery crews can work a date + session, and whether they carry an
// installer. Pure: shared by the planning run (planningSpec.js) and the slot
// recommender (slotRecommendSpec.js).
//
// Decided 2026-11-21 (proposal §9): installers ride on the delivery trip. An
// installation DO needs a delivery team with an installer member; the separate
// Installer Team is not used for planning. A member is an installer when their
// employee role name contains "install" (same rule as the client's skillRules.js).
// Each delivery team keeps its own truck (teams.truck_id).

const { truckBlock, teamBlock, staffBlock } = require('./fleetAvailabilitySpec');

const isInstallerRole = (roleName) => String(roleName ?? '').toLowerCase().includes('install');

/**
 * Crew status for one session.
 * @param {object} team  crewService.loadCrews() shape: { id, kind, available_flag, truck, members: [{ id, role_name }] }
 * @returns {{ usable: boolean, has_installer: boolean, reason: string|null }}
 *   reason: TEAM_INACTIVE | NO_TRUCK | TEAM_BLOCKED | TRUCK_BLOCKED
 */
function crewStatus(team, dateKey, session, blockoffs = []) {
  if (team.available_flag === false) return { usable: false, has_installer: false, reason: 'TEAM_INACTIVE' };
  if (!team.truck) return { usable: false, has_installer: false, reason: 'NO_TRUCK' };
  if (teamBlock(team, dateKey, session, blockoffs)) return { usable: false, has_installer: false, reason: 'TEAM_BLOCKED' };
  if (truckBlock(team.truck, dateKey, session, blockoffs)) return { usable: false, has_installer: false, reason: 'TRUCK_BLOCKED' };
  const hasInstaller = (team.members ?? []).some(m => isInstallerRole(m.role_name)
    && !staffBlock(m.id, dateKey, session, blockoffs));
  return { usable: true, has_installer: hasInstaller, reason: null };
}

/** Delivery teams usable in this session, each with has_installer. */
function crewsForSession(teams, dateKey, session, blockoffs = []) {
  return teams
    .filter(t => t.kind !== 'installer')
    .map(t => ({ team: t, ...crewStatus(t, dateKey, session, blockoffs) }))
    .filter(c => c.usable)
    .map(({ team, has_installer }) => ({ ...team, has_installer }));
}

module.exports = { isInstallerRole, crewStatus, crewsForSession };
