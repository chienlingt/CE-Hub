// server/routes/roles.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const { requireReviewAdmin } = require('../middleware/odooApprovalAuth');
const isAdmin = role => role?.name?.trim().toLowerCase() === 'admin';
const validPermissions = value => Array.isArray(value) && value.length <= 100 && value.every(key => typeof key === 'string' && /^[a-z][a-z_]{0,63}$/.test(key));
function failure(res, err, message) {
  if (err.code === 'P2025') return res.status(404).json({ error: 'Role not found.' });
  if (err.code === 'P2003') return res.status(409).json({ error: 'Reassign employees before deleting this role.' });
  return res.status(500).json({ error: message });
}

router.get('/', (req, res, next) => req.query.counts === '1' ? requireReviewAdmin(req, res, next) : next());

router.get('/', async (req, res) => {
  try {
    const roles = await prisma.roles.findMany({ ...(req.query.counts === '1' ? { include: { _count: { select: { employees: true } } } } : {}) });
    res.json(roles);
  } catch (err) {
    console.error('GET /api/roles error', err);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

router.post('/', requireReviewAdmin, async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const permissions = req.body.permissions ?? [];
    if (!name || name.length > 80 || !validPermissions(permissions)) return res.status(400).json({ error: 'Provide a role name (1–80 characters) and a valid permissions list.' });
    if (name.toLowerCase() === 'admin') return res.status(409).json({ error: 'The Admin role is reserved.' });
    if (await prisma.roles.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })) return res.status(409).json({ error: 'A role with this name already exists.' });
    const role = await prisma.roles.create({ data: { name, permissions: [...new Set(permissions)] } });
    res.status(201).json(role);
  } catch (err) {
    console.error('POST /api/roles error', err);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

router.put('/:id', requireReviewAdmin, async (req, res) => {
  try {
    if (!validPermissions(req.body.permissions) || Object.keys(req.body).some(key => key !== 'permissions')) return res.status(400).json({ error: 'Only a valid permissions list can be updated here.' });
    const existing = await prisma.roles.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Role not found.' });
    if (isAdmin(existing)) return res.status(409).json({ error: 'Admin always has full access and cannot be restricted here.' });
    const role = await prisma.roles.update({
      where: { id: req.params.id },
      data: { permissions: [...new Set(req.body.permissions)] }
    });
    res.json(role);
  } catch (err) {
    console.error('PUT /api/roles/:id error', err);
    failure(res, err, 'Failed to update role');
  }
});

router.delete('/:id', requireReviewAdmin, async (req, res) => {
  try {
    const existing = await prisma.roles.findUnique({ where: { id: req.params.id }, include: { _count: { select: { employees: true } } } });
    if (!existing) return res.status(404).json({ error: 'Role not found.' });
    if (isAdmin(existing)) return res.status(409).json({ error: 'The Admin role cannot be deleted.' });
    if (existing._count.employees > 0) return res.status(409).json({ error: 'Reassign employees before deleting this role.' });
    await prisma.roles.delete({ where: { id: req.params.id } });
    res.json({ message: 'Role deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/roles/:id error', err);
    failure(res, err, 'Failed to delete role');
  }
});

module.exports = router;
