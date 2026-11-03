// Shared-secret check for calls coming from Odoo (x-odoo-secret header).
// Fails closed: with no secret configured, every request is rejected.
function verifySecret(req, res, next) {
  const secret = process.env.ODOO_WEBHOOK_SECRET;
  if (!secret || req.headers['x-odoo-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { verifySecret };
