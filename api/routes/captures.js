/**
 * Captures routes
 *
 * POST /captures — create a capture (new draft asset_version + capture record)
 *
 * All operations run in a single withCurrentTenant() call so they share one
 * transaction and RLS context.
 */

import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { withCurrentTenant } from '../../lib/tenant-context.js';
import * as schema from '../../db/schema.js';

const router = Router();

// POST /captures
router.post('/', async (req, res) => {
  const { sessionId, targetAssetId, content, notes } = req.body || {};
  const userId = req.user?.userId;
  const tenantId = req.user?.tenantId;

  // Input validation
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  if (!targetAssetId || typeof targetAssetId !== 'string') {
    return res.status(400).json({ error: 'targetAssetId is required' });
  }
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'content is required' });
  }

  try {
    const result = await withCurrentTenant(async (_client, tdb) => {
      // Determine next version number for this asset
      const maxVersionResult = await tdb
        .select({ maxVersion: sql`COALESCE(MAX(${schema.assetVersion.versionNumber}), 0)` })
        .from(schema.assetVersion)
        .where(eq(schema.assetVersion.assetId, targetAssetId));

      const nextVersionNumber = Number(maxVersionResult[0].maxVersion) + 1;

      // Insert new asset_version in draft state
      const [assetVersionRecord] = await tdb
        .insert(schema.assetVersion)
        .values({
          assetId: targetAssetId,
          tenantId,
          versionNumber: nextVersionNumber,
          content,
          state: 'draft',
          createdBy: userId,
          sourceSessionId: sessionId,
          notes: notes || null,
        })
        .returning();

      // Insert capture record
      const [captureRecord] = await tdb
        .insert(schema.capture)
        .values({
          sessionId,
          tenantId,
          targetAssetId,
          producedVersionId: assetVersionRecord.id,
          createdBy: userId,
        })
        .returning();

      return { capture: captureRecord, assetVersion: assetVersionRecord };
    });

    return res.status(201).json(result);
  } catch (err) {
    // Unique constraint violation on (asset_id, version_number)
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Version conflict. Please retry.' });
    }
    console.error('[captures] POST error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
