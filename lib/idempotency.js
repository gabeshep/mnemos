/**
 * Idempotency middleware
 *
 * Enforces strict idempotency for mutating endpoints by storing request
 * results in the `idempotency_record` table keyed on (tenant_id, idempotency_key).
 *
 * Behaviour:
 *   - First request with a key: claim it (INSERT … ON CONFLICT DO NOTHING),
 *     proceed, and store the response.
 *   - Duplicate request, in-flight: return 409.
 *   - Duplicate request, completed: replay stored response.
 *   - Expired record: delete stale row and treat as a fresh request.
 */

import { pool } from '../db/index.js';
import { onboardingTransitionTotal } from './metrics.js';

export function idempotencyMiddleware() {
  return async (req, res, next) => {
    // 1. Validate Idempotency-Key header
    const key = req.headers['idempotency-key'];
    if (!key) {
      return res.status(400).json({ error: 'Idempotency-Key header is required' });
    }
    if (!/^[\x21-\x7E]{1,255}$/.test(key)) {
      return res.status(400).json({ error: 'Idempotency-Key must be 1–255 printable ASCII characters' });
    }

    const tenantId = req.tenantId; // set by tenant middleware
    const requestPath = req.path;

    // 2. Try to claim the key via INSERT ... ON CONFLICT DO NOTHING
    const insertResult = await pool.query(
      `INSERT INTO idempotency_record (tenant_id, idempotency_key, request_path, status, expires_at)
       VALUES ($1, $2, $3, 'processing', now() + INTERVAL '24 hours')
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
       RETURNING tenant_id`,
      [tenantId, key, requestPath]
    );

    if (insertResult.rowCount === 1) {
      // Key claimed — intercept res.json to store the response
      const originalJson = res.json.bind(res);
      let responseCaptured = false;
      res.json = async (body) => {
        if (responseCaptured) return;
        responseCaptured = true;
        try {
          await pool.query(
            `UPDATE idempotency_record SET status='completed', response_status=$1, response_body=$2
             WHERE tenant_id=$3 AND idempotency_key=$4`,
            [res.statusCode, body, tenantId, key]
          );
        } catch (err) {
          pool.query(
            `DELETE FROM idempotency_record WHERE tenant_id=$1 AND idempotency_key=$2`,
            [tenantId, key]
          ).catch(() => {});
          return next(err);
        }
        return originalJson(body);
      };
      return next();
    }

    // 3. Conflict — check existing record
    const existing = await pool.query(
      `SELECT status, response_status, response_body FROM idempotency_record
       WHERE tenant_id=$1 AND idempotency_key=$2 AND expires_at > now()`,
      [tenantId, key]
    );

    if (existing.rowCount === 0) {
      // Expired — delete stale record and retry insert
      await pool.query(
        `DELETE FROM idempotency_record WHERE tenant_id=$1 AND idempotency_key=$2`,
        [tenantId, key]
      );
      const retryInsert = await pool.query(
        `INSERT INTO idempotency_record (tenant_id, idempotency_key, request_path, status, expires_at)
         VALUES ($1, $2, $3, 'processing', now() + INTERVAL '24 hours')
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
         RETURNING tenant_id`,
        [tenantId, key, requestPath]
      );
      if (retryInsert.rowCount === 1) {
        const originalJson = res.json.bind(res);
        let responseCaptured = false;
        res.json = async (body) => {
          if (responseCaptured) return;
          responseCaptured = true;
          try {
            await pool.query(
              `UPDATE idempotency_record SET status='completed', response_status=$1, response_body=$2
               WHERE tenant_id=$3 AND idempotency_key=$4`,
              [res.statusCode, body, tenantId, key]
            );
          } catch (err) {
            pool.query(
              `DELETE FROM idempotency_record WHERE tenant_id=$1 AND idempotency_key=$2`,
              [tenantId, key]
            ).catch(() => {});
            return next(err);
          }
          return originalJson(body);
        };
        return next();
      }
    }

    const record = existing.rows[0];
    if (!record) {
      // Race condition: treat as in-flight
      onboardingTransitionTotal.inc({ outcome: 'idempotency_inflight' });
      return res.status(409).json({ error: 'A request with this Idempotency-Key is already being processed' });
    }

    if (record.status === 'processing') {
      onboardingTransitionTotal.inc({ outcome: 'idempotency_inflight' });
      return res.status(409).json({ error: 'A request with this Idempotency-Key is already being processed' });
    }

    // status === 'completed' — return cached response
    onboardingTransitionTotal.inc({ outcome: 'idempotency_hit' });
    console.log(JSON.stringify({
      event: 'onboarding.idempotency_hit',
      tenantId,
      keyPrefix: key.slice(0, 8),
      cachedStatus: record.response_status,
      ts: new Date().toISOString(),
    }));
    return res.status(record.response_status).json(record.response_body);
  };
}
