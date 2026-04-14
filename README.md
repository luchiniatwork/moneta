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
    <li><a href="#publishing">Publishing</a></li>
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
│  ┌───────────────────────────────────────────────────────┐│
│  │       PostgreSQL + pgvector                           ││
│  │  project_memory table + HNSW index                    ││
│  │  recall(), dedup_check(), archive_stale()             ││
│  │  pg_cron: daily archive reaper                        ││
│  └───────────────────────────────────────────────────────┘│
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

#### From npm (end users)

Install the CLI globally:

```sh
npm install -g @moneta/cli
```

Or run directly with `npx` / `bunx`:

```sh
npx @moneta/cli recall "How does authentication work?"
bunx @moneta/cli list --recent 10
```

Once installed globally, the command is simply `moneta`:

```sh
moneta recall "How does authentication work?"
moneta list --recent 10
```

To set up the MCP server for your AI coding agent:

```sh
npx @moneta/mcp-server
```

#### From source (contributors)

1. Clone the repo
   ```sh
   git clone https://github.com/your-org/moneta.git
   cd moneta
   ```
2. Install dependencies
   ```sh
   bun install
   ```
3. Build the packages
   ```sh
   bun run build
   ```
4. Start the local Supabase instance and apply migrations
   ```sh
   bun run db:start
   ```
5. Set up environment variables (see [Configuration](#configuration) below)

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

Configure your AI tool (e.g. Claude Desktop, Cursor, Windsurf) to use the MCP
server:

```json
{
  "mcpServers": {
    "moneta": {
      "command": "npx",
      "args": ["@moneta/mcp-server"],
      "env": {
        "MONETA_PROJECT_ID": "my-project",
        "MONETA_DATABASE_URL": "postgresql://...",
        "MONETA_AGENT_ID": "alice/code-reviewer",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

See [SPEC.md, section 5](SPEC.md#5-mcp-server) for full parameter details and
behavior.

### CLI (human-facing)

The `moneta` CLI connects directly to PostgreSQL for browsing and managing
memories.

```sh
# Semantic search — same operation agents use
moneta recall "How does authentication work?"

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
moneta export --all > backup.json

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

### npm packages

| Package              | npm name             | Binary command       | Description                        |
| -------------------- | -------------------- | -------------------- | ---------------------------------- |
| `packages/cli`       | `@moneta/cli`        | `moneta`             | CLI/TUI for human management       |
| `packages/mcp-server`| `@moneta/mcp-server` | `moneta-mcp-server`  | MCP server for AI coding agents    |
| `packages/shared`    | —                    | —                    | Internal library, bundled at build  |

Packages reference each other via `workspace:*` dependencies. The
`@moneta/shared` package is the foundation used by both `mcp-server` and `cli`
and is bundled inline at build time (not published separately).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Development

```sh
bun install              # install all dependencies
bun run build            # build CLI and MCP server for distribution
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

### Build system

Both `@moneta/cli` and `@moneta/mcp-server` are built using Bun's bundler.
Each package has a `build.ts` script that:

1. Bundles the package entry point with `@moneta/shared` inlined
2. Externalizes all npm dependencies (installed at runtime by the end user)
3. Outputs a single `dist/index.js` file with a `#!/usr/bin/env node` shebang

```sh
bun run build            # build all packages
bun run build:cli        # build CLI only
bun run build:mcp        # build MCP server only
```

See [AGENTS.md](AGENTS.md) for code style guidelines and conventions.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Publishing

Both `@moneta/cli` and `@moneta/mcp-server` are published to the npm registry
under the `@moneta` scope. The `@moneta/shared` package is **not** published —
it is bundled into each package at build time.

### Prerequisites

1. You must be a member of the `@moneta` npm organization.
2. You must be logged in to npm:
   ```sh
   npm login
   ```

### Publish workflow

1. Build the packages:
   ```sh
   bun run build
   ```
2. Verify what will be published (the `files` field restricts it to `dist/`
   only):
   ```sh
   npm pack --dry-run -w packages/cli
   npm pack --dry-run -w packages/mcp-server
   ```
3. Bump versions as needed:
   ```sh
   npm version patch -w packages/cli
   npm version patch -w packages/mcp-server
   ```
4. Publish:
   ```sh
   npm publish -w packages/cli
   npm publish -w packages/mcp-server
   ```

Both packages have `"publishConfig": { "access": "public" }` so they are
published publicly by default.

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
