/**
 * API router — mounts all route modules under their base paths.
 *
 * Each sub-router is responsible for its own path prefix and validation.
 * All routes (except /auth/login) operate within an authenticated tenant
 * context established by requireAuth + tenantMiddleware.
 */

import { Router } from 'express';
import { tenantMiddleware } from '../lib/tenant-context.js';
import { requireAuth } from '../lib/rbac.js';
import authRouter, { loginHandler } from './routes/auth.js';
import usersRouter from './routes/users.js';
import entitiesRouter from './routes/entities.js';
import assetsRouter from './routes/assets.js';
import capturesRouter from './routes/captures.js';
import sessionsRouter from './routes/sessions.js';

const router = Router();

// Placeholder health check — confirms the API layer is reachable.
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mnemos-api' });
});

// Public route — mount BEFORE global requireAuth
router.post('/auth/login', loginHandler);

// Global auth middleware — all routes below require a valid JWT cookie
router.use(requireAuth);

// Tenant context — derive tenantId from the authenticated JWT
router.use(tenantMiddleware((req) => req.user?.tenantId ?? null));

// Protected auth routes (logout, me)
router.use('/auth', authRouter);

// Resource routes
router.use('/users', usersRouter);
router.use('/entities', entitiesRouter);
router.use('/assets', assetsRouter);
router.use('/captures', capturesRouter);
router.use('/sessions', sessionsRouter);

export default router;
