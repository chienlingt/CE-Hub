// server/routes/employees.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

// GET /api/employees - Get all employees
router.get('/', async (req, res) => {
  try {
    const employees = await prisma.employees.findMany({
      include: { role: true }
    });
    res.json(employees);
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
    res.json(employee);
  } catch (err) {
    console.error('GET /api/employees/:id error', err);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

// POST /api/employees - Create new employee
router.post('/', async (req, res) => {
  try {
    const { role, ...data } = req.body;
    console.log('Employee body:', req.body);
    // Convert role field to role_id for foreign key
    const createData = { ...data };
    if (role) {
      createData.role_id = role;
    }

    const employee = await prisma.employees.create({
      data: createData,
      include: { role: true }
    });
    res.status(201).json(employee);
  } catch (err) {
    console.error('POST /api/employees error', err);
    res.status(500).json({ error: 'Failed to create employee', details: err.message });
  }
});

// PUT /api/employees/:id - Update employee
router.put('/:id', async (req, res) => {
  try {
    const { role, ...data } = req.body;

    // Convert role field to role_id for foreign key
    const updateData = { ...data };
    if (role !== undefined) {
      updateData.role_id = role || null;
    }

    const employee = await prisma.employees.update({
      where: { id: req.params.id },
      data: updateData,
      include: { role: true }
    });
    res.json(employee);
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
  try {
    await prisma.employees.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'Employee deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/employees/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

module.exports = router;
