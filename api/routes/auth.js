import { Router } from 'express';
import { pool } from '../../db/index.js';
import { withTenant } from '../../lib/tenant-context.js';
import { verifyPassword, signToken } from '../../lib/auth.js';
import { requireAuth } from '../../lib/rbac.js';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 604800000,
};

// POST /auth/login — public
// This handler is also exported standalone so it can be mounted before requireAuth
export async function loginHandler(req, res) {
  const { email, password, tenantSlug } = req.body || {};

  try {
    // Look up tenant by slug (direct pool query, outside withTenant)
    const tenantRes = await pool.query(
      'SELECT id FROM tenant WHERE slug = $1',
      [tenantSlug]
    );

    if (tenantRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const tenantId = tenantRes.rows[0].id;

    // Look up user by (tenant_id, email) within the tenant's RLS context.
    // withTenant sets app.current_tenant_id so the RLS policy on the "user" table
    // allows this read even when the DB role has RLS enforced.
    const user = await withTenant(tenantId, async (client) => {
      const userRes = await client.query(
        'SELECT id, email, role, password_hash FROM "user" WHERE tenant_id = $1 AND email = $2',
        [tenantId, email]
      );
      return userRes.rows[0] ?? null;
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({ userId: user.id, tenantId, role: user.role });
    res.cookie('mnemos_auth', token, COOKIE_OPTIONS);

    return res.json({ id: user.id, email: user.email, role: user.role, tenantId });
  } catch (err) {
    console.error('[auth] Login error:', err);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
}

router.post('/login', loginHandler);

// POST /auth/logout — protected
router.post('/logout', requireAuth, (req, res) => {
  res.clearCookie('mnemos_auth', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  return res.json({ ok: true });
});

// GET /auth/me — protected
router.get('/me', requireAuth, async (req, res) => {
  const { userId, tenantId } = req.user;
  try {
    const user = await withTenant(tenantId, async (client) => {
      const result = await client.query(
        'SELECT id, email, role FROM "user" WHERE id = $1 AND tenant_id = $2',
        [userId, tenantId]
      );
      return result.rows[0] ?? null;
    });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.json({ id: user.id, email: user.email, role: user.role, tenantId });
  } catch (err) {
    console.error('[auth] /me error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
