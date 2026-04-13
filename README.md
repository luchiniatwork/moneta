<a id="readme-top"></a>

<h3 align="center">Moneta</h3>

<p align="center">
  Shared persistent memory for AI coding agents
  <br />
  <a href="SPEC.md"><strong>Read the full specification »</strong></a>
</p>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#about-the-project">About The Project</a></li>
    <li><a href="#built-with">Built With</a></li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
        <li><a href="#configuration">Configuration</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#project-structure">Project Structure</a></li>
    <li><a href="#development">Development</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
  </ol>
</details>

## About The Project

Moneta is a shared, persistent memory system for AI coding agents. Agents store
short factual entries ("memories") and retrieve them via natural-language
questions. The system is designed for multiple engineers, each running multiple
agents concurrently, all contributing to and reading from the same
project-scoped memory pool.

**Design principles:**

- **Shared by default.** All agents in a project see all memories. Scoping
  narrows the view; it never widens it.
- **Agents write facts, not conversations.** Memories are pre-distilled by
  the agent — no LLM extraction pipeline.
- **Search is a question.** Agents ask natural-language questions and get
  relevant memories back, ranked by semantic similarity.
- **Stale memories retire gracefully.** Memories not accessed recently are
  archived, not deleted. Archived memories can be searched explicitly and
  promoted back to active.
- **Zero new infrastructure.** Everything runs on PostgreSQL with pgvector.
  No separate vector database, no graph database, no additional services
  beyond the MCP server itself.

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Agent Fleet                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│  │Agent A-1│ │Agent A-2│ │Agent B-1│ │  Auto-1 │  ...   │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘        │
│       └──────┬─────┘──────────┘────────────┘             │
│              │ MCP Protocol                               │
│              ▼                                            │
│  ┌───────────────────────┐                                │
│  │    MCP Server         │  Tools: remember, recall,      │
│  │    (TypeScript)       │  pin, unpin, forget, correct   │
│  └───────────┬───────────┘                                │
│              │ PostgreSQL client                           │
│              ▼                                            │
│  ┌───────────────────────────────────────────┐            │
│  │       PostgreSQL + pgvector               │            │
│  │  project_memory table + HNSW index        │            │
│  │  recall(), dedup_check(), archive_stale() │            │
│  │  pg_cron: daily archive reaper            │            │
│  └───────────────────────────────────────────┘            │
│              ▲                                            │
│  ┌───────────┴───────────┐                                │
│  │    CLI / TUI          │  Human admin interface          │
│  │    (Direct DB access) │                                │
│  └───────────────────────┘                                │
└──────────────────────────────────────────────────────────┘
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Built With

- [TypeScript](https://www.typescriptlang.org/) — strict mode with
  `noUncheckedIndexedAccess`
- [Bun](https://bun.sh/) — runtime, package manager, and test runner
- [PostgreSQL](https://www.postgresql.org/) +
  [pgvector](https://github.com/pgvector/pgvector) — storage and vector search
- [Supabase](https://supabase.com/) — managed PostgreSQL hosting with pg_cron
- [Kysely](https://kysely.dev/) — type-safe SQL query builder
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings) —
  `text-embedding-3-small` (1536 dimensions)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started

### Prerequisites

Install one of the following:

- **Nix** (recommended): The included `flake.nix` provides Bun, Supabase CLI,
  and PostgreSQL automatically.
  ```sh
  nix develop
  ```
- **Manual**: Install [Bun](https://bun.sh/),
  [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started), and
  PostgreSQL individually.

You also need an [OpenAI API key](https://platform.openai.com/api-keys) for
embedding generation.

### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/your-org/moneta.git
   cd moneta
   ```
2. Install dependencies
   ```sh
   bun install
   ```
3. Start the local Supabase instance and apply migrations
   ```sh
   bun run db:start
   ```
4. Set up environment variables (see [Configuration](#configuration) below)

### Configuration

Moneta reads configuration from environment variables, falling back to
`~/.moneta/config.json`, falling back to built-in defaults.

#### Environment variables

| Variable                     | Required | Description                                            |
| ---------------------------- | -------- | ------------------------------------------------------ |
| `MONETA_PROJECT_ID`          | yes      | Project identifier (e.g. `"acme-platform"`)            |
| `MONETA_DATABASE_URL`        | yes      | PostgreSQL connection string                           |
| `OPENAI_API_KEY`             | yes      | OpenAI API key for embeddings                          |
| `MONETA_AGENT_ID`            | yes\*    | Agent identity (e.g. `"alice/code-reviewer"`)          |
| `MONETA_EMBEDDING_MODEL`     | no       | Embedding model (default: `text-embedding-3-small`)    |
| `MONETA_ARCHIVE_AFTER_DAYS`  | no       | Days before archival (default: `30`)                   |
| `MONETA_DEDUP_THRESHOLD`     | no       | Similarity threshold for dedup (default: `0.95`)       |
| `MONETA_SEARCH_THRESHOLD`    | no       | Min similarity for search results (default: `0.30`)    |
| `MONETA_SEARCH_LIMIT`        | no       | Default search result limit (default: `10`)            |
| `MONETA_MAX_CONTENT_LENGTH`  | no       | Max characters per memory (default: `2000`)            |

\*`MONETA_AGENT_ID` is required for the MCP server, not the CLI.

#### Config file

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

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage

### MCP Server (agent-facing)

The MCP server exposes six tools to AI coding agents via the
[Model Context Protocol](https://modelcontextprotocol.io/):

| Tool          | Description                                                          |
| ------------- | -------------------------------------------------------------------- |
| **remember**  | Store a new memory. Auto-deduplicates against existing entries.       |
| **recall**    | Search memories by natural-language question with optional scoping.   |
| **pin**       | Mark a memory as never-archive.                                      |
| **unpin**     | Remove the never-archive mark.                                       |
| **forget**    | Permanently delete a memory.                                         |
| **correct**   | Update a memory's content and re-generate its embedding.             |

See [SPEC.md, section 5](SPEC.md#5-mcp-server) for full parameter details and
behavior.

### CLI (human-facing)

The `moneta` CLI connects directly to PostgreSQL for browsing and managing
memories.

```sh
# Semantic search — same operation agents use
moneta search "How does authentication work?"

# List recent memories
moneta list --recent 20

# Full detail of a single memory
moneta show a1b2c3

# Management
moneta pin a1b2c3
moneta unpin a1b2c3
moneta forget d4e5f6
moneta correct a1b2c3 "Updated fact text"

# Aggregate dashboard
moneta stats

# Bulk import/export
moneta import seeds.jsonl --agent "admin/import"
moneta export --active > backup.json

# Interactive terminal UI
moneta tui
```

See [SPEC.md, section 7](SPEC.md#7-cli--tui) for full command reference and TUI
keybindings.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Project Structure

```
moneta/
├── packages/
│   ├── shared/              # Core library (config, db, embeddings, identity, types)
│   ├── mcp-server/          # MCP server exposing tools to agents
│   └── cli/                 # CLI/TUI for human management
├── supabase/
│   └── migrations/          # PostgreSQL schema, indexes, functions, cron jobs
├── package.json             # Bun workspace root
├── tsconfig.json            # Shared TypeScript config (strict mode)
├── biome.json               # Linting and formatting
├── SPEC.md                  # Full system specification
└── TODO.md                  # Phased build plan
```

Packages reference each other via `workspace:*` dependencies. The
`@moneta/shared` package is the foundation used by both `mcp-server` and `cli`.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Development

```sh
bun install              # install all dependencies
bun run typecheck        # type-check all packages
bun run lint             # lint with Biome
bun run lint:fix         # auto-fix lint issues
bun run format           # format with Biome

# Tests (Bun's built-in test runner)
bun test                                                # run all tests
bun test packages/shared/src/__tests__/config.test.ts   # run a single test file
bun test --grep "pattern"                               # run tests matching a pattern

# Local database
bun run db:start         # start local Supabase
bun run db:stop          # stop local Supabase
bun run db:reset         # reset database and re-run migrations
```

See [AGENTS.md](AGENTS.md) for code style guidelines and conventions.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Roadmap

- [x] **Phase 1: Foundation** — Monorepo scaffolding, database schema, shared
  library
- [ ] **Phase 2: MCP Server MVP** — `remember` and `recall` tools
- [ ] **Phase 3: MCP Server Complete** — All 6 tools, error handling
- [ ] **Phase 4: CLI Read Path** — `search`, `list`, `show`, `stats`
- [ ] **Phase 5: CLI Write Path** — `pin`, `forget`, `correct`, `import`,
  `export`
- [ ] **Phase 6: TUI** — Interactive terminal interface
- [ ] **Phase 7: Ops & Hardening** — Archival verification, monitoring,
  deployment docs

See [TODO.md](TODO.md) for the detailed build plan with task breakdowns.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

Distributed under the Unlicense. See [`LICENSE.txt`](LICENSE.txt) for more
information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>
