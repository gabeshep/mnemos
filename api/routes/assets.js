/**
 * Assets routes
 *
 * GET /assets/:assetId/versions — list published asset versions for an asset
 */

import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { withCurrentTenant } from '../../lib/tenant-context.js';
import * as schema from '../../db/schema.js';

const router = Router();

// GET /assets/:assetId/versions — returns published versions only
router.get('/:assetId/versions', async (req, res) => {
  const { assetId } = req.params;

  try {
    const versions = await withCurrentTenant(async (_client, tdb) => {
      return tdb
        .select({
          id: schema.assetVersion.id,
          assetId: schema.assetVersion.assetId,
          versionNumber: schema.assetVersion.versionNumber,
          content: schema.assetVersion.content,
          state: schema.assetVersion.state,
          publishedAt: schema.assetVersion.publishedAt,
          createdAt: schema.assetVersion.createdAt,
          notes: schema.assetVersion.notes,
        })
        .from(schema.assetVersion)
        .where(
          and(
            eq(schema.assetVersion.assetId, assetId),
            eq(schema.assetVersion.state, 'published')
          )
        )
        .orderBy(schema.assetVersion.versionNumber);
    });

    return res.json(versions);
  } catch (err) {
    console.error('[assets] GET /:assetId/versions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
