/**
 * Entities routes
 *
 * GET /entities                            — list entities for the current tenant
 * GET /entities/:id/assets                 — list assets for an entity
 * GET /entities/:entityId/published-versions — list published asset versions for entity
 */

import { Router } from 'express';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { withCurrentTenant } from '../../lib/tenant-context.js';
import * as schema from '../../db/schema.js';
import { estimateTokens } from '../../lib/token-counter.js';

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
    const result = await withCurrentTenant(async (_client, tdb) => {
      const assets = await tdb
        .select({
          id: schema.asset.id,
          name: schema.asset.name,
          assetType: schema.asset.assetType,
          createdAt: schema.asset.createdAt,
        })
        .from(schema.asset)
        .where(eq(schema.asset.entityId, entityId))
        .orderBy(schema.asset.name);

      if (assets.length === 0) return assets.map(a => ({ ...a, latestVersion: null }));

      const assetIds = assets.map(a => a.id);
      const allVersions = await tdb.select({
        id: schema.assetVersion.id,
        assetId: schema.assetVersion.assetId,
        versionNumber: schema.assetVersion.versionNumber,
        state: schema.assetVersion.state,
        createdAt: schema.assetVersion.createdAt,
      })
        .from(schema.assetVersion)
        .where(inArray(schema.assetVersion.assetId, assetIds))
        .orderBy(desc(schema.assetVersion.versionNumber));

      const latestMap = new Map();
      for (const v of allVersions) {
        if (!latestMap.has(v.assetId)) latestMap.set(v.assetId, v);
      }

      return assets.map(a => ({ ...a, latestVersion: latestMap.get(a.id) ?? null }));
    });

    return res.json(result);
  } catch (err) {
    console.error('[entities] GET /:entityId/assets error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /entities/:entityId/published-versions
router.get('/:entityId/published-versions', async (req, res) => {
  const { entityId } = req.params;

  try {
    const result = await withCurrentTenant(async (_client, tdb) => {
      // Check entity exists
      const [entityRecord] = await tdb
        .select({ id: schema.entity.id })
        .from(schema.entity)
        .where(eq(schema.entity.id, entityId));

      if (!entityRecord) {
        return null;
      }

      // Fetch published versions joined with asset
      const rows = await tdb
        .select({
          id: schema.assetVersion.id,
          assetId: schema.assetVersion.assetId,
          assetName: schema.asset.name,
          assetType: schema.asset.assetType,
          versionNumber: schema.assetVersion.versionNumber,
          content: schema.assetVersion.content,
          publishedAt: schema.assetVersion.publishedAt,
        })
        .from(schema.assetVersion)
        .innerJoin(schema.asset, eq(schema.assetVersion.assetId, schema.asset.id))
        .where(
          and(
            eq(schema.asset.entityId, entityId),
            eq(schema.assetVersion.state, 'published')
          )
        )
        .orderBy(schema.asset.name);

      return rows;
    });

    if (result === null) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const versions = result.map(row => ({
      id: row.id,
      assetId: row.assetId,
      assetName: row.assetName,
      assetType: row.assetType,
      versionNumber: row.versionNumber,
      estimatedTokens: estimateTokens(row.content),
      publishedAt: row.publishedAt,
    }));

    return res.json(versions);
  } catch (err) {
    console.error('[entities] GET /:entityId/published-versions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
