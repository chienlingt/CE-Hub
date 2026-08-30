// server/routes/teams.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

const TEAM_INCLUDE = {
  assignments: { include: { employee: true } },
  primary_driver: true,
  assistant_driver: true,
  truck: true,
};

function isDeliveryTeamType(teamType) {
  return (teamType || '').toLowerCase().includes('delivery');
}

// Shared validation for the Primary Driver / Assistant Driver pair on Delivery teams.
// Enforces: the two ids differ, both reference active employees, and neither is already
// paired (as primary or assistant) on another active Delivery team.
// Throws an Error with a `.status` (400/409) that route handlers turn into an HTTP response.
async function validateDeliveryPair(tx, { primary_driver_id, assistant_driver_id, excludeTeamId }) {
  if (primary_driver_id && assistant_driver_id && primary_driver_id === assistant_driver_id) {
    const err = new Error('Primary Driver and Assistant Driver must be different employees.');
    err.status = 400;
    throw err;
  }

  const idsToCheck = [primary_driver_id, assistant_driver_id].filter(Boolean);
  if (idsToCheck.length > 0) {
    const activeEmployees = await tx.employees.findMany({
      where: { id: { in: idsToCheck }, active_flag: true },
      select: { id: true },
    });
    if (activeEmployees.length !== idsToCheck.length) {
      const err = new Error('Primary Driver and Assistant Driver must be active employees.');
      err.status = 400;
      throw err;
    }
  }

  if (idsToCheck.length > 0) {
    const conflictingTeam = await tx.teams.findFirst({
      where: {
        available_flag: true,
        ...(excludeTeamId ? { id: { not: excludeTeamId } } : {}),
        OR: [
          { primary_driver_id: { in: idsToCheck } },
          { assistant_driver_id: { in: idsToCheck } },
        ],
      },
      select: { id: true, team_type: true, primary_driver_id: true, assistant_driver_id: true },
    });
    if (conflictingTeam && isDeliveryTeamType(conflictingTeam.team_type)) {
      const err = new Error('One of the selected employees is already assigned to another active Delivery team.');
      err.status = 409;
      throw err;
    }
  }
}

// Mirrors the given Delivery pair into employee_team_assignments so existing consumers
// that read team.assignments (e.g. the Delivery Schedule contacts aggregate, deletability
// checks) keep working unmodified. Intentional two-sources-of-truth tradeoff: primary_driver_id/
// assistant_driver_id are canonical, employee_team_assignments is a kept-in-sync mirror.
async function syncDeliveryPairAssignments(tx, teamId, { primary_driver_id, assistant_driver_id }) {
  await tx.employee_team_assignments.deleteMany({ where: { team_id: teamId } });
  const pairIds = [primary_driver_id, assistant_driver_id].filter(Boolean);
  if (pairIds.length > 0) {
    await tx.employee_team_assignments.deleteMany({ where: { employee_id: { in: pairIds } } });
    await tx.employee_team_assignments.createMany({
      data: pairIds.map((eid) => ({ employee_id: eid, team_id: teamId })),
    });
  }
}

router.get('/', async (req, res) => {
  try {
    const { sortBy, sortOrder } = req.query;
    let orderBy = { created_at: 'desc' }; // default sort
    if (sortBy && sortOrder) {
      orderBy = { [sortBy]: sortOrder };
    }

    const teams = await prisma.teams.findMany({
      include: TEAM_INCLUDE,
      orderBy: orderBy
    });
    res.json(teams);
  } catch (err) {
    console.error('GET /api/teams error', err);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { team_type, employeeIds, primary_driver_id, assistant_driver_id, truck_id } = req.body;
    const isDeliveryTeam = isDeliveryTeamType(team_type);

    const team = await prisma.$transaction(async (tx) => {
      if (isDeliveryTeam) {
        await validateDeliveryPair(tx, { primary_driver_id, assistant_driver_id });

        const created = await tx.teams.create({
          data: {
            team_type,
            primary_driver_id: primary_driver_id || null,
            assistant_driver_id: assistant_driver_id || null,
            truck_id: truck_id || null,
          },
        });
        await syncDeliveryPairAssignments(tx, created.id, { primary_driver_id, assistant_driver_id });
        return tx.teams.findUnique({ where: { id: created.id }, include: TEAM_INCLUDE });
      }

      if (employeeIds?.length > 0) {
        await tx.employee_team_assignments.deleteMany({
          where: { employee_id: { in: employeeIds } },
        });
      }

      return tx.teams.create({
        data: {
          team_type,
          ...(employeeIds?.length > 0
            ? {
                assignments: {
                  create: employeeIds.map((eid) => ({ employee_id: eid })),
                },
              }
            : {}),
        },
        include: TEAM_INCLUDE,
      });
    });

    res.status(201).json(team);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('POST /api/teams error', err);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

router.put('/:id', async (req, res) => {
  const teamId = req.params.id;
  const { team_type, available_flag, employeeIds, primary_driver_id, assistant_driver_id, truck_id } = req.body;

  // Manual deactivation is a simple case
  if (available_flag === false) {
      try {
          await prisma.$transaction([
              prisma.employee_team_assignments.deleteMany({ where: { team_id: teamId } }),
              prisma.teams.update({
                where: { id: teamId },
                data: { available_flag: false, primary_driver_id: null, assistant_driver_id: null },
              }),
          ]);
          return res.json({ message: 'Team has been manually deactivated.' });
      } catch (err) {
          console.error('PUT /api/teams/:id manual deactivation error', err);
          return res.status(500).json({ error: 'Failed to deactivate team' });
      }
  }

  try {
    const team = await prisma.teams.findUnique({
      where: { id: teamId },
      include: {
        assignments: true,
        installation_schedules: true,
        delivery_timeslots: true,
        warehouse_timeslots: true,
      },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const isDeliveryTeam = isDeliveryTeamType(team_type || team.team_type);

    const hasHistory =
      team.assignments.length > 0 ||
      team.installation_schedules.length > 0 ||
      team.delivery_timeslots.length > 0 ||
      team.warehouse_timeslots.length > 0;

    // Case 1: No history, just update in place
    if (!hasHistory) {
      const updatedTeam = await prisma.$transaction(async (tx) => {
        if (isDeliveryTeam) {
          await validateDeliveryPair(tx, { primary_driver_id, assistant_driver_id, excludeTeamId: teamId });
          const updated = await tx.teams.update({
            where: { id: teamId },
            data: {
              team_type,
              primary_driver_id: primary_driver_id || null,
              assistant_driver_id: assistant_driver_id || null,
              truck_id: truck_id || null,
            },
          });
          await syncDeliveryPairAssignments(tx, teamId, { primary_driver_id, assistant_driver_id });
          return updated;
        }

        if (employeeIds) {
          await tx.employee_team_assignments.deleteMany({ where: { employee_id: { in: employeeIds } } });
          await tx.employee_team_assignments.deleteMany({ where: { team_id: teamId } });
          if (employeeIds.length > 0) {
            await tx.employee_team_assignments.createMany({
              data: employeeIds.map((eid) => ({ employee_id: eid, team_id: teamId })),
            });
          }
        }
        const updated = await tx.teams.update({
          where: { id: teamId },
          data: { team_type },
        });
        return updated;
      });
      return res.json({ updatedTeam, message: 'Team updated successfully.' });
    }

    // Case 2: Has history, so "retire and create new"
    const result = await prisma.$transaction(async (tx) => {
      if (isDeliveryTeam) {
        await validateDeliveryPair(tx, { primary_driver_id, assistant_driver_id, excludeTeamId: teamId });
      }

      // 1. Retire old team
      await tx.teams.update({
        where: { id: teamId },
        data: { available_flag: false },
      });

      // 2. Create new team
      const newTeam = isDeliveryTeam
        ? await tx.teams.create({
            data: {
              team_type: team_type || team.team_type,
              primary_driver_id: primary_driver_id || null,
              assistant_driver_id: assistant_driver_id || null,
              truck_id: truck_id || null,
            },
          })
        : await tx.teams.create({
            data: {
              team_type: team_type || team.team_type,
              assignments: {
                create: employeeIds ? employeeIds.map((eid) => ({ employee_id: eid })) : [],
              },
            },
          });

      if (isDeliveryTeam) {
        await syncDeliveryPairAssignments(tx, newTeam.id, { primary_driver_id, assistant_driver_id });
      }

      const todayISO = new Date().toISOString().split('T')[0];

      // 3. Reassign pending schedules
      await tx.installation_schedules.updateMany({
        where: { installation_team_id: teamId, status: 'Scheduled' },
        data: { installation_team_id: newTeam.id },
      });
      await tx.time_slots.updateMany({
        where: { delivery_team_id: teamId, date: { gte: todayISO } },
        data: { delivery_team_id: newTeam.id },
      });
      await tx.time_slots.updateMany({
        where: { warehouse_team_id: teamId, date: { gte: todayISO } },
        data: { warehouse_team_id: newTeam.id },
      });
      
      return newTeam;
    });

    res.json({
      result,
      message: 'Team has been updated. A new version was created to preserve history and pending schedules were moved.',
    });

  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('PUT /api/teams/:id error', err);
    res.status(500).json({ error: 'Failed to update team' });
  }
});

router.get('/:id/deletability', async (req, res) => {
  const teamId = req.params.id;
  try {
    const team = await prisma.teams.findUnique({
      where: { id: teamId },
      include: {
        assignments: { select: { id: true } }, // Also check for members
        installation_schedules: { select: { status: true } },
        delivery_timeslots: { select: { date: true } },
        warehouse_timeslots: { select: { date: true } },
      },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const hasAssignments = team.assignments.length > 0;
    const hasSchedules =
      team.installation_schedules.length > 0 ||
      team.delivery_timeslots.length > 0 ||
      team.warehouse_timeslots.length > 0;

    if (!hasSchedules && !hasAssignments) {
      return res.json({
        status: 'HARD_DELETE',
        message: 'This team has no schedules or members and will be permanently deleted.',
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString().split('T')[0];

    const hasFutureSchedules =
      team.installation_schedules.some((s) => s.status === 'Scheduled') ||
      team.delivery_timeslots.some((s) => s.date >= todayISO) ||
      team.warehouse_timeslots.some((s) => s.date >= todayISO);

    if (hasFutureSchedules) {
      return res.json({
        status: 'BLOCKED',
        message: 'This team has pending schedules. Please reassign them before deleting.',
      });
    }

    if (hasAssignments && !hasSchedules) {
         return res.json({
            status: 'SOFT_DELETE',
            message: 'This team has members but no schedules. Deactivating will unassign its members.',
        });
    }

    return res.json({
      status: 'SOFT_DELETE',
      message: 'This team has past schedules. Deactivating will make it inactive and unassign its members.',
    });
  } catch (err) {
    console.error(`GET /api/teams/${teamId}/deletability error`, err);
    res.status(500).json({ error: 'Failed to check team deletability' });
  }
});

router.delete('/:id', async (req, res) => {
  const teamId = req.params.id;
  try {
    const team = await prisma.teams.findUnique({
      where: { id: teamId },
      include: {
        assignments: { select: { id: true } },
        installation_schedules: { select: { status: true } },
        delivery_timeslots: { select: { date: true } },
        warehouse_timeslots: { select: { date: true } },
      },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const hasAssignments = team.assignments.length > 0;
    const hasSchedules =
      team.installation_schedules.length > 0 ||
      team.delivery_timeslots.length > 0 ||
      team.warehouse_timeslots.length > 0;

    // Case 1: No schedules and no members -> Hard delete
    if (!hasSchedules && !hasAssignments) {
      await prisma.teams.delete({ where: { id: teamId } });
      return res.json({ message: 'Team permanently deleted.' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString().split('T')[0];

    const hasFutureSchedules =
      team.installation_schedules.some((s) => s.status === 'Scheduled') ||
      team.delivery_timeslots.some((s) => s.date >= todayISO) ||
      team.warehouse_timeslots.some((s) => s.date >= todayISO);

    // Case 2: Has future schedules -> Block
    if (hasFutureSchedules) {
      return res.status(400).json({
        error: 'This team has pending schedules. Please reassign them before deleting.',
      });
    }

    // Case 3: Has only past schedules OR only members -> Soft delete
    await prisma.teams.update({
      where: { id: teamId },
      data: { available_flag: false, primary_driver_id: null, assistant_driver_id: null },
    });

    // Also remove team members from the now-inactive team
    if (hasAssignments) {
      await prisma.employee_team_assignments.deleteMany({
        where: { team_id: teamId },
      });
    }
    
    res.json({ message: 'Team has been made inactive.' });

  } catch (err) {
    console.error('DELETE /api/teams/:id error', err);
    if (err.code === 'P2003' || err.code === 'P2014') {
        return res.status(400).json({ error: "Cannot delete this team. It is still referenced by other parts of the system."})
    }
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

module.exports = router;
