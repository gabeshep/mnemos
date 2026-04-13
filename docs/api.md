# Mnemos REST API Reference

> Auto-generated — do not edit manually. Last updated: 2026-04-13T07:18:28.439Z.

## Overview

**Base URL:** `/api`

**Authentication:** JWT stored in an httpOnly cookie (`mnemos_auth`). All
endpoints require this cookie unless marked **Public** in the Auth column.

## Assets

Assets routes GET /assets/:assetId/versions — list published asset versions for an asset

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/assets/:assetId/versions` | JWT cookie | — |

## Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | Public | — |
| `POST` | `/api/auth/logout` | JWT cookie | — |
| `GET` | `/api/auth/me` | JWT cookie | — |

## Captures

Captures routes POST /captures — create a capture (new draft asset_version + capture record) All operations run in a single withCurrentTenant() call so they share one transaction and RLS context.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/captures` | JWT cookie | — |

## Entities

Entities routes GET /entities                            — list entities for the current tenant GET /entities/:id/assets                 — list assets for an entity GET /entities/:entityId/published-versions — list published asset versions for entity

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/entities` | JWT cookie | — |
| `GET` | `/api/entities/:entityId/assets` | JWT cookie | — |
| `GET` | `/api/entities/:entityId/published-versions` | JWT cookie | — |

## Flags

Feature flags route GET /flags — public endpoint returning feature flags derived from environment variables. No authentication required.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/flags` | Public | — |

## Metrics

GET /metrics — public Prometheus scrape endpoint. Returns all registered metrics in the Prometheus text exposition format. No authentication required (scrapers run outside the auth boundary).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/metrics` | Public | — |

## Onboarding

Onboarding routes PUT /onboarding/state/:uuid — upsert onboarding state for the caller's tenant. Authorization: - requireAuth (JWT cookie) is enforced globally before this router mounts. - tenantMiddleware sets req.tenantId from the JWT. - RLS is enforced via withCurrentTenant for all data access. - If the :uuid exists but belongs to a different tenant the handler returns 403, NOT 404. The distinction is made via the SECURITY DEFINER function `get_onboarding_state_tenant_id` which bypasses RLS for the sole purpose of determining record ownership. - Cross-tenant probes are written to the security audit trail with any request body redacted (no PII / tokens in the log).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `PUT` | `/api/onboarding/state/:uuid` | JWT cookie | — |

## Sessions

Sessions routes GET  /sessions                      — list sessions for the current tenant GET  /sessions/:id                  — get session with messages POST /sessions                      — create a new session POST /sessions/:sessionId/messages  — send a message in a session

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/sessions` | JWT cookie | — |
| `GET` | `/api/sessions/search` | JWT cookie | — |
| `GET` | `/api/sessions/:sessionId` | JWT cookie | — |
| `POST` | `/api/sessions` | JWT cookie | — |
| `POST` | `/api/sessions/:sessionId/messages` | JWT cookie | — |

## Synthetic

GET /synthetic/onboarding — synthetic canary probe for the onboarding SLO. Exercises the full DB write path using a dedicated synthetic tenant and onboarding state row. Returns 200 on success, 503 on failure. Environment variables: SYNTHETIC_TENANT_ID  — UUID of the synthetic tenant SYNTHETIC_STATE_ID   — UUID of the onboarding_state row used as the probe target No authentication required — called by external monitors.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/synthetic/onboarding` | Public | — |

## Telemetry

Telemetry routes POST /telemetry — protected endpoint for frontend telemetry ingestion. Requires authentication (mounted after requireAuth + tenantMiddleware).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/telemetry` | JWT cookie | — |

## Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/users` | JWT cookie | — |

## Voc

VOC (Voice of Customer) routes POST /voc/report — protected endpoint for onboarding support fallback reports. Requires authentication (mounted after requireAuth + tenantMiddleware). Does NOT persist to DB — emits a structured log only.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/voc/report` | JWT cookie | — |
