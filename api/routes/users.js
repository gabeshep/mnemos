import { Router } from 'express';
import { requireRole } from '../../lib/rbac.js';
import { hashPassword } from '../../lib/auth.js';
import { withCurrentTenant } from '../../lib/tenant-context.js';
import * as schema from '../../db/schema.js';

const router = Router();

const VALID_ROLES = ['admin', 'editor', 'viewer'];

// POST /users — admin only
router.post('/', requireRole('admin'), async (req, res) => {
  const { email, password, role } = req.body || {};

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const passwordHash = await hashPassword(password);
    const tenantId = req.user.tenantId;

    const result = await withCurrentTenant(async (client, tdb) => {
      return tdb.insert(schema.user).values({
        tenantId,
        email,
        passwordHash,
        role,
      }).returning({ id: schema.user.id, email: schema.user.email, role: schema.user.role, tenantId: schema.user.tenantId });
    });

    return res.status(201).json(result[0]);
  } catch (err) {
    // Postgres unique constraint violation
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error('[users] POST error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
