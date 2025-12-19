const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

// GET all outlets
router.get('/', async (req, res) => {
    try {
        const outlets = await prisma.outlets.findMany();
        res.json(outlets);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch outlets' });
    }
});

module.exports = router;
