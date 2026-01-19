// server/routes/complaints.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

// GET all complaints
router.get('/', async (req, res) => {
  try {
    const complaints = await prisma.complaint.findMany({
      include: {
        customers: {
          select: {
            full_name: true,
            email: true,
          },
        },
        orders: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        date_reported: 'desc',
      },
    });
    res.json(complaints);
  } catch (err) {
    console.error('GET /api/complaints error', err);
    res.status(500).json({ error: 'Failed to fetch complaints', details: err.message });
  }
});

// GET a specific complaint by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const complaint = await prisma.complaint.findUnique({
      where: { complaint_id: id },
      include: {
        customers: {
          select: {
            full_name: true,
            email: true,
          },
        },
        orders: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    res.json(complaint);
  } catch (err) {
    console.error(`GET /api/complaints/${req.params.id} error`, err);
    res.status(500).json({ error: 'Failed to fetch complaint', details: err.message });
  }
});

// PUT update complaint status
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Complaint status is required' });
    }

    const updatedComplaint = await prisma.complaint.update({
      where: { complaint_id: id },
      data: {
        status: status,
      },
      include: {
        customers: {
          select: {
            full_name: true,
          },
        },
      },
    });

    res.json(updatedComplaint);
  } catch (err) {
    console.error(`PUT /api/complaints/${req.params.id}/status error`, err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    res.status(500).json({ error: 'Failed to update complaint status', details: err.message });
  }
});

module.exports = router;