const express = require('express');
const router  = express.Router();
const { getOutboxRows } = require('../services/integrationOutboxService');

// GET /api/integration-outbox?status=pending|processed|dead&limit=&offset=
router.get('/', async (req, res) => {
  try {
    const { status, limit, offset } = req.query;
    const result = await getOutboxRows({
      status,
      limit:  limit  ? parseInt(limit, 10)  : 200,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json(result);
  } catch (err) {
    console.error('GET /api/integration-outbox error', err);
    res.status(500).json({ error: 'Failed to fetch outbox rows', details: err.message });
  }
});

module.exports = router;
