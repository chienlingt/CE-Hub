// server/routes/order-issues.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

// GET all orders with issues
router.get('/', async (req, res) => {
  try {
    const orderIssues = await prisma.orders.findMany({
      where: {
        issue_status: {
          not: null, // Only fetch orders that have an issue status
        },
      },
      select: {
        id: true,
        issue_priority_level: true,
        issue_reason: true,
        issue_desc: true,
        issue_status: true,
        created_at: true,
        customers: {
          select: {
            full_name: true,
            email: true,
          },
        },
        // Include other relevant order details if needed
      },
      orderBy: {
        created_at: 'desc',
      },
    });
    res.json(orderIssues);
  } catch (err) {
    console.error('GET /api/order-issues error', err);
    res.status(500).json({ error: 'Failed to fetch order issues', details: err.message });
  }
});

// GET a specific order issue by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const orderIssue = await prisma.orders.findUnique({
      where: { id: id },
      select: {
        id: true,
        issue_priority_level: true,
        issue_reason: true,
        issue_desc: true,
        issue_status: true,
        created_at: true,
        customers: {
          select: {
            full_name: true,
            email: true,
          },
        },
      },
    });

    if (!orderIssue) {
      return res.status(404).json({ error: 'Order issue not found' });
    }

    res.json(orderIssue);
  } catch (err) {
    console.error(`GET /api/order-issues/${req.params.id} error`, err);
    res.status(500).json({ error: 'Failed to fetch order issue', details: err.message });
  }
});


// PUT update issue status for a specific order
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { issue_status } = req.body;

    if (!issue_status) {
      return res.status(400).json({ error: 'Issue status is required' });
    }

    const updatedOrder = await prisma.orders.update({
      where: { id: id },
      data: {
        issue_status: issue_status,
      },
      select: {
        id: true,
        issue_status: true,
        customers: {
          select: {
            full_name: true,
          },
        },
      },
    });

    res.json(updatedOrder);
  } catch (err) {
    console.error(`PUT /api/order-issues/${req.params.id}/status error`, err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(500).json({ error: 'Failed to update order issue status', details: err.message });
  }
});

module.exports = router;
