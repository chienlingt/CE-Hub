// Admin monitor access is issued by the normal password-checked login.
// Unrelated legacy APIs are not made secure by this scoped middleware.
const crypto = require('crypto');
const prisma = require('../prismaClient');
const sessions = new Map();
const TTL = 12 * 60 * 60 * 1000;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const isAdmin = employee => employee?.active_flag === true && employee.role?.name?.trim().toLowerCase() === 'admin';
function issueAdminSession(employee) {
  if (!isAdmin(employee) || !employee.password) return null;
  for (const [key, session] of sessions) if (session.expires <= Date.now()) sessions.delete(key);
  if (sessions.size >= 10000) throw new Error('Admin session capacity exceeded.');
  const token = crypto.randomBytes(32).toString('hex'), expires = Date.now() + TTL;
  sessions.set(digest(token), { employeeId: employee.id, passwordHash: digest(employee.password), expires });
  return { token, expires_at: new Date(expires).toISOString(), employee_id: employee.id };
}
function revokeAdminSession(req) {
  const token = /^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization || '')?.[1];
  if (token) sessions.delete(digest(token));
}
async function requireReviewAdmin(req, res, next) {
  const token = /^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization || '')?.[1];
  const key = token && digest(token), session = key && sessions.get(key);
  if (!session || session.expires <= Date.now()) {
    if (key) sessions.delete(key);
    return res.status(401).json({ error: 'Your admin login expired or the server restarted. Please sign in again.' });
  }
  try {
    const employee = await prisma.employees.findUnique({ where: { id: session.employeeId }, include: { role: true } });
    if (!isAdmin(employee) || !employee.password || digest(employee.password) !== session.passwordHash) {
      sessions.delete(key);
      return res.status(403).json({ error: 'Admin access was revoked. Please sign in again.' });
    }
    req.reviewAdmin = { id: employee.id, name: employee.name || employee.display_name || employee.email };
    res.set('Cache-Control', 'no-store');
    return next();
  } catch {
    return res.status(503).json({ error: 'Unable to verify admin access. Please retry.' });
  }
}
module.exports = { issueAdminSession, revokeAdminSession, requireReviewAdmin };
