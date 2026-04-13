/**
 * GET /metrics — public Prometheus scrape endpoint.
 *
 * Returns all registered metrics in the Prometheus text exposition format.
 * No authentication required (scrapers run outside the auth boundary).
 */

import { Router } from 'express';
import { register } from '../../lib/metrics.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const metrics = await register.metrics();
    res.set('Content-Type', register.contentType);
    res.end(metrics);
  } catch (err) {
    res.status(500).end(String(err));
  }
});

export default router;
