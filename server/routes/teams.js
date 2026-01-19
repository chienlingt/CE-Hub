// server/routes/teams.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

router.get('/', async (req, res) => {
  try {
    const { sortBy, sortOrder } = req.query;
    let orderBy = { created_at: 'desc' }; // default sort
    if (sortBy && sortOrder) {
      orderBy = { [sortBy]: sortOrder };
    }

    const teams = await prisma.teams.findMany({
      include: { assignments: { include: { employee: true } } },
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
    const team = await prisma.teams.create({ data: req.body });
    res.status(201).json(team);
  } catch (err) {
    console.error('POST /api/teams error', err);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

router.put('/:id', async (req, res) => {
  const teamId = req.params.id;
  const { team_type, available_flag, employeeIds } = req.body;

  // Manual deactivation is a simple case
  if (available_flag === false) {
      try {
          await prisma.$transaction([
              prisma.employee_team_assignments.deleteMany({ where: { team_id: teamId } }),
              prisma.teams.update({ where: { id: teamId }, data: { available_flag: false } }),
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

    const hasHistory =
      team.assignments.length > 0 ||
      team.installation_schedules.length > 0 ||
      team.delivery_timeslots.length > 0 ||
      team.warehouse_timeslots.length > 0;

    // Case 1: No history, just update in place
    if (!hasHistory) {
      const updatedTeam = await prisma.$transaction(async (tx) => {
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
      // 1. Retire old team
      await tx.teams.update({
        where: { id: teamId },
        data: { available_flag: false },
      });

      // 2. Create new team
      const newTeam = await tx.teams.create({
        data: {
          team_type: team_type || team.team_type,
          assignments: {
            create: employeeIds ? employeeIds.map((eid) => ({ employee_id: eid })) : [],
          },
        },
      });

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
      data: { available_flag: false },
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
