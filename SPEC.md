# Agent Shared Memory — Specification

## 1. Overview

A shared, persistent memory system for AI coding agents. Agents store
short factual entries ("memories") and retrieve them via natural
language questions. The system is designed for multiple engineers, each
running multiple agents concurrently, all contributing to and reading
from the same project-scoped memory pool.

### Design Principles

- **Shared by default.** All agents in a project see all memories.
  Scoping narrows the view; it never widens it.
- **Agents write facts, not conversations.** Memories are pre-distilled
  by the agent. No LLM extraction pipeline — the agent decides what's
  worth remembering.
- **Search is a question.** An agent asks a natural language question
  and gets relevant memories back, ranked by semantic similarity.
- **Stale memories retire gracefully.** Memories that haven't been
  accessed recently are archived, not deleted. Archived memories can
  be searched explicitly and promoted back to active.
- **Zero new infrastructure.** Everything runs on PostgreSQL with
  pgvector (hosted via Supabase or any PostgreSQL provider). No
  separate vector database, no graph database, no additional services
  beyond the MCP server itself.

### Non-Goals (for v1)

- Graph-based entity/relationship tracking.
- Automatic fact extraction from raw conversations.
- Multi-project federation (one deployment = one project).
- Real-time memory sync/push to agents (pull-only via search).
- Role-based access control between agents.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Agent Fleet                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │Agent A-1│ │Agent A-2│ │Agent B-1│ │  Auto-1 │  ...  │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘       │
│       └──────┬─────┘──────────┘────────────┘            │
│              │ MCP Protocol                              │
│              ▼                                           │
│  ┌───────────────────────┐                               │
│  │    MCP Server         │                               │
│  │    (TypeScript)       │                               │
│  │                       │                               │
│  │  Tools:               │                               │
│  │    remember           │                               │
│  │    recall             │                               │
│  │    pin / unpin        │                               │
│  │    forget             │                               │
│  │    correct            │                               │
│  └───────────┬───────────┘                               │
│              │ PostgreSQL client                          │
│              ▼                                           │
│  ┌───────────────────────────────────────────┐           │
│  │         PostgreSQL + pgvector              │           │
│  │  ┌──────────────────────────────────────┐ │           │
│  │  │ project_memory table                 │ │           │
│  │  │   + pgvector HNSW index              │ │           │
│  │  │   + GIN index on tags                │ │           │
│  │  └──────────────────────────────────────┘ │           │
│  │  ┌──────────────────────────────────────┐ │           │
│  │  │ recall() function                    │ │           │
│  │  │ touch_memories() function            │ │           │
│  │  │ archive_stale() function             │ │           │
│  │  │ dedup_check() function               │ │           │
│  │  └──────────────────────────────────────┘ │           │
│  │  ┌──────────────────────────────────────┐ │           │
│  │  │ pg_cron: archive reaper (daily)      │ │           │
│  │  └──────────────────────────────────────┘ │           │
│  └───────────────────────────────────────────┘           │
│                                                          │
│  ┌───────────────────────┐                               │
│  │    CLI / TUI          │                               │
│  │    (TypeScript)       │  ← Human admin interface      │
│  │    Direct DB access   │                               │
│  └───────────────────────┘                               │
└─────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Role | Talks To |
|---|---|---|
| **MCP Server** | Agent-facing API. Enforces conventions, generates embeddings, manages lifecycle. | PostgreSQL, Embedding API |
| **PostgreSQL** | Persistence, vector search, archival. All data lives here. Supabase or any PostgreSQL host with pgvector. | — |
| **CLI / TUI** | Human admin interface. Browse, search, manage, visualize. | PostgreSQL directly |
| **Archive Reaper** | pg_cron job. Archives stale unpinned memories daily. | PostgreSQL (internal) |

---

## 3. Data Model

### 3.1 Table: `project_memory`

```sql
CREATE TABLE project_memory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      TEXT NOT NULL,

    -- The memory itself
    content         TEXT NOT NULL,
    embedding       VECTOR(1536),

    -- Attribution: who created this memory
    created_by      TEXT NOT NULL,       -- agent identity, e.g. "alice/code-reviewer"
    engineer        TEXT,                -- "alice", null for autonomous agents
    agent_type      TEXT,                -- "code-reviewer", "architect", etc.

    -- Organization
    repo            TEXT,                -- repository name, if scoped
    tags            TEXT[] DEFAULT '{}', -- free-form tags for filtering

    -- Lifecycle
    importance      TEXT NOT NULL DEFAULT 'normal'
                    CHECK (importance IN ('normal', 'high', 'critical')),
    pinned          BOOLEAN NOT NULL DEFAULT false,
    archived        BOOLEAN NOT NULL DEFAULT false,

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    access_count    INTEGER NOT NULL DEFAULT 0
);

-- When importance is 'critical', auto-pin
-- Enforced at application layer (MCP server), not as a trigger,
-- to keep the DB layer simple.
```

### 3.2 Indexes

```sql
-- Semantic search: HNSW for fast approximate nearest neighbor
CREATE INDEX idx_memory_embedding
    ON project_memory USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Active memories per project (the hot path)
CREATE INDEX idx_memory_project_active
    ON project_memory (project_id)
    WHERE NOT archived;

-- Tag filtering
CREATE INDEX idx_memory_tags
    ON project_memory USING gin (tags);

-- Archival reaper: find stale, unpinned, unarchived memories
CREATE INDEX idx_memory_archival_candidates
    ON project_memory (last_accessed_at)
    WHERE NOT pinned AND NOT archived;

-- Attribution lookups
CREATE INDEX idx_memory_created_by
    ON project_memory (created_by);

-- Repo scoping
CREATE INDEX idx_memory_repo
    ON project_memory (repo)
    WHERE repo IS NOT NULL;
```

### 3.3 Functions

#### `recall` — Semantic search with optional scoping

```sql
CREATE OR REPLACE FUNCTION recall(
    p_project_id        TEXT,
    p_embedding         VECTOR(1536),
    p_limit             INT DEFAULT 10,
    p_threshold         FLOAT DEFAULT 0.3,
    p_include_archived  BOOLEAN DEFAULT false,
    p_agent             TEXT DEFAULT NULL,
    p_engineer          TEXT DEFAULT NULL,
    p_repo              TEXT DEFAULT NULL,
    p_tags              TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    id                  UUID,
    content             TEXT,
    similarity          FLOAT,
    created_by          TEXT,
    engineer            TEXT,
    repo                TEXT,
    tags                TEXT[],
    importance          TEXT,
    pinned              BOOLEAN,
    archived            BOOLEAN,
    access_count        INTEGER,
    created_at          TIMESTAMPTZ,
    last_accessed_at    TIMESTAMPTZ
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.content,
        (1 - (m.embedding <=> p_embedding))::FLOAT AS similarity,
        m.created_by,
        m.engineer,
        m.repo,
        m.tags,
        m.importance,
        m.pinned,
        m.archived,
        m.access_count,
        m.created_at,
        m.last_accessed_at
    FROM project_memory m
    WHERE m.project_id = p_project_id
      AND (p_include_archived OR NOT m.archived)
      AND (p_agent IS NULL    OR m.created_by = p_agent)
      AND (p_engineer IS NULL OR m.engineer = p_engineer)
      AND (p_repo IS NULL     OR m.repo = p_repo)
      AND (p_tags IS NULL     OR m.tags @> p_tags)
      AND (1 - (m.embedding <=> p_embedding)) > p_threshold
    ORDER BY m.embedding <=> p_embedding
    LIMIT p_limit;
END;
$$;
```

#### `touch_memories` — Bump access on recall hits

```sql
CREATE OR REPLACE FUNCTION touch_memories(p_ids UUID[])
RETURNS void
LANGUAGE sql AS $$
    UPDATE project_memory
    SET last_accessed_at = now(),
        access_count = access_count + 1
    WHERE id = ANY(p_ids);
$$;
```

#### `dedup_check` — Find near-duplicate memories before insert

```sql
CREATE OR REPLACE FUNCTION dedup_check(
    p_project_id    TEXT,
    p_embedding     VECTOR(1536),
    p_threshold     FLOAT DEFAULT 0.95
)
RETURNS TABLE (
    id              UUID,
    content         TEXT,
    similarity      FLOAT,
    created_by      TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.content,
        (1 - (m.embedding <=> p_embedding))::FLOAT AS similarity,
        m.created_by
    FROM project_memory m
    WHERE m.project_id = p_project_id
      AND NOT m.archived
      AND (1 - (m.embedding <=> p_embedding)) > p_threshold
    ORDER BY m.embedding <=> p_embedding
    LIMIT 3;
END;
$$;
```

#### `archive_stale` — Called by pg_cron daily

```sql
CREATE OR REPLACE FUNCTION archive_stale(
    p_stale_interval INTERVAL DEFAULT INTERVAL '30 days'
)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    affected INTEGER;
BEGIN
    UPDATE project_memory
    SET archived = true,
        updated_at = now()
    WHERE NOT pinned
      AND NOT archived
      AND last_accessed_at < now() - p_stale_interval;

    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$;
```

### 3.4 Scheduled Jobs

```sql
-- Run daily at 03:00 UTC: archive memories not accessed in 30 days
SELECT cron.schedule(
    'archive-stale-memories',
    '0 3 * * *',
    $$SELECT archive_stale()$$
);
```

---

## 4. Agent Identity Model

### 4.1 Identity Format

Agent identities follow the pattern `{engineer}/{agent-type}` for
human-directed agents and `auto/{agent-type}` for autonomous agents:

```
alice/code-reviewer
alice/architect
bob/debugger
auto/ci-fixer
auto/dependency-updater
```

The MCP server decomposes this into separate fields on write:

| Field | Source | Example |
|---|---|---|
| `created_by` | Full identity string | `"alice/code-reviewer"` |
| `engineer` | Prefix before `/` (`null` if `auto`) | `"alice"` |
| `agent_type` | Suffix after `/` | `"code-reviewer"` |

### 4.2 Per-Connection Configuration

Each MCP client connection is configured with the agent's identity.
This is set at connection time, not per-request — agents don't choose
their own identity.

```json
{
    "project_id": "acme-platform",
    "agent_id": "alice/code-reviewer"
}
```

The MCP server injects these values into every operation automatically.

---

## 5. MCP Server

### 5.1 Tools

#### `remember`

Store a new memory in the project.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `content` | string | yes | The fact to remember. Should be a clear, self-contained statement. |
| `tags` | string[] | no | Free-form tags for organization. |
| `repo` | string | no | Repository this memory relates to. |
| `importance` | enum | no | `"normal"` (default), `"high"`, or `"critical"`. Critical memories are auto-pinned. |

**Behavior:**

1. Generate embedding for `content`.
2. Call `dedup_check()` with the embedding.
3. If a near-duplicate exists (similarity > 0.95):
   - If same agent: update the existing memory's content, re-embed,
     reset `updated_at`.
   - If different agent: still insert (two agents independently
     confirming a fact is signal, not noise). But tag the new memory
     with metadata indicating a corroborating entry exists.
4. If no duplicate: insert new row.
5. If `importance` is `"critical"`: set `pinned = true`.

**Returns:** `{ id, content, deduplicated: boolean }`

#### `recall`

Search memories by asking a natural language question.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `question` | string | yes | Natural language question or topic. |
| `scope` | object | no | Optional narrowing filters (see below). |
| `limit` | integer | no | Max results. Default 10. |
| `include_archived` | boolean | no | Search archived memories too. Default false. |

**Scope object:**

| Field | Type | Description |
|---|---|---|
| `agent` | string | Only this agent's memories (e.g. `"alice/code-reviewer"`). |
| `engineer` | string | Only this engineer's agents (e.g. `"alice"`). |
| `repo` | string | Only this repository. |
| `tags` | string[] | Must have all of these tags. |

**Behavior:**

1. Generate embedding for `question`.
2. Call `recall()` SQL function with embedding + scope filters.
3. Call `touch_memories()` for all returned memory IDs (resets
   archival clock).
4. Return results with attribution and similarity scores.

**Returns:** Array of:
```json
{
    "id": "uuid",
    "content": "The auth service uses JWT with RS256...",
    "similarity": 0.82,
    "created_by": "alice/code-reviewer",
    "repo": "auth-service",
    "tags": ["architecture", "security"],
    "importance": "high",
    "pinned": false,
    "access_count": 7,
    "created_at": "2026-04-08T14:30:00Z",
    "last_accessed_at": "2026-04-10T09:15:00Z"
}
```

#### `pin`

Mark a memory as never-archive.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `memory_id` | string | yes | UUID of the memory to pin. |

**Behavior:** Set `pinned = true`, `updated_at = now()`.

#### `unpin`

Remove the never-archive mark.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `memory_id` | string | yes | UUID of the memory to unpin. |

**Behavior:** Set `pinned = false`, `updated_at = now()`.
Note: does NOT immediately archive — just makes it eligible for the
reaper.

#### `forget`

Permanently delete a memory.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `memory_id` | string | yes | UUID of the memory to delete. |

**Behavior:** Hard delete. No soft-delete, no undo. The agent is
explicitly saying "this is wrong, remove it."

#### `correct`

Update a memory's content (e.g., when an agent discovers a stored
fact is stale or wrong).

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `memory_id` | string | yes | UUID of the memory to correct. |
| `new_content` | string | yes | The corrected fact. |

**Behavior:**

1. Generate new embedding for `new_content`.
2. Update `content`, `embedding`, `updated_at`.
3. The `created_by` field is NOT changed — the original author
   remains. The correction is attributable via `updated_at` timestamp
   and server logs.

**Returns:** `{ id, old_content, new_content }`

### 5.2 Embedding Strategy

- **Model:** `text-embedding-3-small` (OpenAI). 1536 dimensions.
- **Why:** Best cost/quality ratio for short factual text. Can be
  swapped for a local model (e.g., via Ollama) if latency or cost
  becomes a concern.
- **Embedding is generated in the MCP server**, not in the database.
  This keeps the DB layer simple and the embedding provider swappable.

### 5.3 Deduplication Strategy

Near-duplicates are detected at write time, not at read time:

1. Before inserting, search for existing memories with similarity
   > 0.95 in the same project.
2. **Same agent, same content:** Update in place (the agent refined
   its understanding).
3. **Different agent, same content:** Insert anyway. Two agents
   arriving at the same conclusion independently is corroboration,
   not redundancy. The duplicate will naturally get higher access
   counts and survive archival longer.
4. **Threshold of 0.95** is deliberately high — only near-exact
   semantic matches are considered duplicates. "Uses JWT" and
   "Uses JWT with RS256" are NOT duplicates.

### 5.4 Error Handling

The MCP server should handle these gracefully:

| Error | Behavior |
|---|---|
| Embedding API down | Return error to agent. Do not store without embedding. |
| Database unreachable | Return error to agent. No silent failures. |
| Memory not found (pin/forget/correct) | Return clear "not found" error. |
| Content too long (> 2000 chars) | Reject with message. Memories are short facts, not documents. |
| Empty content | Reject. |

---

## 6. Memory Lifecycle

```
                ┌──────────┐
                │  Agent    │
                │  calls    │
                │ remember()│
                └────┬─────┘
                     │
                     ▼
              ┌──────────────┐     ┌─────────────────┐
              │ Dedup check  │────▶│ Update existing  │
              │ (sim > 0.95) │ yes │ (same agent)     │
              └──────┬───────┘     └─────────────────┘
                     │ no
                     ▼
              ┌──────────────┐
              │   INSERT      │
              │   active      │
              │   memory      │
              └──────┬───────┘
                     │
          ┌──────────┼──────────────┐
          ▼          ▼              ▼
    ┌──────────┐ ┌────────┐  ┌──────────┐
    │ recall() │ │ pin()  │  │ correct()│
    │ bumps    │ │ marks  │  │ updates  │
    │ access   │ │ pinned │  │ content  │
    └──────────┘ └────────┘  └──────────┘
          │
          │  (accessed recently → stays active)
          │  (not accessed in 30d + not pinned)
          ▼
    ┌──────────────┐
    │ Archive      │
    │ reaper       │
    │ (pg_cron)    │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐     ┌─────────────────────┐
    │  Archived    │────▶│ recall() with        │
    │  memory      │     │ include_archived     │
    └──────────────┘     │ promotes back        │
                         │ to active            │
                         └─────────────────────┘
```

### Promotion from Archive

When `recall()` is called with `include_archived: true` and returns
archived memories:

1. The `touch_memories()` call resets `last_accessed_at` and
   increments `access_count` as usual.
2. The MCP server additionally sets `archived = false` on any
   returned archived memories.
3. The memory is now active again and subject to the normal
   archival lifecycle.

This creates a natural "rescue" mechanism: if an old memory is still
relevant, searching for it brings it back.

---

## 7. CLI / TUI

A command-line tool for humans to browse, search, and manage the
memory store. Connects directly to PostgreSQL (not through the MCP
server). Shares the same embedding library as the MCP server.

### 7.1 Project Name and Invocation

The CLI binary is `moneta`. All commands operate on a configured
project.

```
moneta [command] [options]
```

Configuration via environment variables or `~/.moneta/config.json`:

```json
{
    "project_id": "acme-platform",
    "database_url": "postgresql://user:pass@host:5432/dbname",
    "embedding_model": "text-embedding-3-small"
}
```

Note: `OPENAI_API_KEY` is read from the standard environment variable.

### 7.2 CLI Commands

#### `moneta search <question>`

Semantic search — the same operation agents use.

```
$ moneta search "How does authentication work?"

  #  Score  Content                                          By                    Accessed
  1  0.87   Auth service uses JWT with RS256 signing,        alice/code-reviewer   2h ago
             tokens expire after 15min
  2  0.74   Refresh tokens stored in httpOnly cookies,       bob/architect         1d ago
             rotated on each use
  3  0.61   OAuth2 PKCE flow for third-party integrations    auto/code-analyzer    5d ago

3 results (threshold: 0.30)
```

**Options:**

| Flag | Description |
|---|---|
| `--limit, -n` | Max results (default 10) |
| `--threshold, -t` | Min similarity (default 0.30) |
| `--agent` | Filter by agent identity |
| `--engineer` | Filter by engineer |
| `--repo` | Filter by repository |
| `--tags` | Filter by tags (comma-separated) |
| `--archived` | Include archived memories |
| `--json` | Output as JSON |

#### `moneta list`

List memories with filters (non-semantic, chronological).

```
$ moneta list --recent 20

  ID        Content                                     By                   Tags                 Pinned  Age
  a1b2c3    Auth service uses JWT with RS256 signing    alice/reviewer       [arch, security]     yes     2d
  d4e5f6    Frontend uses Next.js 14 App Router         bob/architect        [arch, frontend]     no      3d
  ...

20 of 342 active memories (47 archived)
```

**Options:**

| Flag | Description |
|---|---|
| `--recent, -r` | Show N most recent (default 20) |
| `--agent` | Filter by agent identity |
| `--engineer` | Filter by engineer |
| `--repo` | Filter by repository |
| `--tags` | Filter by tags |
| `--pinned` | Only pinned memories |
| `--archived` | Only archived memories |
| `--stale` | Show memories approaching archival (accessed > 20d ago) |
| `--json` | Output as JSON |

#### `moneta show <id>`

Display full detail of a single memory.

```
$ moneta show a1b2c3

  Memory a1b2c3d4-e5f6-...
  ─────────────────────────────────────────────
  Content:      Auth service uses JWT with RS256 signing,
                tokens expire after 15min with sliding window
  Created by:   alice/code-reviewer
  Engineer:     alice
  Agent type:   code-reviewer
  Repo:         auth-service
  Tags:         architecture, security, jwt
  Importance:   high
  Pinned:       yes

  Created:      2026-04-08 14:30 UTC
  Updated:      2026-04-09 10:15 UTC
  Last access:  2026-04-10 09:15 UTC (2 hours ago)
  Access count: 12
  Archived:     no
```

#### `moneta pin <id>` / `moneta unpin <id>`

```
$ moneta pin a1b2c3
Pinned a1b2c3. This memory will not be archived.

$ moneta unpin a1b2c3
Unpinned a1b2c3. This memory is now eligible for archival.
```

#### `moneta archive <id>` / `moneta restore <id>`

Manual archive/restore (distinct from the automatic reaper).

```
$ moneta archive d4e5f6
Archived d4e5f6.

$ moneta restore d4e5f6
Restored d4e5f6 to active. Access clock reset.
```

#### `moneta forget <id>`

Permanently delete a memory.

```
$ moneta forget d4e5f6
Are you sure you want to permanently delete this memory? [y/N] y
Deleted d4e5f6.
```

#### `moneta correct <id> <new-content>`

Update a memory's content.

```
$ moneta correct a1b2c3 "Auth service uses JWT with RS256, tokens expire after 30min (changed from 15min)"
Corrected a1b2c3.
  Old: Auth service uses JWT with RS256 signing, tokens expire after 15min
  New: Auth service uses JWT with RS256, tokens expire after 30min (changed from 15min)
```

#### `moneta stats`

Overview dashboard.

```
$ moneta stats

  Project: acme-platform
  ─────────────────────────────────────────

  Total memories:     389
    Active:           342
    Archived:          47
    Pinned:            23

  By engineer:
    alice             142 memories (12 pinned)
    bob                98 memories (6 pinned)
    auto               89 memories (5 pinned)
    charlie            60 memories (0 pinned)

  By repo:
    auth-service       67
    frontend-app       54
    api-gateway        43
    (no repo)         225

  Top tags:
    architecture       89
    bug                45
    performance        38
    security           34

  Archival:
    Approaching stale (>20d):   31 memories
    Archived last 7 days:       12 memories
    Promoted from archive:       3 memories

  Access patterns:
    Searches today:             142
    Memories created today:      18
    Most accessed:      a1b2c3  "Auth service uses JWT..." (47 hits)
```

#### `moneta import <file>`

Bulk import memories from a JSON or JSONL file.

```
$ moneta import seeds.jsonl --agent "admin/import"
Imported 45 memories. 3 near-duplicates skipped.
```

File format (JSONL):
```json
{"content": "The frontend uses Tailwind CSS v4", "tags": ["frontend", "styling"], "repo": "frontend-app"}
{"content": "CI runs on GitHub Actions with 10min timeout", "tags": ["ci", "infrastructure"]}
```

#### `moneta export`

Export memories to JSON.

```
$ moneta export --active > backup.json
$ moneta export --all > full-backup.json
```

### 7.3 TUI Mode

An interactive terminal interface for browsing and managing memories.
Launched via `moneta tui` or simply `moneta` with no arguments.

```
$ moneta tui
```

#### Layout

```
┌─ Agent Shared Memory ─ acme-platform ─ 342 active / 47 archived / 23 pinned ─┐
│                                                                                 │
│  Search: How does authentication work?_                          [F1 Help]     │
│                                                                                 │
│  ┌─ Results ───────────────────────────────────────────────────┬─ Detail ──────┐│
│  │                                                             │               ││
│  │  0.87 📌 Auth service uses JWT with RS256 signing, t...  │ Content:      ││
│  │       alice/code-reviewer · auth-service · 2h ago         │ Auth service  ││
│  │                                                             │ uses JWT with ││
│  │  0.74    Refresh tokens stored in httpOnly cookies,...     │ RS256 signing ││
│  │       bob/architect · auth-service · 1d ago               │ tokens expire ││
│  │                                                             │ after 15min   ││
│  │  0.61    OAuth2 PKCE flow for third-party integrations    │               ││
│  │       auto/code-analyzer · auth-service · 5d ago          │ By: alice/    ││
│  │                                                             │ code-reviewer ││
│  │                                                             │ Repo: auth-   ││
│  │                                                             │ service       ││
│  │                                                             │ Tags: arch,   ││
│  │                                                             │ security, jwt ││
│  │                                                             │ Pinned: yes   ││
│  │                                                             │ Hits: 12      ││
│  │                                                             │ Age: 2 days   ││
│  │                                                             │               ││
│  └─────────────────────────────────────────────────────────────┴───────────────┘│
│                                                                                 │
│  [/] Search  [p] Pin/Unpin  [a] Archive  [d] Delete  [e] Edit  [q] Quit       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Keybindings

| Key | Action |
|---|---|
| `/` | Focus search bar. Type a question, press Enter to search. |
| `↑` `↓` or `j` `k` | Navigate memory list |
| `Enter` | Toggle detail panel for selected memory |
| `p` | Pin / unpin selected memory |
| `a` | Archive / restore selected memory |
| `d` | Delete selected memory (with confirmation) |
| `e` | Edit/correct selected memory (opens $EDITOR) |
| `t` | Add/remove tags on selected memory |
| `f` | Open filter panel (agent, engineer, repo, tags, archived) |
| `s` | Toggle sort: by similarity (search mode) / by date (list mode) |
| `Tab` | Switch between search mode and list (chronological) mode |
| `?` or `F1` | Show help |
| `q` or `Ctrl+C` | Quit |

#### Modes

1. **Search mode** (default): Type a question, see semantically
   ranked results. This is the primary mode — mirrors what agents
   see.

2. **List mode** (`Tab` to switch): Chronological list of all
   memories with filter sidebar. Useful for browsing and bulk
   management.

3. **Stats mode** (`Ctrl+S`): Dashboard view showing the same
   information as `moneta stats`.

---

## 8. Configuration

### 8.1 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MONETA_PROJECT_ID` | yes | Project identifier (e.g., `"acme-platform"`) |
| `MONETA_DATABASE_URL` | yes | PostgreSQL connection string (e.g., `"postgresql://user:pass@host:5432/dbname"`) |
| `OPENAI_API_KEY` | yes | OpenAI API key for embeddings |
| `MONETA_EMBEDDING_MODEL` | no | Embedding model name (default: `text-embedding-3-small`) |
| `MONETA_AGENT_ID` | yes* | Agent identity for MCP server (e.g., `"alice/code-reviewer"`) |
| `MONETA_ARCHIVE_AFTER_DAYS` | no | Days before archival (default: 30) |
| `MONETA_DEDUP_THRESHOLD` | no | Similarity threshold for dedup (default: 0.95) |
| `MONETA_SEARCH_THRESHOLD` | no | Min similarity for search results (default: 0.30) |
| `MONETA_SEARCH_LIMIT` | no | Default search result limit (default: 10) |
| `MONETA_MAX_CONTENT_LENGTH` | no | Max characters per memory (default: 2000) |

*`MONETA_AGENT_ID` is required for the MCP server, not for the CLI.

### 8.2 Config File

Both the MCP server and CLI read `~/.moneta/config.json` as a
fallback. Environment variables take precedence.

```json
{
    "project_id": "acme-platform",
    "database_url": "postgresql://user:pass@host:5432/dbname",
    "embedding_model": "text-embedding-3-small",
    "archive_after_days": 30,
    "dedup_threshold": 0.95,
    "search_threshold": 0.30,
    "search_limit": 10,
    "max_content_length": 2000
}
```

---

## 9. Project Structure

```
moneta/
├── packages/
│   ├── shared/                  # Shared code between MCP server and CLI
│   │   ├── src/
│   │   │   ├── config.ts        # Config loading (env + file)
│   │   │   ├── db.ts            # PostgreSQL client + queries
│   │   │   ├── embeddings.ts    # Embedding generation
│   │   │   ├── types.ts         # Shared types
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── mcp-server/              # MCP server for agents
│   │   ├── src/
│   │   │   ├── server.ts        # MCP server setup
│   │   │   ├── tools/
│   │   │   │   ├── remember.ts
│   │   │   │   ├── recall.ts
│   │   │   │   ├── pin.ts
│   │   │   │   ├── forget.ts
│   │   │   │   └── correct.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── cli/                     # CLI / TUI for humans
│       ├── src/
│       │   ├── commands/
│       │   │   ├── search.ts
│       │   │   ├── list.ts
│       │   │   ├── show.ts
│       │   │   ├── pin.ts
│       │   │   ├── archive.ts
│       │   │   ├── forget.ts
│       │   │   ├── correct.ts
│       │   │   ├── stats.ts
│       │   │   ├── import.ts
│       │   │   ├── export.ts
│       │   │   └── tui.ts
│       │   └── index.ts
│       └── package.json
│
├── supabase/
│   └── migrations/
│       ├── 001_create_project_memory.sql
│       ├── 002_create_indexes.sql
│       ├── 003_create_functions.sql
│       └── 004_create_cron_jobs.sql
│
├── package.json                 # Workspace root
├── tsconfig.json
└── SPEC.md                      # This file
```

---

## 10. Sizing and Operational Notes

### Expected Scale

- **Memory entries:** Low thousands per project per month. Each entry
  is a short fact (< 2000 chars). This is well within pgvector's
  comfort zone.
- **Search throughput:** Hundreds of searches per minute across all
  agents. HNSW index handles this without breaking a sweat.
- **Embedding API calls:** One per `remember()` call, one per
  `recall()` call. At `text-embedding-3-small` pricing, this is
  negligible.

### Monitoring

Track these metrics (via database dashboard or custom queries):

1. **Memory growth rate:** `SELECT COUNT(*), date_trunc('day',
   created_at) FROM project_memory GROUP BY 2`
2. **Search quality proxy:** Average similarity score of returned
   results.
3. **Archival health:** Ratio of active to archived memories.
   If archival rate is very high, agents may be storing low-value
   memories.
4. **Hot memories:** Memories with high access_count are load-bearing
   facts. Consider pinning them.
5. **Orphaned memories:** Memories with access_count = 0 after 7+
   days were never useful. Review whether agents are storing the
   right things.

---

## 11. Future Considerations

These are explicitly out of scope for v1 but worth tracking:

1. **Multi-project support.** The `project_id` column is already
   there. Supporting multiple projects is a configuration change,
   not a schema change.

2. **Graph relationships.** If agents need "who said what to whom"
   or entity relationship tracking, add a `memory_edges` table with
   `(source_id, target_id, relationship)`. The pgvector memories
   become nodes.

3. **Conversation extraction.** If raw conversation ingestion becomes
   valuable, add an LLM extraction step as an optional mode in the
   MCP server's `remember` tool (`extract: true`).

4. **Web dashboard.** The TUI covers admin needs for v1. A web
   dashboard becomes valuable when non-technical stakeholders want
   visibility into what agents know.

5. **Memory confidence scoring.** Memories corroborated by multiple
   agents (dedup hits from different agents) could get a higher
   confidence score, surfacing them preferentially in search results.

6. **Embedding model migration.** If you switch embedding models,
   all existing embeddings need re-generation. Add a
   `embedding_model` column and a migration script that re-embeds
   in batches.

7. **Rate limiting.** If a runaway agent floods the memory store,
   add per-agent write rate limiting in the MCP server (in-memory
   counter, not a DB call).
