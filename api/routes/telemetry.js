/**
 * Telemetry routes
 *
 * POST /telemetry — protected endpoint for frontend telemetry ingestion.
 * Requires authentication (mounted after requireAuth + tenantMiddleware).
 */

import { Router } from 'express';

const router = Router();

// POST /telemetry
router.post('/', (req, res) => {
  const { event, properties } = req.body || {};

  if (!event || typeof event !== 'string') {
    return res.status(400).json({ error: 'event must be a non-empty string' });
  }

  if (properties !== undefined && (typeof properties !== 'object' || properties === null || Array.isArray(properties))) {
    return res.status(400).json({ error: 'properties must be a plain object' });
  }

  console.log(JSON.stringify({
    event,
    properties,
    tenantId: req.tenantId,
    userId: req.user?.userId,
    ts: new Date().toISOString(),
  }));

  return res.status(204).end();
});

export default router;
