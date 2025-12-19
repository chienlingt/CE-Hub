const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

// GET all installers
router.get('/', async (req, res) => {
    try {
        const installers = await prisma.installers.findMany({
            include: {
                employees: true
            }
        });
        res.json(installers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch installers' });
    }
});

// GET installer by employee ID
router.get('/employee/:employeeId', async (req, res) => {
    const { employeeId } = req.params;
    try {
        const installer = await prisma.installers.findUnique({
            where: { employee_id: employeeId },
            include: {
                employees: true
            }
        });
        if (installer) {
            res.json(installer);
        } else {
            res.status(404).json({ error: 'Installer not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch installer' });
    }
});

// CREATE a new installer
router.post('/', async (req, res) => {
    try {
        const newInstaller = await prisma.installers.create({
            data: req.body,
        });
        res.status(201).json(newInstaller);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create installer' });
    }
});

// UPDATE an installer
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const updatedInstaller = await prisma.installers.update({
            where: { id },
            data: req.body,
        });
        res.json(updatedInstaller);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update installer' });
    }
});

module.exports = router;
