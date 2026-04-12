/**
 * API router — mounts all route modules under their base paths.
 *
 * Each sub-router is responsible for its own path prefix and validation.
 * All routes operate within a tenant context established by the middleware
 * in src/index.js before this router is reached.
 */

import { Router } from 'express';
import { tenantMiddleware } from '../lib/tenant-context.js';

const router = Router();

// Placeholder health check — confirms the API layer is reachable.
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mnemos-api' });
});

// TODO: Replace with real auth session lookup before first production deployment.
const resolveTenantId = (req) => req.headers['x-tenant-id'] ?? null;
router.use(tenantMiddleware(resolveTenantId));

// TODO: mount route modules as they are built out, e.g.:
//   import tenantRoutes from './routes/tenants.js';
//   import entityRoutes from './routes/entities.js';
//   import assetRoutes  from './routes/assets.js';
//   import sessionRoutes from './routes/sessions.js';
//   router.use('/tenants',  tenantRoutes);
//   router.use('/entities', entityRoutes);
//   router.use('/assets',   assetRoutes);
//   router.use('/sessions', sessionRoutes);

export default router;
