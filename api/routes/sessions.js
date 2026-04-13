/**
 * Sessions routes
 *
 * GET  /sessions                      — list sessions for the current tenant
 * GET  /sessions/:id                  — get session with messages
 * POST /sessions                      — create a new session
 * POST /sessions/:sessionId/messages  — send a message in a session
 */

import { Router } from 'express';
import { eq, inArray, desc } from 'drizzle-orm';
import { withCurrentTenant } from '../../lib/tenant-context.js';
import * as schema from '../../db/schema.js';
import { buildInjectionPlan, MAX_ASSET_TOKENS } from '../../lib/token-counter.js';
import { buildSystemPrompt, sendMessage } from '../../lib/claude-service.js';
import { ClaudeApiError } from '../../lib/error-handler.js';

const router = Router();

// GET /sessions
router.get('/', async (req, res) => {
  try {
    const result = await withCurrentTenant(async (client, tdb) => {
      const sessions = await tdb
        .select({
          id: schema.session.id,
          entityId: schema.session.entityId,
          title: schema.session.title,
          status: schema.session.status,
          createdAt: schema.session.createdAt,
          seedAssetVersions: schema.session.seedAssetVersions,
          excludedAssetVersions: schema.session.excludedAssetVersions,
          contextTokenCount: schema.session.contextTokenCount,
        })
        .from(schema.session)
        .orderBy(desc(schema.session.createdAt))
        .limit(100);

      // Collect all unique version IDs across all sessions
      const allVersionIds = [...new Set(sessions.flatMap(s => s.seedAssetVersions))];

      // Batch fetch version + asset info
      let versionMap = new Map();
      if (allVersionIds.length > 0) {
        const versionRows = await tdb
          .select({
            id: schema.assetVersion.id,
            assetId: schema.assetVersion.assetId,
            assetName: schema.asset.name,
            assetType: schema.asset.assetType,
            versionNumber: schema.assetVersion.versionNumber,
          })
          .from(schema.assetVersion)
          .innerJoin(schema.asset, eq(schema.assetVersion.assetId, schema.asset.id))
          .where(inArray(schema.assetVersion.id, allVersionIds));
        for (const v of versionRows) {
          versionMap.set(v.id, v);
        }
      }

      // Batch fetch capture counts per session
      const sessionIds = sessions.map(s => s.id);
      let captureCountMap = new Map();
      if (sessionIds.length > 0) {
        const countRows = await client.query(
          `SELECT session_id, COUNT(*)::int AS cnt FROM capture WHERE session_id = ANY($1) GROUP BY session_id`,
          [sessionIds]
        );
        for (const row of countRows.rows) {
          captureCountMap.set(row.session_id, row.cnt);
        }
      }

      return sessions.map(s => ({
        ...s,
        captureCount: captureCountMap.get(s.id) ?? 0,
        seedVersionSummary: s.seedAssetVersions
          .map(id => versionMap.get(id))
          .filter(Boolean),
      }));
    });

    return res.json(result);
  } catch (err) {
    console.error('[sessions] GET / error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /sessions/search
router.get('/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const entityId = typeof req.query.entityId === 'string' ? req.query.entityId.trim() : null;

  if (!q) {
    return res.status(400).json({ error: 'q is required' });
  }
  if (q.length > 500) {
    return res.status(400).json({ error: 'q must be 500 characters or fewer' });
  }

  try {
    const rows = await withCurrentTenant(async (client) => {
      let sql;
      let params;

      if (entityId) {
        sql = `
          SELECT s.id AS session_id, s.title, s.entity_id, s.status, s.created_at,
                 sm.id AS message_id, sm.role, sm.created_at AS message_created_at,
                 ts_headline('english', sm.content, plainto_tsquery('english', $1),
                             'MaxWords=20, MinWords=10, MaxFragments=1') AS snippet
          FROM session_message sm
          JOIN session s ON s.id = sm.session_id
          WHERE to_tsvector('english', sm.content) @@ plainto_tsquery('english', $1)
            AND s.entity_id = $2
          ORDER BY s.created_at DESC, sm.created_at ASC
          LIMIT 150
        `;
        params = [q, entityId];
      } else {
        sql = `
          SELECT s.id AS session_id, s.title, s.entity_id, s.status, s.created_at,
                 sm.id AS message_id, sm.role, sm.created_at AS message_created_at,
                 ts_headline('english', sm.content, plainto_tsquery('english', $1),
                             'MaxWords=20, MinWords=10, MaxFragments=1') AS snippet
          FROM session_message sm
          JOIN session s ON s.id = sm.session_id
          WHERE to_tsvector('english', sm.content) @@ plainto_tsquery('english', $1)
          ORDER BY s.created_at DESC, sm.created_at ASC
          LIMIT 150
        `;
        params = [q];
      }

      const result = await client.query(sql, params);
      return result.rows;
    });

    // Group by sessionId, take first 3 messages per session, cap at 50 sessions
    const sessionMap = new Map();
    for (const row of rows) {
      if (!sessionMap.has(row.session_id)) {
        sessionMap.set(row.session_id, {
          sessionId: row.session_id,
          title: row.title,
          entityId: row.entity_id,
          status: row.status,
          createdAt: row.created_at,
          matchingMessages: [],
        });
      }
      const entry = sessionMap.get(row.session_id);
      if (entry.matchingMessages.length < 3) {
        entry.matchingMessages.push({
          messageId: row.message_id,
          role: row.role,
          snippet: row.snippet,
          createdAt: row.message_created_at,
        });
      }
    }

    const results = Array.from(sessionMap.values()).slice(0, 50);
    return res.json(results);
  } catch (err) {
    console.error('[sessions] GET /search error:', err);
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

      let seedVersionDetails = [];
      if (sessionRecord.seedAssetVersions.length > 0) {
        seedVersionDetails = await tdb
          .select({
            id: schema.assetVersion.id,
            assetId: schema.assetVersion.assetId,
            assetName: schema.asset.name,
            assetType: schema.asset.assetType,
            versionNumber: schema.assetVersion.versionNumber,
          })
          .from(schema.assetVersion)
          .innerJoin(schema.asset, eq(schema.assetVersion.assetId, schema.asset.id))
          .where(inArray(schema.assetVersion.id, sessionRecord.seedAssetVersions));
      }

      return { ...sessionRecord, messages, seedVersionDetails };
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

// PATCH /sessions/:sessionId
router.patch('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const { title } = req.body;

  if (!title || typeof title !== 'string' || title.length > 255) {
    return res.status(400).json({ error: 'title must be a non-empty string of 255 characters or fewer' });
  }

  try {
    const updated = await withCurrentTenant(async (_client, tdb) => {
      const rows = await tdb
        .update(schema.session)
        .set({ title })
        .where(eq(schema.session.id, sessionId))
        .returning();
      return rows[0] ?? null;
    });

    if (!updated) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.json(updated);
  } catch (err) {
    console.error('[sessions] PATCH /:sessionId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /sessions
router.post('/', async (req, res) => {
  const { entityId, assetVersionIds, title, priority } = req.body;

  if (!entityId) {
    return res.status(400).json({ error: 'entityId is required' });
  }
  if (!Array.isArray(assetVersionIds) || assetVersionIds.length === 0) {
    return res.status(400).json({ error: 'assetVersionIds must be a non-empty array' });
  }

  try {
    const result = await withCurrentTenant(async (_client, tdb) => {
      // Fetch all supplied version IDs with their asset info
      const rows = await tdb
        .select({
          id: schema.assetVersion.id,
          assetId: schema.assetVersion.assetId,
          content: schema.assetVersion.content,
          state: schema.assetVersion.state,
          assetName: schema.asset.name,
          assetType: schema.asset.assetType,
        })
        .from(schema.assetVersion)
        .innerJoin(schema.asset, eq(schema.assetVersion.assetId, schema.asset.id))
        .where(inArray(schema.assetVersion.id, assetVersionIds));

      // Verify all requested IDs exist and are published
      if (rows.length !== assetVersionIds.length) {
        return { error: 'Invalid asset version IDs', status: 400 };
      }
      const nonPublished = rows.filter(r => r.state !== 'published');
      if (nonPublished.length > 0) {
        return { error: 'Invalid asset version IDs', status: 400 };
      }

      // Build injection plan
      const plan = buildInjectionPlan(rows, priority);

      // If threshold exceeded and no priority given, return breakdown
      if (plan.exceedsThreshold && (!priority || priority.length === 0)) {
        const breakdown = rows.map(r => ({
          id: r.id,
          assetId: r.assetId,
          assetName: r.assetName,
          assetType: r.assetType,
          content: r.content,
        }));
        return {
          thresholdExceeded: true,
          breakdown,
          totalTokens: plan.totalTokens,
        };
      }

      // Insert session record
      const createdBy = req.user?.userId;
      const [sessionRecord] = await tdb
        .insert(schema.session)
        .values({
          tenantId: req.tenantId,
          entityId,
          title: title ?? null,
          createdBy,
          seedAssetVersions: plan.injected.map(v => v.id),
          excludedAssetVersions: plan.excluded.map(v => v.id),
          contextTokenCount: plan.totalTokens,
        })
        .returning();

      return { session: sessionRecord };
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    if (result.thresholdExceeded) {
      return res.status(200).json({
        status: 'threshold_exceeded',
        breakdown: result.breakdown,
        totalTokens: result.totalTokens,
        maxTokens: MAX_ASSET_TOKENS,
      });
    }

    return res.status(201).json({ status: 'created', session: result.session });
  } catch (err) {
    console.error('[sessions] POST / error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /sessions/:sessionId/messages
router.post('/:sessionId/messages', async (req, res) => {
  const { sessionId } = req.params;
  const { content } = req.body;

  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }

  try {
    const result = await withCurrentTenant(async (_client, tdb) => {
      // Fetch session
      const [sessionRecord] = await tdb
        .select()
        .from(schema.session)
        .where(eq(schema.session.id, sessionId));

      if (!sessionRecord) {
        return { notFound: true };
      }

      if (sessionRecord.status === 'closed') {
        return { closed: true };
      }

      // Fetch seed asset version content (injected ones from seed_asset_versions)
      let injectedVersions = [];
      if (sessionRecord.seedAssetVersions.length > 0) {
        injectedVersions = await tdb
          .select({
            id: schema.assetVersion.id,
            content: schema.assetVersion.content,
            assetName: schema.asset.name,
            assetType: schema.asset.assetType,
          })
          .from(schema.assetVersion)
          .innerJoin(schema.asset, eq(schema.assetVersion.assetId, schema.asset.id))
          .where(inArray(schema.assetVersion.id, sessionRecord.seedAssetVersions));
      }

      // Fetch existing messages ordered by created_at
      const history = await tdb
        .select({
          id: schema.sessionMessage.id,
          role: schema.sessionMessage.role,
          content: schema.sessionMessage.content,
          createdAt: schema.sessionMessage.createdAt,
        })
        .from(schema.sessionMessage)
        .where(eq(schema.sessionMessage.sessionId, sessionId))
        .orderBy(schema.sessionMessage.createdAt);

      return { sessionRecord, injectedVersions, history };
    });

    if (result.notFound) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (result.closed) {
      return res.status(400).json({ error: 'Session is closed' });
    }

    const { sessionRecord, injectedVersions, history } = result;

    // Build system prompt
    const systemPrompt = buildSystemPrompt(injectedVersions);

    // Call Claude API
    let claudeResult;
    try {
      claudeResult = await sendMessage({
        systemPrompt,
        history,
        newUserMessage: content.trim(),
      });
    } catch (apiErr) {
      if (apiErr instanceof ClaudeApiError) {
        console.error('[sessions] Claude API error:', { code: apiErr.code, httpStatus: apiErr.httpStatus, retryable: apiErr.retryable });
        if (apiErr.retryAfter != null) {
          res.set('Retry-After', String(apiErr.retryAfter));
        }
        return res.status(apiErr.httpStatus).json({ error: apiErr.message, code: apiErr.code, retryable: apiErr.retryable, retryAfter: apiErr.retryAfter });
      }
      console.error('[sessions] Claude API error:', apiErr);
      return res.status(502).json({ error: 'Claude API error', detail: apiErr.message });
    }

    // Insert user + assistant messages
    const insertedMessages = await withCurrentTenant(async (_client, tdb) => {
      const [userMsg] = await tdb
        .insert(schema.sessionMessage)
        .values({
          sessionId,
          tenantId: req.tenantId,
          role: 'user',
          content: content.trim(),
        })
        .returning();

      const [assistantMsg] = await tdb
        .insert(schema.sessionMessage)
        .values({
          sessionId,
          tenantId: req.tenantId,
          role: 'assistant',
          content: claudeResult.content,
        })
        .returning();

      return { userMsg, assistantMsg };
    });

    return res.status(201).json({
      userMessage: insertedMessages.userMsg,
      assistantMessage: insertedMessages.assistantMsg,
    });
  } catch (err) {
    console.error('[sessions] POST /:sessionId/messages error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
