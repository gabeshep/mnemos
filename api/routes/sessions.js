/**
 * Sessions routes
 *
 * GET  /sessions                      — list sessions for the current tenant
 * GET  /sessions/:id                  — get session with messages
 * POST /sessions                      — create a new session
 * POST /sessions/:sessionId/messages  — send a message in a session
 */

import { Router } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { withCurrentTenant } from '../../lib/tenant-context.js';
import * as schema from '../../db/schema.js';
import { buildInjectionPlan, MAX_ASSET_TOKENS } from '../../lib/token-counter.js';
import { buildSystemPrompt, sendMessage } from '../../lib/claude-service.js';
import { ClaudeApiError } from '../../lib/error-handler.js';

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
          excludedAssetVersions: schema.session.excludedAssetVersions,
          contextTokenCount: schema.session.contextTokenCount,
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
