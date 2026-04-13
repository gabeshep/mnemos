/**
 * Assets routes
 *
 * GET /assets/:assetId/versions         — list published asset versions (DO NOT CHANGE)
 * POST /assets                           — create asset + v1 draft
 * GET /assets/:assetId                   — get single asset
 * GET /assets/:assetId/all-versions      — all versions (all states)
 * GET /assets/:assetId/versions/:versionId — single version with content
 * POST /assets/:assetId/versions         — create new draft version
 * POST /assets/:assetId/versions/:versionId/publish — publish a draft version
 * POST /assets/:assetId/versions/:versionId/demote  — demote published → draft
 */

import { Router } from 'express';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { withCurrentTenant } from '../../lib/tenant-context.js';
import * as schema from '../../db/schema.js';

const router = Router();

// POST /assets — create asset + v1 draft
router.post('/', async (req, res) => {
  const { entityId, name, assetType, description } = req.body || {};

  if (!entityId || !name || !assetType) {
    return res.status(400).json({ error: 'entityId, name, and assetType are required' });
  }

  const tenantId = req.user?.tenantId;
  const userId = req.user?.userId;

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

      // Insert asset
      const [asset] = await tdb
        .insert(schema.asset)
        .values({ entityId, tenantId, name, assetType, createdBy: userId })
        .returning();

      // Insert v1 draft
      const [assetVersion] = await tdb
        .insert(schema.assetVersion)
        .values({
          assetId: asset.id,
          tenantId,
          versionNumber: 1,
          content: '',
          state: 'draft',
          createdBy: userId,
          notes: description || null,
        })
        .returning();

      return { asset, assetVersion };
    });

    if (result === null) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    return res.status(201).json(result);
  } catch (err) {
    console.error('[assets] POST / error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /assets/:assetId — get single asset
router.get('/:assetId', async (req, res) => {
  const { assetId } = req.params;

  try {
    const asset = await withCurrentTenant(async (_client, tdb) => {
      const [row] = await tdb
        .select()
        .from(schema.asset)
        .where(eq(schema.asset.id, assetId));
      return row ?? null;
    });

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    return res.json(asset);
  } catch (err) {
    console.error('[assets] GET /:assetId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /assets/:assetId/versions — returns published versions only (DO NOT CHANGE)
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

// GET /assets/:assetId/all-versions — all versions (all states, no content)
router.get('/:assetId/all-versions', async (req, res) => {
  const { assetId } = req.params;

  try {
    const result = await withCurrentTenant(async (_client, tdb) => {
      // Check asset exists
      const [assetRecord] = await tdb
        .select({ id: schema.asset.id })
        .from(schema.asset)
        .where(eq(schema.asset.id, assetId));

      if (!assetRecord) {
        return null;
      }

      return tdb
        .select({
          id: schema.assetVersion.id,
          assetId: schema.assetVersion.assetId,
          versionNumber: schema.assetVersion.versionNumber,
          state: schema.assetVersion.state,
          createdAt: schema.assetVersion.createdAt,
          notes: schema.assetVersion.notes,
          sourceSessionId: schema.assetVersion.sourceSessionId,
        })
        .from(schema.assetVersion)
        .where(eq(schema.assetVersion.assetId, assetId))
        .orderBy(desc(schema.assetVersion.versionNumber));
    });

    if (result === null) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    return res.json(result);
  } catch (err) {
    console.error('[assets] GET /:assetId/all-versions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /assets/:assetId/versions/:versionId — single version with content
router.get('/:assetId/versions/:versionId', async (req, res) => {
  const { assetId, versionId } = req.params;

  try {
    const version = await withCurrentTenant(async (_client, tdb) => {
      const [row] = await tdb
        .select()
        .from(schema.assetVersion)
        .where(
          and(
            eq(schema.assetVersion.id, versionId),
            eq(schema.assetVersion.assetId, assetId)
          )
        );
      return row ?? null;
    });

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    return res.json(version);
  } catch (err) {
    console.error('[assets] GET /:assetId/versions/:versionId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /assets/:assetId/versions — create new draft version
router.post('/:assetId/versions', async (req, res) => {
  const { assetId } = req.params;
  const { content, notes } = req.body || {};

  if (content === undefined || content === null) {
    return res.status(400).json({ error: 'content is required' });
  }

  const tenantId = req.user?.tenantId;
  const userId = req.user?.userId;

  try {
    const assetVersion = await withCurrentTenant(async (_client, tdb) => {
      // Compute next version number
      const maxVersionResult = await tdb
        .select({ maxVersion: sql`COALESCE(MAX(${schema.assetVersion.versionNumber}), 0)` })
        .from(schema.assetVersion)
        .where(eq(schema.assetVersion.assetId, assetId));
      const nextVersionNumber = Number(maxVersionResult[0].maxVersion) + 1;

      const [newVersion] = await tdb
        .insert(schema.assetVersion)
        .values({
          assetId,
          tenantId,
          versionNumber: nextVersionNumber,
          content,
          state: 'draft',
          createdBy: userId,
          notes: notes || null,
        })
        .returning();

      return newVersion;
    });

    return res.status(201).json(assetVersion);
  } catch (err) {
    console.error('[assets] POST /:assetId/versions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /assets/:assetId/versions/:versionId/publish — publish a draft
router.post('/:assetId/versions/:versionId/publish', async (req, res) => {
  const { assetId, versionId } = req.params;

  try {
    const result = await withCurrentTenant(async (_client, tdb) => {
      // Select target version
      const [targetVersion] = await tdb
        .select()
        .from(schema.assetVersion)
        .where(
          and(
            eq(schema.assetVersion.id, versionId),
            eq(schema.assetVersion.assetId, assetId)
          )
        );

      if (!targetVersion) {
        return { notFound: true };
      }

      if (targetVersion.state !== 'draft') {
        return { conflict: true };
      }

      // Find any currently published version for this asset
      const [currentlyPublished] = await tdb
        .select()
        .from(schema.assetVersion)
        .where(
          and(
            eq(schema.assetVersion.assetId, assetId),
            eq(schema.assetVersion.state, 'published')
          )
        );

      let archived = null;

      // Archive currently published version if found
      if (currentlyPublished) {
        const [archivedVersion] = await tdb
          .update(schema.assetVersion)
          .set({ state: 'archived' })
          .where(eq(schema.assetVersion.id, currentlyPublished.id))
          .returning();
        archived = archivedVersion;
      }

      // Publish the target version
      const [published] = await tdb
        .update(schema.assetVersion)
        .set({ state: 'published', publishedAt: new Date() })
        .where(eq(schema.assetVersion.id, versionId))
        .returning();

      return { published, archived };
    });

    if (result.notFound) {
      return res.status(404).json({ error: 'Version not found' });
    }

    if (result.conflict) {
      return res.status(409).json({ error: 'Version is not in draft state' });
    }

    return res.json(result);
  } catch (err) {
    console.error('[assets] POST /:assetId/versions/:versionId/publish error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /assets/:assetId/versions/:versionId/demote — demote published → draft
router.post('/:assetId/versions/:versionId/demote', async (req, res) => {
  const { assetId, versionId } = req.params;

  try {
    const result = await withCurrentTenant(async (_client, tdb) => {
      // Select version
      const [targetVersion] = await tdb
        .select()
        .from(schema.assetVersion)
        .where(
          and(
            eq(schema.assetVersion.id, versionId),
            eq(schema.assetVersion.assetId, assetId)
          )
        );

      if (!targetVersion) {
        return { notFound: true };
      }

      if (targetVersion.state !== 'published') {
        return { conflict: true };
      }

      const [updated] = await tdb
        .update(schema.assetVersion)
        .set({ state: 'draft', publishedAt: null })
        .where(eq(schema.assetVersion.id, versionId))
        .returning();

      return { updated };
    });

    if (result.notFound) {
      return res.status(404).json({ error: 'Version not found' });
    }

    if (result.conflict) {
      return res.status(409).json({ error: 'Version is not published' });
    }

    return res.json(result.updated);
  } catch (err) {
    console.error('[assets] POST /:assetId/versions/:versionId/demote error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
