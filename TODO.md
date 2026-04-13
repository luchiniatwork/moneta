# Moneta — Build Plan

Phased build plan for the system described in [SPEC.md](./SPEC.md).
Each phase produces a usable increment. Phases are sequential — each
depends on the previous — but tasks within a phase can be parallelized
where noted.

Estimated total: **~7 working days** for a single engineer.

---

## Phase 1: Foundation

> **Goal:** Monorepo scaffolding, database schema deployed, shared
> library compiles. Nothing runs yet, but the ground is laid.
>
> **Estimate:** 1 day
>
> **Done when:** `bun run typecheck` succeeds across all packages, migrations
> apply cleanly to a Supabase instance, embedding generation returns
> a vector from a test string.

### Project scaffolding

- [x] Create monorepo root with `package.json` (bun
      workspaces)
- [x] Create root `tsconfig.json` with shared compiler options
- [x] Create `packages/shared/`, `packages/mcp-server/`,
      `packages/cli/` with their `package.json` and `tsconfig.json`
- [x] Add shared dev dependencies: `typescript`, `bun test`, linting
      (Biome for linting + formatting)

### Database

- [x] Create `supabase/migrations/001_create_project_memory.sql` —
      table DDL from SPEC section 3.1
- [x] Create `supabase/migrations/002_create_indexes.sql` — all 6
      indexes from SPEC section 3.2
- [x] Create `supabase/migrations/003_create_functions.sql` —
      `recall()`, `touch_memories()`, `dedup_check()`,
      `archive_stale()` from SPEC section 3.3
- [x] Create `supabase/migrations/004_create_cron_jobs.sql` —
      pg_cron schedule from SPEC section 3.4
- [ ] Apply migrations to a dev Supabase instance and verify
      with a manual `INSERT` + `SELECT` round-trip

### Shared library (`packages/shared`)

- [x] `types.ts` — `Memory`, `RecallResult`, `RememberResult`,
      `SearchScope`, `Config` types from SPEC sections 3–5
      (uses Kysely-style `MemoryRow`/`NewMemory`/`MemoryUpdate`
      instead of a single `Memory` type)
- [x] `config.ts` — Load config from env vars → config file →
      defaults (precedence chain from SPEC section 8)
- [x] `db.ts` — Kysely + postgres.js client, typed wrappers for
      the 4 SQL functions (recall, touch, dedup_check, archive_stale),
      and basic CRUD (insert, update, delete, get-by-id)
- [x] `embeddings.ts` — `embed(text, apiKey, model?): Promise<number[]>`
      wrapping the OpenAI embeddings API
- [x] `identity.ts` — `parseAgentId()` decomposition
      (SPEC section 4.1, used by both MCP server and CLI)
- [x] `index.ts` — barrel export
- [x] Unit tests for config loading (env override, file fallback,
      defaults), identity parsing, and embedding generation

---

## Phase 2: MCP Server — MVP

> **Goal:** Agents can `remember` and `recall`. This is the minimum
> viable product — store facts and search them. Ship this to one
> engineer for dogfooding.
>
> **Estimate:** 1 day
>
> **Done when:** An MCP client (Claude, Cursor, or OpenCode) can
> connect to the server, store a memory with `remember`, and retrieve
> it with `recall`. Dedup and access-touch both work.

### Server setup

- [x] `server.ts` — MCP server scaffolding using `@modelcontextprotocol/sdk`
      with stdio transport
- [x] Read `MONETA_AGENT_ID` and `MONETA_PROJECT_ID` from config at
      startup, inject into all tool handlers
- [x] Agent identity decomposition: parse `alice/code-reviewer` into
      `{created_by, engineer, agent_type}` per SPEC section 4.1

### Core tools

- [x] `tools/remember.ts`
  - [x] Accept `content`, `tags?`, `repo?`, `importance?`
  - [x] Validate content (non-empty, under `MAX_CONTENT_LENGTH`)
  - [x] Generate embedding
  - [x] Call `dedup_check()` — if same-agent near-dupe, update in
        place; if different-agent, insert with corroboration note
  - [x] Set `pinned = true` when `importance === "critical"`
  - [x] Return `{id, content, deduplicated}`
- [x] `tools/recall.ts`
  - [x] Accept `question`, `scope?`, `limit?`, `include_archived?`
  - [x] Generate embedding for question
  - [x] Call `recall()` SQL function with scope filters
  - [x] Call `touch_memories()` for returned IDs
  - [x] If `include_archived` and results include archived memories,
        set `archived = false` (promotion)
  - [x] Return results array with attribution per SPEC section 5.1

### Smoke test

- [ ] Manual end-to-end: connect via MCP client, `remember` 5
      facts, `recall` with a question, verify results make sense
- [ ] Verify dedup: `remember` the same fact twice from same agent,
      confirm update-in-place (row count stays at 5)
- [ ] Verify touch: `recall` a memory, check `last_accessed_at`
      updated in DB

---

## Phase 3: MCP Server — Complete

> **Goal:** All 6 MCP tools operational. Error handling solid.
> Ready for multi-engineer rollout.
>
> **Estimate:** 0.5 day
>
> **Done when:** All tools work, error cases return clear messages,
> and the server can be configured for any agent identity.

### Remaining tools

- [x] `tools/pin.ts` — set `pinned = true`, validate memory exists
- [x] `tools/unpin.ts` — set `pinned = false`, validate memory exists
      (separate from pin for MCP tool clarity)
- [x] `tools/forget.ts` — hard delete, validate memory exists
- [x] `tools/correct.ts` — update content + re-embed, validate
      memory exists, return old/new content

### Error handling

- [x] Memory-not-found errors return clear message with the ID
      that was requested
- [x] Embedding API failures return actionable error (not a stack
      trace)
- [x] Supabase connection failures return actionable error
- [x] Content validation: empty string, over max length, non-string
- [x] Log all tool invocations with agent_id + timestamp for
      observability (stderr, structured JSON)

### Integration test

- [x] Automated test script: create → search → pin → correct →
      unpin → forget lifecycle
- [x] Cross-agent test: Agent A remembers, Agent B recalls,
      Agent B corrects — verify attribution is preserved

---

## Phase 4: CLI — Read Path

> **Goal:** Humans can browse and search the memory store from
> the terminal. Read-only operations only — safe to hand to anyone.
>
> **Estimate:** 1 day
>
> **Done when:** `moneta search "question"`, `moneta list`, `moneta show`,
> and `moneta stats` all produce formatted output matching the mockups
> in SPEC section 7.2.

### CLI scaffolding

- [x] `packages/cli/src/index.ts` — entry point, arg parser
      (uses `commander`)
- [x] Config loading: reuse `packages/shared` config module
      (`context.ts` wraps `loadConfig` + `validateConfig` + `createDb`)
- [x] Output formatting helpers: table renderer, color/dim for
      terminal, `--json` flag support (`format.ts` with `picocolors`)
- [x] Short ID display: show first 6 chars of UUID in table views,
      accept prefix match for commands (`findMemoryByIdPrefix` in shared)

### Commands

- [x] `moneta search <question>` — semantic search with tabular output
  - [x] Flags: `--limit`, `--threshold`, `--agent`, `--engineer`,
        `--repo`, `--tags`, `--archived`, `--json`
  - [x] Output matches SPEC section 7.2 mockup
- [x] `moneta list` — chronological list with filters
  - [x] Flags: `--recent`, `--agent`, `--engineer`, `--repo`,
        `--tags`, `--pinned`, `--archived`, `--stale`, `--json`
  - [x] Footer shows total counts
- [x] `moneta show <id>` — full detail view of a single memory
  - [x] Accept full UUID or short prefix
  - [x] Output matches SPEC section 7.2 mockup
- [x] `moneta stats` — aggregate dashboard
  - [x] Total/active/archived/pinned counts
  - [x] Breakdown by engineer, repo, top tags
  - [x] Archival metrics (approaching stale, recently archived,
        promoted — shows "—" for untrackable metrics)
  - [x] Access patterns (searches today — shows "—", created today,
        most accessed)

---

## Phase 5: CLI — Write Path

> **Goal:** Full CLI management capability. Humans can pin, archive,
> correct, import, and export memories.
>
> **Estimate:** 1 day
>
> **Done when:** All management commands work. `moneta import` can
> seed a fresh project from a JSONL file. `moneta export` produces
> a valid backup.

### Management commands

- [x] `moneta pin <id>` — pin a memory, confirmation message
- [x] `moneta unpin <id>` — unpin a memory, confirmation message
- [x] `moneta archive <id>` — manually archive a memory
- [x] `moneta restore <id>` — restore from archive, reset access clock
- [x] `moneta forget <id>` — delete with `[y/N]` confirmation prompt
- [x] `moneta correct <id> <new-content>` — update content, show
      old/new diff

### Bulk operations

- [x] `moneta import <file>` — read JSONL, generate embeddings in
      batch, insert with dedup checks
  - [x] `--agent` flag to set `created_by` for imported entries
  - [x] Progress bar for large imports
  - [x] Summary: imported count, skipped duplicates
- [x] `moneta export` — dump memories as JSON to stdout
  - [x] `--active` (default) or `--all` (include archived)
  - [x] Include all fields except raw embedding vector

---

## Phase 6: TUI

> **Goal:** Interactive terminal UI for browsing and managing
> memories. This is the "power user" interface for engineers who
> want to understand what their agents know.
>
> **Estimate:** 2 days
>
> **Done when:** `moneta tui` launches an interactive interface with
> search mode, list mode, and stats mode. All keybindings from
> SPEC section 7.3 work.

### Framework setup

- [ ] Choose TUI framework (`ink` for React-like composition or
      `blessed`/`neo-blessed` for lower-level control — decide
      based on team familiarity)
- [ ] Basic app shell: header bar with project name + counts,
      footer bar with keybinding hints, main content area

### Search mode (default)

- [ ] Search input bar at top — type question, Enter to search
- [ ] Results list (left panel): similarity score, pin indicator,
      truncated content, attribution, relative time
- [ ] Detail panel (right panel): full content, all metadata,
      access stats
- [ ] `j`/`k` or arrow keys to navigate list
- [ ] Enter to toggle detail panel

### List mode

- [ ] `Tab` switches to chronological list mode
- [ ] Same list/detail layout but sorted by `created_at` desc
- [ ] Filter panel (`f` key): text inputs for agent, engineer,
      repo, tags; toggles for archived/pinned

### Inline actions

- [ ] `p` — pin/unpin selected memory (instant, no confirmation)
- [ ] `a` — archive/restore selected memory
- [ ] `d` — delete selected memory (inline confirmation prompt)
- [ ] `e` — open `$EDITOR` with memory content, save updates on
      close (calls correct flow: re-embed on save)
- [ ] `t` — tag editor: show current tags, add/remove

### Stats mode

- [ ] `Ctrl+S` switches to stats dashboard
- [ ] Render same data as `moneta stats` CLI command
- [ ] Auto-refresh on return from other modes

### Polish

- [ ] Responsive layout: handle narrow terminals gracefully
- [ ] Loading spinners for embedding generation / search
- [ ] Error display: non-crashing error messages for DB/API
      failures
- [ ] `?` / `F1` — help overlay with all keybindings

---

## Phase 7: Ops & Hardening

> **Goal:** Production-ready. Archival runs automatically, monitoring
> is in place, deployment is documented.
>
> **Estimate:** 0.5 day
>
> **Done when:** pg_cron reaper runs successfully on schedule,
> monitoring queries are saved, and a new engineer can set up the
> system from the README alone.

### Archival verification

- [ ] Verify pg_cron job is running on the Supabase instance
- [ ] Test archive_stale function: insert memories with old
      `last_accessed_at`, run function, confirm they're archived
- [ ] Test pinned memories are NOT archived by the reaper
- [ ] Test archive promotion: `recall` with `include_archived`,
      confirm memory moves back to active

### Monitoring

- [ ] Create saved SQL queries (or Supabase dashboard panels) for
      the 5 metrics from SPEC section 10:
  - [ ] Memory growth rate (daily)
  - [ ] Average search similarity score
  - [ ] Active/archived ratio
  - [ ] Hot memories (top access_count)
  - [ ] Orphaned memories (access_count = 0 after 7+ days)

### Documentation

- [ ] `README.md` — project overview, quickstart, architecture
      diagram
- [ ] MCP client configuration examples for: Claude, Cursor,
      OpenCode (the three most likely clients)
- [ ] Agent prompt guidance: how to instruct agents to use
      `remember` and `recall` effectively (what makes a good memory,
      when to call remember, when to use scoping)
- [ ] Deployment guide: Supabase setup, env vars, running the
      MCP server, installing the CLI

---

## Phase Dependencies

```
Phase 1: Foundation
    │
    ▼
Phase 2: MCP Server MVP ◄── dogfood with 1 engineer here
    │
    ▼
Phase 3: MCP Server Complete ◄── roll out to team here
    │
    ├──────────────────┐
    ▼                  ▼
Phase 4: CLI Read    Phase 6: TUI (can start in parallel
    │                  with Phase 4-5 if two engineers)
    ▼
Phase 5: CLI Write
    │
    └──────────────────┐
                       ▼
                Phase 7: Ops & Hardening
```

**Critical path:** Phases 1 → 2 → 3 → 7 (4 days to production
MCP server).

**Parallelizable:** Phases 4-5 (CLI) and Phase 6 (TUI) can be
built concurrently by different engineers after Phase 3 is done.

---

## Dogfooding Milestones

| After Phase | Who Uses It | How |
|---|---|---|
| **2** | 1 engineer, 1-2 agents | MCP client connected, manual testing, collecting feedback on recall quality and dedup behavior |
| **3** | Full team, all agents | MCP server deployed for team. Agents configured with `remember`/`recall`. Observe memory growth and search patterns. |
| **4** | Team leads / curious engineers | CLI for browsing what agents have learned. `moneta stats` in standups to review agent knowledge. |
| **6** | Anyone managing memory | TUI as the daily driver for memory hygiene. Pin important memories, clean up noise, review stale entries. |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Search quality degrades with volume** — single `project_id` with 10k+ memories may cause HNSW to return less relevant results | Medium | High | Load test with synthetic memories at Phase 2 dogfood. Tune HNSW params (`m`, `ef_construction`). Add reranking later if needed. |
| **Embedding API latency spikes** — every `remember` and `recall` hits OpenAI, which can be slow under load | Medium | Medium | Measure p95 latency at Phase 2. If >500ms, add an embedding cache (content hash → vector) or switch to local model via Ollama. |
| **Agents store junk** — without guardrails, agents may flood memory with low-value entries | High | Medium | Monitor orphaned memories (access_count = 0 after 7d) at Phase 7. If noisy, add content quality heuristics or per-agent rate limits. |
| **Dedup false positives** — 0.95 threshold may incorrectly merge distinct memories | Low | Medium | Log all dedup events. Review at Phase 2 dogfood. Lower threshold to 0.97 if false positives appear. |
| **pg_cron not available** — some Supabase plans don't include pg_cron | Low | Low | Fall back to external cron calling `archive_stale()` via Supabase RPC. |
