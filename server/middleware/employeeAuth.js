// Login-issued session for any active employee. It lets an employee read their
// OWN data (e.g. performance and incentive) without trusting an employee_id
// sent by the browser. Admin-only routes keep using requireReviewAdmin.
// Sessions are in memory: a server restart asks the user to sign in again.
const crypto = require('crypto');
const prisma = require('../prismaClient');

const sessions = new Map();
const TTL = 12 * 60 * 60 * 1000;
const MAX_SESSIONS = 10000;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const bearer = req => /^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization || '')?.[1];

function issueEmployeeSession(employee) {
  if (!employee || employee.active_flag !== true || !employee.password) return null;
  const now = Date.now();
  for (const [key, session] of sessions) if (session.expires <= now) sessions.delete(key);
  if (sessions.size >= MAX_SESSIONS) return null;
  const token = crypto.randomBytes(32).toString('hex');
  const expires = now + TTL;
  // Bound to the password hash: changing the password signs the session out.
  sessions.set(digest(token), { employeeId: employee.id, passwordHash: digest(employee.password), expires });
  return { token, expires_at: new Date(expires).toISOString(), employee_id: employee.id };
}

function revokeEmployeeSession(req) {
  const token = bearer(req);
  if (token) sessions.delete(digest(token));
}

async function requireEmployee(req, res, next) {
  const token = bearer(req);
  const key = token && digest(token);
  const session = key && sessions.get(key);
  if (!session || session.expires <= Date.now()) {
    if (key) sessions.delete(key);
    return res.status(401).json({ error: 'Your login expired or the server restarted. Please sign in again.' });
  }
  try {
    const employee = await prisma.employees.findUnique({ where: { id: session.employeeId }, include: { role: true } });
    if (!employee || employee.active_flag !== true || !employee.password || digest(employee.password) !== session.passwordHash) {
      sessions.delete(key);
      return res.status(403).json({ error: 'Your access was revoked. Please sign in again.' });
    }
    req.employee = { id: employee.id, name: employee.name || employee.display_name || employee.email, role: employee.role?.name || null };
    res.set('Cache-Control', 'no-store');
    return next();
  } catch {
    return res.status(503).json({ error: 'Unable to verify your login. Please retry.' });
  }
}

module.exports = { issueEmployeeSession, revokeEmployeeSession, requireEmployee };
