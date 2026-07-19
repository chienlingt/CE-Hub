// server/routes/employees.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const prisma = require('../prismaClient');

// GET /api/employees - Get all employees
router.get('/', async (req, res) => {
  try {
    const { sortBy, sortOrder } = req.query;
    let orderBy = { created_at: 'desc' }; // default sort
    if (sortBy && sortOrder) {
      orderBy = { [sortBy]: sortOrder };
    }

    const employees = await prisma.employees.findMany({
      include: { role: true },
      orderBy: orderBy
    });

    // Remove password from response for security
    const sanitizedEmployees = employees.map(emp => {
      const { password, ...employeeWithoutPassword } = emp;
      return employeeWithoutPassword;
    });

    res.json(sanitizedEmployees);
  } catch (err) {
    console.error('GET /api/employees error', err);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// GET /api/employees/:id - Get employee by ID
router.get('/:id', async (req, res) => {
  try {
    const employee = await prisma.employees.findUnique({
      where: { id: req.params.id },
      include: { role: true }
    });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Remove password from response for security
    const { password, ...employeeWithoutPassword } = employee;
    res.json(employeeWithoutPassword);
  } catch (err) {
    console.error('GET /api/employees/:id error', err);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

// POST /api/employees - Create new employee
router.post('/', async (req, res) => {
  try {
    const { role, password, ...data } = req.body;
    console.log('Employee body:', req.body);

    // Convert role field to role_id for foreign key
    const createData = { ...data };
    if (role) {
      createData.role_id = role;
    }

    // Hash password before saving
    if (password) {
      const salt = await bcrypt.genSalt(10);
      createData.password = await bcrypt.hash(password, salt);
    }

    const employee = await prisma.employees.create({
      data: createData,
      include: { role: true }
    });

    // Remove password from response for security
    const { password: _, ...employeeWithoutPassword } = employee;
    res.status(201).json(employeeWithoutPassword);
  } catch (err) {
    console.error('POST /api/employees error', err);
    res.status(500).json({ error: 'Failed to create employee', details: err.message });
  }
});

// PUT /api/employees/:id - Update employee
router.put('/:id', async (req, res) => {
  try {
    const { role, password, ...data } = req.body;

    // Convert role field to role_id for foreign key
    const updateData = { ...data };
    if (role !== undefined) {
      updateData.role_id = role || null;
    }

    // Hash password if provided
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    const employee = await prisma.employees.update({
      where: { id: req.params.id },
      data: updateData,
      include: { role: true }
    });

    // Remove password from response for security
    const { password: _, ...employeeWithoutPassword } = employee;
    res.json(employeeWithoutPassword);
  } catch (err) {
    console.error('PUT /api/employees/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.status(500).json({ error: 'Failed to update employee', details: err.message });
  }
});

// DELETE /api/employees/:id - Delete employee
router.delete('/:id', async (req, res) => {
  const employeeId = req.params.id;

  try {
    // Step 1: Re-verify deletability before proceeding
    const pendingOrderCount = await prisma.orders.count({
      where: { employee_id: employeeId, order_status: { notIn: ['Delivered', 'Cancelled'] } },
    });
    if (pendingOrderCount > 0) {
      return res.status(400).json({ error: `This employee is assigned to ${pendingOrderCount} pending order(s). Please reassign them.` });
    }

    const truckAssignmentCount = await prisma.trucks.count({
      where: { OR: [{ driver_id: employeeId }, { assistant_id: employeeId }] },
    });
    if (truckAssignmentCount > 0) {
      return res.status(400).json({ error: `This employee is assigned to ${truckAssignmentCount} truck(s). Please reassign them.` });
    }

    // Step 2: Perform soft delete and cleanup within a transaction
    await prisma.$transaction([
      // Deactivate employee
      prisma.employees.update({
        where: { id: employeeId },
        data: { active_flag: false },
      }),
      // Remove team assignments
      prisma.employee_team_assignments.deleteMany({
        where: { employee_id: employeeId },
      }),
      // Unassign from trucks (driver)
      prisma.trucks.updateMany({
        where: { driver_id: employeeId },
        data: { driver_id: null },
      }),
      // Unassign from trucks (assistant)
      prisma.trucks.updateMany({
        where: { assistant_id: employeeId },
        data: { assistant_id: null },
      }),
    ]);

    res.json({ message: 'Employee has been deactivated and unassigned from all roles.' });

  } catch (err) {
    console.error('DELETE /api/employees/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.status(500).json({ error: 'Failed to deactivate employee' });
  }
});

router.get('/:id/deletability', async (req, res) => {
  const employeeId = req.params.id;
  try {
    // Check for pending orders
    const pendingOrderCount = await prisma.orders.count({
      where: {
        employee_id: employeeId,
        order_status: {
          notIn: ['Delivered', 'Cancelled'],
        },
      },
    });

    if (pendingOrderCount > 0) {
      return res.json({
        status: 'BLOCKED',
        message: `This employee is assigned to ${pendingOrderCount} pending order(s). Please reassign them before deactivation.`,
      });
    }

    // Check for truck assignments
    const truckAssignmentCount = await prisma.trucks.count({
      where: {
        OR: [
          { driver_id: employeeId },
          { assistant_id: employeeId },
        ],
      },
    });

    if (truckAssignmentCount > 0) {
      return res.json({
        status: 'BLOCKED',
        message: `This employee is assigned to ${truckAssignmentCount} truck(s). Please reassign them before deactivation.`,
      });
    }
    
    return res.json({
      status: 'CAN_DEACTIVATE',
      message: 'This employee has no pending work and can be safely deactivated.',
    });

  } catch (err) {
    console.error(`GET /api/employees/${employeeId}/deletability error`, err);
    res.status(500).json({ error: 'Failed to check employee deletability' });
  }
});

module.exports = router;
