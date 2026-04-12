/**
 * Entities routes
 *
 * GET /entities          — list entities for the current tenant
 * GET /entities/:id/assets — list assets for an entity
 */

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { withCurrentTenant } from '../../lib/tenant-context.js';
import * as schema from '../../db/schema.js';

const router = Router();

// GET /entities
router.get('/', async (req, res) => {
  try {
    const entities = await withCurrentTenant(async (_client, tdb) => {
      return tdb
        .select({
          id: schema.entity.id,
          name: schema.entity.name,
          description: schema.entity.description,
          createdAt: schema.entity.createdAt,
        })
        .from(schema.entity)
        .orderBy(schema.entity.name);
    });

    return res.json(entities);
  } catch (err) {
    console.error('[entities] GET / error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /entities/:entityId/assets
router.get('/:entityId/assets', async (req, res) => {
  const { entityId } = req.params;

  try {
    const assets = await withCurrentTenant(async (_client, tdb) => {
      return tdb
        .select({
          id: schema.asset.id,
          name: schema.asset.name,
          assetType: schema.asset.assetType,
          createdAt: schema.asset.createdAt,
        })
        .from(schema.asset)
        .where(eq(schema.asset.entityId, entityId))
        .orderBy(schema.asset.name);
    });

    return res.json(assets);
  } catch (err) {
    console.error('[entities] GET /:entityId/assets error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
