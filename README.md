# MNEMOS

**Codename:** MNEMOS  
**Real name:** [PRODUCT_NAME] — to be determined  
**Status:** Active development  
**Owner:** Gabe — PermaShip Marketing

---

## What This Is

Mnemos is an AI-native marketing asset management platform. It solves the source-of-truth and output reliability problem that emerges when marketing orgs use AI as their primary authoring and iteration environment.

The core problem: work originates and evolves inside AI conversations. There is no reliable mechanism to capture that work back into a canonical system, version it, and ensure future AI sessions run against a known, stable context. The result is high-volume AI output with low output reliability.

Mnemos closes that loop.

---

## Who It Is For

**Primary (v1):** PermaShip marketing org — internal use.  
**Target market:** Marketing orgs operating with AI-native workflows. The problem Mnemos solves is not unique to PermaShip. It is the default condition of any marketing team using AI at volume without a source-of-truth discipline.

---

## Core Concepts

**Tenant** — A single organization. All data is strictly scoped to a tenant. No data crosses tenant boundaries.

**Entity** — A brand, product, or business unit within a tenant. A tenant may have multiple entities.

**Asset** — A strategic marketing document (ICP, Persona, Messaging Architecture, Brand Guidelines, Playbook, Sales Sequence, etc.). Assets belong to an entity.

**Asset Version** — Every save creates a new immutable version. Full history is always retained.

**Published State** — An asset is either Draft, Published, or Archived. Only one version can be Published at a time. Only Published versions feed AI sessions. Promoting a version to Published automatically archives the previous Published version. Publishing is always a deliberate user action — never automatic.

**Session** — A Claude API conversation initiated from within Mnemos, seeded with one or more Published asset versions as context.

**Capture** — The act of extracting content from a Session and applying it back to the asset library as a new Draft version. Capture is the core workflow that closes the loop between AI-generated work and the canonical system.

---

## Data Model

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
  notes             TEXT, nullable

session
  id                UUID, PK
  tenant_id         UUID, FK → tenant.id
  entity_id         UUID, FK → entity.id
  created_at        TIMESTAMP
  created_by        UUID, FK → user.id
  title             STRING, nullable
  status            ENUM: active | closed
  seed_asset_versions  ARRAY of asset_version.id

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

---

## Architectural Decisions

### Tenant Isolation: RLS with Postgres, migration-ready

Row-level security at the database layer. Every query against operational tables is filtered by `tenant_id`, enforced at both the database and application layers.

**Critical discipline requirement:** Application-layer tenant scoping must be implemented through a single, consistent tenant context mechanism — not scattered across ad hoc query logic. All tenant resolution, query scoping, and context injection must route through one place. This ensures that migrating to schema-per-tenant later, if required, is a data operation and not an application rewrite.

**Migration trigger:** Revisit before crossing 20 active tenants or when the first enterprise security review raises data isolation questions.

### Context Window Management: Prioritized selective injection

On session initiation, the system calculates the total token count of all selected Published assets. If the total exceeds 80% of the model's context window, the user is prompted to prioritize assets. Injection proceeds in priority order until the threshold is reached. Any excluded assets are surfaced in a visible truncation notice. No silent truncation under any circumstances. The session record stores exactly which asset versions were injected.

### Capture: Always full new version

Capture always produces a complete new `asset_version` record. No diff/patch. Markdown assets are small — storage cost is not a factor. Version comparison is a UI concern handled by diffing two full versions, not a data model concern.

---

## Asset Types

Standard types shipped with every tenant:

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

## Claude API Integration

Sessions are initiated from within Mnemos. The system constructs a system prompt injecting the full content of all selected Published assets, then opens a conversation via the Claude API (`/v1/messages`). All messages are stored in `session_message`. The default model is Claude Sonnet (latest). Model is configurable per tenant in settings.

The Capture flow: user selects assistant output during or after a session, selects a target asset, optionally edits the captured content and adds a change summary note, then confirms. A new `asset_version` is created in Draft state, linked to the source session. The user reviews and explicitly Publishes when ready. Capture never auto-publishes.

---

## V1 Scope

### Must Have
- Tenant creation (admin-initiated, not self-serve)
- Entity management (create, edit, archive)
- Asset management (create, edit, version history, state management)
- Publish / Demote controls
- Session initiation with Published asset context injection
- Session transcript storage and retrieval
- Capture flow
- User auth (email/password)
- Role-based access: admin, editor, viewer

### Stretch (v1)
- Asset dependency map
- Session transcript search
- Asset diff view (compare two versions)
- Bulk asset export (markdown or PDF)

### Out of Scope (v1)
- Self-serve signup and billing
- Real-time collaborative editing
- External channel publishing
- Third-party integrations (HubSpot, Notion, Drive)
- Mobile app

---

## Success Criteria

1. A marketing operator can open a session, have a Claude conversation seeded by Published canonical assets, and capture output back to the asset library in under 3 minutes.
2. Every asset has a clear Published version and complete version history.
3. Every session has an auditable record of exactly which Published asset versions seeded it.
4. A second tenant can be added without schema changes.
5. No asset content crosses tenant boundaries under any circumstances.

---

## Tech Stack

PermaShip selects the stack. Constraints:

- Web application (browser-based)
- Claude API integration is a first-class architectural concern — not a plugin or afterthought
- Postgres with RLS for data layer
- All asset content and session transcripts stored as markdown
- Tenant scoping routed through a single consistent mechanism (see Architectural Decisions)

---

## Future Integrations

Mnemos's integration roadmap is the martech stack, not the devtools stack. PermaShip's native integrations (Jira, Linear, Figma, PagerDuty, CI/CD webhooks) are built for engineering workflows and are not relevant to Mnemos. Mnemos's future integration surface serves marketing operators — connecting canonical assets to the tools where those assets are activated, distributed, and measured.

Target integration categories for v2 and beyond:

- **Asset execution:** HubSpot, Canva, Google Drive
- **Work management:** Asana, Monday
- **Distribution:** LinkedIn, Meta, Google Ads
- **Measurement and listening:** Social listening (Brandwatch, Sprout Social), SEO (Ahrefs, Semrush), GA4
- **Communication:** Slack (marketing ops)

Design principle: Mnemos is the source. Integrations are either consumers (execution tools that pull from Mnemos) or signals (measurement tools that push context back to inform when canonical assets need to evolve).

---

## Codename Convention

MNEMOS is the first project under the PermaShip Greek mythology codename convention. The token `MNEMOS` is used in code, config, and infrastructure references. It will be replaced with the real product name via find-and-replace when decided. The codename must never appear in any user-facing string.

---

## Constraints

- Material changes to goals, non-goals, data model, or architectural decisions require Gabe sign-off before execution.
- The Capture UX is the primary design surface of this product. It must be treated as such — not as a secondary feature bolted onto the asset library.
- Self-serve signup is not in v1 scope but is on the near-term product roadmap. Architecture must not foreclose it.
