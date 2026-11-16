// server/routes/exceptions.js
// Counts behind the red badge beside "Exceptions" in the sidebar. Admin only,
// like the Sync Monitor it includes.
const router = require('express').Router();
const { requireReviewAdmin } = require('../middleware/odooApprovalAuth');
const { getExceptionSummary } = require('../services/exceptionSummaryService');

router.get('/summary', requireReviewAdmin, async (req, res) => {
  try {
    res.json(await getExceptionSummary());
  } catch (error) {
    console.error('[Exceptions] summary failed:', error.message);
    res.status(503).json({ error: 'Unable to load the exception count.' });
  }
});

module.exports = router;
