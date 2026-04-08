# Mnemos — Product Spec v1.0
**Codename:** Mnemos  
**Real name:** [PRODUCT_NAME] — to be determined  
**Status:** Pre-build. Handoff to PermaShip.  
**Date:** April 2026  
**Owner:** Gabe (PermaShip Marketing)

---

## Problem Statement

AI-assisted marketing work produces a fragmentation problem that mirrors what engineering teams experience with codebases. As a marketing org uses AI to develop, iterate, and evolve strategic assets — ICPs, Personas, Messaging Architecture, Brand Guidelines, Playbooks, Sales Sequences, Campaign Briefs — those assets accumulate across multiple tools, sessions, and versions with no single authoritative state.

The compounding failure modes are:

- Work originates and evolves inside Claude conversations, not in external documents. Capture back to a canonical system is manual, inconsistent, and frequently skipped.
- AI outputs are only as reliable as the context they were generated from. When canonical docs drift out of sync, outputs drift with them — silently.
- Individual tweaks to source files produce divergent versions that are difficult to reconcile.
- There is no mechanism to know which assets were generated from which version of which source document.

The result is an AI-assisted marketing org that produces high-volume output with low output reliability — which defeats the primary advantage of AI-assisted work.

**Mnemos solves this by being the source-of-truth layer and AI context management system for marketing orgs operating with AI-native workflows.**

---

## Goals

1. Provide a single source of truth for all marketing strategic assets, organized by entity (brand/org) and asset type.
2. Enforce a Published/Draft state discipline that gates what feeds AI sessions.
3. Provide full version history for all documents — not just the current state.
4. Integrate with the Claude API so AI sessions can be initiated from, and captured back to, canonical documents without leaving the platform.
5. Support multiple tenants (orgs) from day one at the data model level.
6. Be usable by non-engineers — marketing operators, CMOs, content strategists, brand managers.

---

## Non-Goals (v1)

- This is not a project management tool. No tasks, no tickets, no sprints.
- This is not a CMS or publishing platform. Assets do not publish to external channels from Mnemos.
- This is not a collaboration tool in the Google Docs sense. Real-time co-editing is out of scope for v1.
- This is not a campaign execution platform. HubSpot, LinkedIn, and other execution tools remain where they are.
- Billing, payments, and subscription management are out of scope for v1.
- Public-facing onboarding and self-serve signup are out of scope for v1.

---

## Core Concepts

### Tenant
A single organization using Mnemos. All data is scoped to a tenant. No data crosses tenant boundaries under any circumstances. Tenant isolation is a hard architectural requirement, not a roadmap item.

### Entity
Within a tenant, an Entity is a brand, product, or business unit with its own distinct strategic identity. A tenant may have one or many entities. Example: PermaShip (tenant) contains entities: PermaShip Platform, Nexus OSS, Beacon.

### Asset
A strategic marketing document. Assets belong to an entity. Asset types are defined (see below) but the system should support custom asset types.

### Asset Version
Every save of an asset creates a new version. Versions are immutable once created. The version history is always accessible.

### Published State
An asset has two states: **Draft** and **Published**. Only one version of an asset can be Published at any time. Promoting a version to Published automatically demotes the previous Published version to Archived. The Published version is the only version eligible to feed Claude sessions.

### Session
A Claude API conversation initiated from within Mnemos. Sessions are scoped to a set of Published assets selected by the user. Session transcripts are stored and linked to the assets that seeded them.

### Capture
The act of extracting content from a Session and applying it back to an asset — either updating an existing asset or creating a new one. Capture is the core workflow that closes the loop between AI-generated work and the canonical system.

---

## Asset Types (v1)

Standard types that ship with every tenant:

- ICP (Ideal Customer Profile)
- Persona
- Messaging Architecture
- Brand Guidelines
- Positioning Statement
- Value Proposition
- Competitive Analysis
- Sales Sequence
- Playbook
- Campaign Brief
- Content Calendar
- Email Template
- Ad Copy Library
- Objection Handling Framework
- Product Description

Custom types: tenants can define additional asset types. Custom types behave identically to standard types.

---

## Data Model

### Core Schema

```
tenant
  id                UUID, PK
  name              STRING
  slug              STRING, unique
  created_at        TIMESTAMP
  settings          JSONB

entity
  id                UUID, PK
  tenant_id         UUID, FK → tenant.id
  name              STRING
  description       TEXT
  created_at        TIMESTAMP

asset
  id                UUID, PK
  entity_id         UUID, FK → entity.id
  tenant_id         UUID, FK → tenant.id
  name              STRING
  asset_type        STRING (enum + custom)
  created_at        TIMESTAMP
  created_by        UUID, FK → user.id

asset_version
  id                UUID, PK
  asset_id          UUID, FK → asset.id
  tenant_id         UUID, FK → tenant.id
  version_number    INTEGER (auto-increment per asset)
  content           TEXT (markdown)
  state             ENUM: draft | published | archived
  published_at      TIMESTAMP, nullable
  created_at        TIMESTAMP
  created_by        UUID, FK → user.id
  source_session_id UUID, FK → session.id, nullable
  notes             TEXT, nullable (change summary)

session
  id                UUID, PK
  tenant_id         UUID, FK → tenant.id
  entity_id         UUID, FK → entity.id
  created_at        TIMESTAMP
  created_by        UUID, FK → user.id
  title             STRING, nullable
  status            ENUM: active | closed
  seed_asset_versions  ARRAY of asset_version.id (Published versions that seeded this session)

session_message
  id                UUID, PK
  session_id        UUID, FK → session.id
  tenant_id         UUID, FK → tenant.id
  role              ENUM: user | assistant
  content           TEXT
  created_at        TIMESTAMP

capture
  id                UUID, PK
  session_id        UUID, FK → session.id
  tenant_id         UUID, FK → tenant.id
  target_asset_id   UUID, FK → asset.id
  produced_version_id UUID, FK → asset_version.id
  created_at        TIMESTAMP
  created_by        UUID, FK → user.id

user
  id                UUID, PK
  tenant_id         UUID, FK → tenant.id
  email             STRING
  role              ENUM: admin | editor | viewer
  created_at        TIMESTAMP
```

### Multi-Tenancy Enforcement
- Every table that contains operational data carries `tenant_id`.
- All queries are filtered by `tenant_id` at the application layer. No query against operational tables executes without a `tenant_id` filter.
- Tenant isolation is validated at the API layer on every request — not assumed from session state alone.

---

## Claude API Integration

### Session Initiation
- User selects an entity and one or more Published asset versions to seed the session.
- System constructs a system prompt that injects the full content of all selected Published assets as canonical context.
- System prompt includes a directive that the assistant is operating as a marketing strategist with access to the org's canonical documents, and that all outputs should be consistent with those documents.
- Session is opened via Claude API (`/v1/messages`) with the constructed system prompt.
- All messages (user and assistant) are stored in `session_message`.

### Session Interface
- Chat interface rendered within Mnemos.
- User interacts with Claude in the context of their selected canonical assets.
- Full session transcript is persistent and retrievable.

### Capture Flow
- At any point during or after a session, the user can select a block of assistant output and trigger a Capture.
- Capture UI presents: target asset (default: inferred from content, user can override), captured content (editable before saving), change summary note (optional).
- On confirm, Capture creates a new `asset_version` in Draft state, linked to the source session via `source_session_id`.
- User can then review the Draft, edit further, and Publish when ready.
- Capture does not automatically Publish. The Publish action is always a deliberate user decision.

### Model
- Claude Sonnet (latest available) as default session model.
- Model selection configurable per tenant in settings.

---

## V1 Feature Scope

### Must Have
- Tenant creation (manual/admin, not self-serve)
- Entity management (create, edit, archive)
- Asset management (create, edit, version history, Draft/Published/Archived states)
- Publish/Demote controls
- Session initiation with Published asset context injection
- Session transcript storage and retrieval
- Capture flow (session output → new asset version)
- User auth (email/password minimum, SSO stretch goal)
- Role-based access: admin, editor, viewer

### Nice to Have (v1 stretch)
- Asset dependency map (visualize which assets were built from which sessions)
- Session search across transcript history
- Asset diff view (compare two versions side by side)
- Bulk asset export (markdown or PDF)

### Explicitly Out of Scope (v1)
- Self-serve signup and billing
- Real-time collaborative editing
- External channel publishing
- Integrations (HubSpot, Notion, Drive) — these are v2 considerations
- Mobile app

---

## Success Criteria for V1

1. A PermaShip marketing operator can open a session, have a Claude conversation seeded by Published canonical assets, and capture outputs back to the asset library in under 3 minutes.
2. Every asset in the library has a clear Published version and a complete version history.
3. Every session has a clear record of which Published asset versions it was seeded with.
4. The data model supports a second tenant being added without schema changes.
5. No asset content crosses tenant boundaries under any circumstances.

---

## Tech Stack Guidance

No hard requirements imposed. PermaShip selects the stack. The following are constraints:

- Web application (browser-based, not desktop)
- Must support the Claude API integration as a first-class architectural concern — not a plugin or afterthought
- Multi-tenant isolation must be enforced at the data layer, not only at the application layer
- All user-facing text content (asset content, session transcripts) stored as markdown

---

## Resolved Architectural Decisions

### 1. Tenant isolation: Row-level security (RLS) with Postgres — migration-ready

Use RLS at the database layer. Every query against operational tables is filtered by `tenant_id`. No query executes without a `tenant_id` filter, enforced at both the application layer and the database layer.

**Rationale:** RLS is operationally simple at v1 tenant counts and well-suited to Postgres. Schema-per-tenant and database-per-tenant introduce migration complexity (every schema change multiplies across tenants) that is not justified at launch.

**Forward compatibility requirement:** Although self-serve signup and public market access are out of scope for v1, they are on the near-term product roadmap. As a result, the application-layer tenant scoping must be implemented strictly enough that migrating to schema-per-tenant later is a data operation, not an application rewrite. Tenant resolution, query scoping, and context injection must all be routed through a single, consistent tenant context mechanism — not scattered across ad hoc query logic. This is a discipline requirement, not a feature requirement.

**Migration trigger:** Revisit isolation strategy before crossing 20 active tenants, or when the first enterprise prospect raises a security review question about data isolation.

---

### 2. Context window management: Prioritized selective injection with visible truncation notice

When a user seeds a session, the system calculates the total token count of all selected Published assets before constructing the API request. If the total exceeds 80% of the model's available context window (reserving headroom for the conversation), the system surfaces a warning and prompts the user to prioritize assets for this session.

Assets are injected in user-defined priority order until the threshold is reached. Any assets that do not fit are excluded and surfaced to the user in a visible truncation notice — never silently dropped. The session record stores exactly which asset versions were injected, so the context state is always auditable.

**No silent truncation under any circumstances.**

---

### 3. Capture: Always a full new version

Capture always produces a complete new `asset_version` record. Diff/patch approaches introduce fragility — partial applies, merge ambiguity, and unclear canonical state. Markdown documents are small; storage cost is not a factor. Version comparison (diff view) is a UI concern, not a data model concern, and can be added as a stretch feature without touching the underlying versioning strategy.

---

## Future Integrations

Mnemos's integration roadmap is the martech stack, not the devtools stack. PermaShip's native integrations (Jira, Linear, Figma, PagerDuty, CI/CD webhooks) are built for engineering workflows and are not relevant to Mnemos. Mnemos's future integration surface serves marketing operators — connecting canonical assets to the tools where those assets are activated, distributed, and measured.

Target integration categories for v2 and beyond:

**Asset execution:** HubSpot (sequences, playbooks, email templates live here and execute here), Canva (design production layer), Google Drive (existing asset storage many orgs won't abandon immediately)

**Work management:** Asana, Monday — not Jira or Linear

**Distribution and publishing:** LinkedIn, Meta, Google Ads — not CI/CD pipelines

**Measurement and listening:** Social listening tools (Brandwatch, Sprout Social), SEO platforms (Ahrefs, Semrush), GA4 — performance context that informs when canonical assets need to be revisited

**Communication:** Slack — marketing ops coordination, not engineering incident response

The design principle for all future integrations: Mnemos is the source. Integrations are consumers or signals — they either pull from Mnemos (execution tools) or push signals back to it (measurement tools) to inform when canonical assets need to evolve.

---

## Codename Convention

**Mnemos** is the first project under the PermaShip internal codename convention. All internal projects use Greek mythology codenames. The codename `MNEMOS` (uppercase) is the token used in code, config, and infrastructure references. It will be replaced with `[PRODUCT_NAME]` via find-and-replace when the real name is decided. Codename should never appear in any user-facing string.

---

*This spec is the knowledge base for the Mnemos build. PermaShip owns implementation decisions within the constraints defined here. Material changes to goals, non-goals, or data model require Gabe sign-off before execution.*
