// server/routes/performance.js
// FR-10 Employee Performance and Incentives. Mounted at /api/performance.
//   Admin (Bearer admin session): rules, ranking, any employee, order points, adjustments
//   Employee (Bearer employee session): /me - only ever their own data
const express = require('express');
const router = express.Router();
const { requireReviewAdmin } = require('../middleware/odooApprovalAuth');
const { requireEmployee } = require('../middleware/employeeAuth');
const service = require('../services/performanceService');

const handle = fn => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message, code: error.code });
    console.error('[Performance]', req.method, req.path, error.message);
    res.status(500).json({ error: 'Unable to process the performance request. Please retry.' });
  }
};
const range = req => ({ from: req.query.from, to: req.query.to });

router.get('/me', requireEmployee, handle(req => service.getEmployeePerformance(req.employee.id, range(req))));

// Everything below is admin-only.
router.use(requireReviewAdmin);

router.get('/rules', handle(() => service.getRules()));
router.post('/rules', handle(req => service.createRule(req.body, req.reviewAdmin.id)));
router.get('/items', handle(() => service.listItemRates()));
router.get('/items/pending', handle(() => service.countPendingItems()));
router.post('/items', handle(req => service.createItem(req.body, req.reviewAdmin.id)));
router.put('/items/:id', handle(req => service.updateItem(req.params.id, req.body, req.reviewAdmin.id)));
router.delete('/items/:id', handle(req => service.deleteItem(req.params.id)));

router.get('/', handle(req => service.getRanking({ ...range(req), team: req.query.team, role: req.query.role })));
router.get('/employees/:id', handle(req => service.getEmployeePerformance(req.params.id, range(req))));
router.get('/orders/:orderId', handle(req => service.getOrderPoints(req.params.orderId)));
router.put('/orders/:orderId/extra', handle(req => service.setExtraPoints(req.params.orderId, req.body?.points, req.reviewAdmin.id)));

module.exports = router;
