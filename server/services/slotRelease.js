// server/services/slotRelease.js

/**
 * Take the team and truck off a slot with no scheduled orders left.
 *
 * A partial unique index allows one truckless row per (date, time_window_start).
 * If this window already has one, the slot cannot become truckless too: delete it
 * when nothing references it, otherwise keep its truck so its history stays intact.
 */
async function releaseSlotAssignment(prisma, slotId) {
  try {
    await prisma.time_slots.update({
      where: { id: slotId },
      data: { delivery_team_id: null, truck_id: null }
    });
  } catch (err) {
    if (err.code !== 'P2002') throw err;
    await prisma.time_slots.deleteMany({
      where: { id: slotId, orders: { none: {} }, lorry_trip: { is: null } }
    });
  }
}

module.exports = { releaseSlotAssignment };
