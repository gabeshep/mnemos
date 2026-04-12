/**
 * Sessions routes
 *
 * GET /sessions          — list sessions for the current tenant
 * GET /sessions/:id      — get session with messages
 */

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { withCurrentTenant } from '../../lib/tenant-context.js';
import * as schema from '../../db/schema.js';

const router = Router();

// GET /sessions
router.get('/', async (req, res) => {
  try {
    const sessions = await withCurrentTenant(async (_client, tdb) => {
      return tdb
        .select({
          id: schema.session.id,
          entityId: schema.session.entityId,
          title: schema.session.title,
          status: schema.session.status,
          createdAt: schema.session.createdAt,
          seedAssetVersions: schema.session.seedAssetVersions,
        })
        .from(schema.session)
        .orderBy(schema.session.createdAt);
    });

    return res.json(sessions);
  } catch (err) {
    console.error('[sessions] GET / error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /sessions/:sessionId
router.get('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  try {
    const result = await withCurrentTenant(async (_client, tdb) => {
      const [sessionRecord] = await tdb
        .select()
        .from(schema.session)
        .where(eq(schema.session.id, sessionId));

      if (!sessionRecord) {
        return null;
      }

      const messages = await tdb
        .select({
          id: schema.sessionMessage.id,
          role: schema.sessionMessage.role,
          content: schema.sessionMessage.content,
          createdAt: schema.sessionMessage.createdAt,
        })
        .from(schema.sessionMessage)
        .where(eq(schema.sessionMessage.sessionId, sessionId))
        .orderBy(schema.sessionMessage.createdAt);

      return { ...sessionRecord, messages };
    });

    if (!result) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.json(result);
  } catch (err) {
    console.error('[sessions] GET /:sessionId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
