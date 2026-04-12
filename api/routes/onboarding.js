/**
 * Onboarding routes
 *
 * PUT /onboarding/state/:uuid — upsert onboarding state for the caller's tenant.
 *
 * Authorization:
 *   - requireAuth (JWT cookie) is enforced globally before this router mounts.
 *   - tenantMiddleware sets req.tenantId from the JWT.
 *   - RLS is enforced via withCurrentTenant for all data access.
 *   - If the :uuid exists but belongs to a different tenant the handler returns
 *     403, NOT 404. The distinction is made via the SECURITY DEFINER function
 *     `get_onboarding_state_tenant_id` which bypasses RLS for the sole purpose
 *     of determining record ownership.
 *   - Cross-tenant probes are written to the security audit trail with any
 *     request body redacted (no PII / tokens in the log).
 */

import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { pool } from '../../db/index.js';
import { withCurrentTenant } from '../../lib/tenant-context.js';
import * as schema from '../../db/schema.js';

const router = Router();

// Redact all leaf-string values in an object to prevent PII / token leakage
// in audit logs. Arrays and nested objects are traversed recursively.
function redactBody(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return '[REDACTED]';
  if (Array.isArray(value)) return value.map(redactBody);
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, redactBody(v)])
  );
}

// PUT /onboarding/state/:uuid
router.put('/state/:uuid', async (req, res) => {
  const { uuid } = req.params;
  const callerTenantId = req.tenantId;
  const { state } = req.body || {};

  // Basic UUID format validation — prevents malformed input reaching the DB
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(uuid)) {
    return res.status(400).json({ error: 'Invalid UUID format' });
  }

  if (state === undefined || state === null || typeof state !== 'object' || Array.isArray(state)) {
    return res.status(400).json({ error: 'state must be a JSON object' });
  }

  try {
    // Attempt the UPDATE inside an RLS-scoped transaction.
    // The WHERE clause explicitly filters by both id AND tenant_id so that
    // cross-tenant UUIDs produce 0 rows (defence-in-depth beyond RLS).
    const updated = await withCurrentTenant(async (_client, tdb) => {
      return tdb
        .update(schema.onboardingState)
        .set({ state, updatedAt: new Date() })
        .where(
          and(
            eq(schema.onboardingState.id, uuid),
            eq(schema.onboardingState.tenantId, callerTenantId)
          )
        )
        .returning({ id: schema.onboardingState.id, tenantId: schema.onboardingState.tenantId });
    });

    if (updated.length > 0) {
      // Same-tenant hit — success
      return res.json({ id: updated[0].id });
    }

    // No rows updated. Determine whether the UUID is cross-tenant or missing.
    // get_onboarding_state_tenant_id is SECURITY DEFINER and bypasses RLS,
    // returning the owning tenant_id regardless of the caller's context.
    const ownerRes = await pool.query(
      'SELECT get_onboarding_state_tenant_id($1) AS owner_tenant_id',
      [uuid]
    );
    const ownerTenantId = ownerRes.rows[0]?.owner_tenant_id ?? null;

    if (ownerTenantId !== null && ownerTenantId !== callerTenantId) {
      // Cross-tenant probe — log to audit trail and return 403
      console.log(JSON.stringify({
        event: 'security.authz.cross_tenant_probe',
        endpoint: 'PUT /api/onboarding/state/:uuid',
        targetId: uuid,
        callerTenantId,
        requestBody: redactBody(req.body),
        userId: req.user?.userId ?? null,
        ts: new Date().toISOString(),
      }));
      return res.status(403).json({ error: 'Forbidden' });
    }

    // UUID does not exist in any tenant — 404
    return res.status(404).json({ error: 'Onboarding state not found' });
  } catch (err) {
    console.error('[onboarding] PUT /state/:uuid error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
