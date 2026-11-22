// server/services/crewService.js
//
// Loads teams as crews for B.1: loadTeams() (B.4) plus each member's employee
// role name and the truck's size. Rules live in crewSpec.js.

const prisma = require('../prismaClient');
const { loadTeams } = require('./fleetAvailabilityService');
const { boxCm3 } = require('./slotRecommendSpec');

async function loadCrews(db = prisma) {
  const teams = await loadTeams(db);
  const memberIds = [...new Set(teams.flatMap(t => t.members.map(m => m.id)))];
  const truckIds = [...new Set(teams.map(t => t.truck?.id).filter(Boolean))];
  const [employees, trucks] = await Promise.all([
    memberIds.length
      ? db.employees.findMany({ where: { id: { in: memberIds } }, select: { id: true, role: { select: { name: true } } } })
      : [],
    truckIds.length
      ? db.trucks.findMany({ where: { id: { in: truckIds } }, select: { id: true, tone: true, plate_no: true, length_cm: true, width_cm: true, height_cm: true } })
      : [],
  ]);
  const roleById = new Map(employees.map(e => [e.id, e.role?.name ?? null]));
  const truckById = new Map(trucks.map(t => [t.id, t]));
  return teams.map(t => {
    const truck = t.truck ? truckById.get(t.truck.id) : null;
    return {
      ...t,
      members: t.members.map(m => ({ ...m, role_name: roleById.get(m.id) ?? null })),
      truck: truck
        ? { id: truck.id, plate_no: truck.plate_no, tone: truck.tone, volume_cm3: boxCm3(truck.length_cm, truck.width_cm, truck.height_cm) }
        : null,
    };
  });
}

module.exports = { loadCrews };
