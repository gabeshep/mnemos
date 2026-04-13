/**
 * GET /synthetic/onboarding — synthetic canary probe for the onboarding SLO.
 *
 * Exercises the full DB write path using a dedicated synthetic tenant and
 * onboarding state row. Returns 200 on success, 503 on failure.
 *
 * Environment variables:
 *   SYNTHETIC_TENANT_ID  — UUID of the synthetic tenant
 *   SYNTHETIC_STATE_ID   — UUID of the onboarding_state row used as the probe target
 *
 * No authentication required — called by external monitors.
 */

import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { withTenant } from '../../lib/tenant-context.js';
import * as schema from '../../db/schema.js';

const router = Router();

router.get('/onboarding', async (_req, res) => {
  const SYNTHETIC_TENANT_ID = process.env.SYNTHETIC_TENANT_ID;
  const SYNTHETIC_STATE_ID = process.env.SYNTHETIC_STATE_ID;

  if (!SYNTHETIC_TENANT_ID || !SYNTHETIC_STATE_ID) {
    return res.status(503).json({ ok: false, error: 'synthetic probe not configured' });
  }

  const startMs = Date.now();

  try {
    const result = await withTenant(SYNTHETIC_TENANT_ID, async (_client, tdb) =>
      tdb
        .update(schema.onboardingState)
        .set({ state: { synthetic: true, ts: Date.now() }, updatedAt: new Date() })
        .where(
          and(
            eq(schema.onboardingState.id, SYNTHETIC_STATE_ID),
            eq(schema.onboardingState.tenantId, SYNTHETIC_TENANT_ID)
          )
        )
        .returning({ id: schema.onboardingState.id })
    );

    if (!result || result.length === 0) {
      return res.status(503).json({ ok: false, error: 'probe row not found or not updated' });
    }

    if (result[0].id !== SYNTHETIC_STATE_ID) {
      return res.status(503).json({ ok: false, error: 'unexpected probe row id returned' });
    }

    return res.json({ ok: true, latencyMs: Date.now() - startMs });
  } catch (err) {
    return res.status(503).json({ ok: false, error: err.message ?? String(err) });
  }
});

export default router;
