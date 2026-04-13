/**
 * VOC (Voice of Customer) routes
 *
 * POST /voc/report — protected endpoint for onboarding support fallback reports.
 * Requires authentication (mounted after requireAuth + tenantMiddleware).
 * Does NOT persist to DB — emits a structured log only.
 */

import { Router } from 'express';

const router = Router();

// POST /voc/report
router.post('/report', (req, res) => {
  const { description, stepIndex, errorCode } = req.body || {};

  if (!description || typeof description !== 'string' || description.trim().length === 0 || description.length > 2000) {
    return res.status(400).json({ error: 'Invalid description' });
  }

  if (!Number.isInteger(stepIndex) || stepIndex < 0) {
    return res.status(400).json({ error: 'Invalid stepIndex' });
  }

  console.log(JSON.stringify({
    event: 'voc.report',
    tenantId: req.user.tenantId,
    stepIndex,
    errorCode,
    descriptionLength: description.length,
    ts: new Date().toISOString(),
  }));

  return res.status(200).json({ ok: true });
});

export default router;
