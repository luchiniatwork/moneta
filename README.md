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
    <li><a href="#quick-start">Quick Start</a></li>
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
    <li><a href="#agent-skills">Agent Skills</a></li>
    <li><a href="#project-structure">Project Structure</a></li>
    <li><a href="#development">Development</a></li>
    <li>
      <a href="#docker">Docker</a>
      <ul>
        <li><a href="#production-compose">Production Compose</a></li>
      </ul>
    </li>
    <li><a href="#deploying-to-supabase">Deploying to Supabase</a></li>
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
│              │ HTTP (REST API)                             │
│  ┌───────────┴───────────┐                                │
│  │    CLI / TUI          │  Human admin interface          │
│  │    (TypeScript)       │                                │
│  └───────────┬───────────┘                                │
│              │ HTTP (REST API)                             │
│              ▼                                            │
│  ┌───────────────────────────────────────────┐            │
│  │    REST API Server (Hono)                 │            │
│  │    Embeddings, dedup, business logic      │            │
│  └───────────┬───────────────────────────────┘            │
│              │ PostgreSQL client + OpenAI                  │
│              ▼                                            │
│  ┌───────────────────────────────────────────┐            │
│  │       PostgreSQL + pgvector               │            │
│  │  project_memory table + HNSW index        │            │
│  │  recall(), dedup_check(), archive_stale() │            │
│  │  pg_cron: daily archive reaper            │            │
│  └───────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────┘
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Quick Start

Get Moneta running in under 5 minutes using Docker Compose and the MCP server
from npm.

**1. Start the API server and database:**

```sh
export OPENAI_API_KEY=sk-...        # required for embeddings

docker compose up -d
```

This starts a PostgreSQL + pgvector database and the Moneta REST API on
`http://localhost:3000`. Migrations are applied automatically. The API server
is multi-tenant — it does not require a project ID. Clients identify their
project via the `X-Project-Id` header on each request.

**2. Configure your AI coding agent:**

Add the MCP server to your agent's config (Claude Desktop, Cursor, Windsurf,
OpenCode, etc.):

```json
{
  "mcpServers": {
    "moneta": {
      "command": "npx",
      "args": ["@luchiniatwork22/moneta-mcp-server"],
      "env": {
        "MONETA_PROJECT_ID": "my-project",
        "MONETA_API_URL": "http://localhost:3000/api/v1",
        "MONETA_AGENT_ID": "alice/code-reviewer"
      }
    }
  }
}
```

**3. (Optional) Install the CLI for human access:**

```sh
npx @luchiniatwork22/moneta-cli recall "How does authentication work?"
```

That's it. Your agents can now `remember` facts and `recall` them across
sessions. See [Configuration](#configuration) for all available options and
[Usage](#usage) for the full tool and command reference.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Built With

- [TypeScript](https://www.typescriptlang.org/) — strict mode with
  `noUncheckedIndexedAccess`
- [Bun](https://bun.sh/) — runtime, package manager, and test runner
- [Hono](https://hono.dev/) — lightweight REST API framework
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

> **Prerequisite:** The CLI and MCP server connect to the Moneta REST API over
> HTTP. You need a running API server first — see [Quick Start](#quick-start)
> or [Docker](#docker) for setup options.

Install the CLI globally:

```sh
npm install -g @luchiniatwork22/moneta-cli
```

Or run directly with `npx` / `bunx`:

```sh
npx @luchiniatwork22/moneta-cli recall "How does authentication work?"
bunx @luchiniatwork22/moneta-cli list --recent 10
```

Once installed globally, the command is simply `moneta`:

```sh
moneta recall "How does authentication work?"
moneta list --recent 10
```

To set up the MCP server for your AI coding agent:

```sh
npx @luchiniatwork22/moneta-mcp-server
```

#### From source (contributors)

1. Clone the repo
   ```sh
   git clone https://github.com/luchiniatwork/moneta.git
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

Moneta resolves configuration by merging multiple sources (highest priority
first):

| Priority | Source | Description |
| -------- | ------ | ----------- |
| 1 | CLI flags / overrides | `--project-id`, `--agent-id` |
| 2 | Environment variables | Real shell env vars, then `.env` file in CWD |
| 3 | Project config | `.moneta/config.json` found by walking up from CWD |
| 4 | Global config | `~/.moneta/config.json` |
| 5 | Built-in defaults | Sensible defaults for optional fields |

This means you can set shared defaults globally, override per-project with a
`.moneta/config.json` or `.env` file, and override per-invocation with
environment variables or CLI flags.

#### Environment variables

**API Server** (requires database + OpenAI access):

The API server is multi-tenant — it does not require `MONETA_PROJECT_ID`.
Clients provide the project identifier via the `X-Project-Id` header on each
request.

| Variable                     | Required | Description                                            |
| ---------------------------- | -------- | ------------------------------------------------------ |
| `MONETA_DATABASE_URL`        | yes      | PostgreSQL connection string                           |
| `OPENAI_API_KEY`             | yes      | OpenAI API key for embeddings                          |
| `MONETA_API_PORT`            | no       | Port to listen on (default: `3000`)                    |
| `MONETA_API_KEY`             | no       | If set, all non-health requests require `Authorization: Bearer` |
| `MONETA_EMBEDDING_MODEL`     | no       | Embedding model (default: `text-embedding-3-small`)    |
| `MONETA_ARCHIVE_AFTER_DAYS`  | no       | Days before archival (default: `30`)                   |
| `MONETA_DEDUP_THRESHOLD`     | no       | Similarity threshold for dedup (default: `0.95`)       |
| `MONETA_SEARCH_THRESHOLD`    | no       | Min similarity for search results (default: `0.30`)    |
| `MONETA_SEARCH_LIMIT`        | no       | Default search result limit (default: `10`)            |
| `MONETA_MAX_CONTENT_LENGTH`  | no       | Max characters per memory (default: `2000`)            |

**Clients** (MCP server, CLI — connect to the REST API):

| Variable                     | Required | Description                                            |
| ---------------------------- | -------- | ------------------------------------------------------ |
| `MONETA_PROJECT_ID`          | yes      | Project identifier, sent via `X-Project-Id` header     |
| `MONETA_API_URL`             | yes      | REST API base URL (e.g. `http://localhost:3000/api/v1`)|
| `MONETA_API_KEY`             | no       | API key if the server requires authentication          |
| `MONETA_AGENT_ID`            | yes\*    | Agent identity (e.g. `"alice/code-reviewer"`)          |

\*`MONETA_AGENT_ID` is required for the MCP server, not the CLI.
The CLI also accepts `--project-id <id>` to override `MONETA_PROJECT_ID`.

#### `.env` file

Place a `.env` file in your project directory. Moneta reads it automatically
when the CLI or MCP server is run from that directory. Standard dotenv syntax
is supported (`KEY=VALUE`, `#` comments, quoted values, `export` prefix).
Real environment variables always take precedence over `.env` values.

```sh
# .env — per-project client config
MONETA_PROJECT_ID=acme-platform
MONETA_API_URL=http://localhost:3000/api/v1
MONETA_API_KEY=secret-key
MONETA_AGENT_ID=alice/reviewer
```

#### Config file

Moneta looks for `.moneta/config.json` in the current directory and walks up
parent directories until it finds one (project config). It also reads
`~/.moneta/config.json` (global config). Project config values take precedence
over global config.

```json
{
  "project_id": "acme-platform",
  "api_url": "http://localhost:3000/api/v1",
  "api_key": "secret-key",
  "agent_id": "alice/reviewer"
}
```

All available config file keys (snake_case):

| Key                    | Description                                              |
| ---------------------- | -------------------------------------------------------- |
| `project_id`           | Project identifier                                       |
| `api_url`              | REST API base URL                                        |
| `api_key`              | API key for authentication                               |
| `agent_id`             | Agent identity                                           |
| `database_url`         | PostgreSQL connection string (server only)                |
| `openai_api_key`       | OpenAI API key (server only)                             |
| `embedding_model`      | Embedding model (default: `text-embedding-3-small`)      |
| `archive_after_days`   | Days before archival (default: `30`)                     |
| `dedup_threshold`      | Similarity threshold for dedup (default: `0.95`)         |
| `search_threshold`     | Min similarity for search results (default: `0.30`)      |
| `search_limit`         | Default search result limit (default: `10`)              |
| `max_content_length`   | Max characters per memory (default: `2000`)              |

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
      "args": ["@luchiniatwork22/moneta-mcp-server"],
      "env": {
        "MONETA_PROJECT_ID": "my-project",
        "MONETA_API_URL": "http://localhost:3000/api/v1",
        "MONETA_AGENT_ID": "alice/code-reviewer"
      }
    }
  }
}
```

> **Note:** The MCP server connects to the REST API server over HTTP — it does
> not access the database or OpenAI directly. You must have a running API server
> (see [Quick Start](#quick-start)) before starting the MCP server. Add
> `MONETA_API_KEY` to the `env` block if the API server requires authentication.

See [SPEC.md, section 5](SPEC.md#5-mcp-server) for full parameter details and
behavior.

### CLI (human-facing)

The `moneta` CLI connects to the REST API server for browsing and managing
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

## Agent Skills

Moneta provides installable [agent skills](https://skills.sh) that teach AI
coding agents how to use Moneta proactively — recalling relevant memories at
the start of tasks and remembering discoveries as they work.

Two skills are available, depending on how your agent connects to Moneta:

| Skill                | Interface    | Use when...                                      |
| -------------------- | ------------ | ------------------------------------------------ |
| `moneta-memory-mcp`  | MCP tools    | Your agent connects to the Moneta MCP server     |
| `moneta-memory-cli`  | CLI commands | Your agent runs `moneta` commands via bash        |

### Installing a skill

```sh
# Interactive — pick your skill and target agent
npx skills add luchiniatwork/moneta

# Install a specific skill to a specific agent
npx skills add luchiniatwork/moneta --skill moneta-memory-mcp --agent opencode
npx skills add luchiniatwork/moneta --skill moneta-memory-cli --agent claude-code
```

Both skills teach the same proactive memory habits. Choose the one that matches
your agent's integration method.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Project Structure

```
moneta/
├── packages/
│   ├── shared/              # Core library (config, db, embeddings, identity, types)
│   ├── api-server/          # Hono REST API server (owns DB + embeddings)
│   ├── api-client/          # Zero-dep HTTP client for the REST API
│   ├── mcp-server/          # MCP server exposing tools to agents (via API)
│   └── cli/                 # CLI/TUI for human management (via API)
├── agent-skills/            # Installable agent skills (via npx skills add)
│   ├── moneta-memory-mcp/   # Skill: use Moneta via MCP tools
│   └── moneta-memory-cli/   # Skill: use Moneta via CLI commands
├── supabase/
│   └── migrations/          # PostgreSQL schema, indexes, functions, cron jobs
├── Dockerfile               # Multi-stage build for the API server
├── docker-compose.yml       # Local dev: API server + PostgreSQL
├── docker-compose.prod.yml  # Production: hardened API server + optional DB
├── package.json             # Bun workspace root
├── tsconfig.json            # Shared TypeScript config (strict mode)
├── biome.json               # Linting and formatting
├── SPEC.md                  # Full system specification
└── TODO.md                  # Phased build plan
```

### npm packages

| Package              | npm name                            | Binary command       | Description                        |
| -------------------- | ----------------------------------- | -------------------- | ---------------------------------- |
| `packages/cli`       | `@luchiniatwork22/moneta-cli`         | `moneta`             | CLI/TUI for human management       |
| `packages/mcp-server`| `@luchiniatwork22/moneta-mcp-server`  | `moneta-mcp-server`  | MCP server for AI coding agents    |
| `packages/shared`    | ---                                 | ---                  | Internal library, bundled at build  |

Packages reference each other via `workspace:*` dependencies. The `shared`
package provides database and embedding access, used only by `api-server`. The
`api-client` package provides an HTTP client used by `mcp-server` and `cli` to
communicate with the REST API. Both workspace packages are bundled inline at
build time (not published separately).

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

# API server (local development)
bun run dev:api          # start API server with --watch

# Docker
bun run docker:build     # build the API server Docker image
bun run docker:up        # start API server + PostgreSQL via docker compose
bun run docker:down      # stop docker compose services

# Local database (Supabase)
bun run db:start         # start local Supabase
bun run db:stop          # stop local Supabase
bun run db:reset         # reset database and re-run migrations
```

### Build system

Both `@luchiniatwork22/moneta-cli` and `@luchiniatwork22/moneta-mcp-server` are
built using Bun's bundler. Each package has a `build.ts` script that:

1. Bundles the package entry point with the `shared` package inlined
2. Externalizes all npm dependencies (installed at runtime by the end user)
3. Outputs a single `dist/index.js` file with a `#!/usr/bin/env node` shebang

```sh
bun run build            # build all packages
bun run build:cli        # build CLI only
bun run build:mcp        # build MCP server only
```

See [AGENTS.md](AGENTS.md) for code style guidelines and conventions.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Docker

The API server is published to Docker Hub as
[`luchiniatwork/moneta-api`](https://hub.docker.com/r/luchiniatwork/moneta-api).

### Pull and run

```sh
docker pull luchiniatwork/moneta-api
docker run -d \
  -p 3000:3000 \
  -e MONETA_DATABASE_URL=postgresql://user:pass@host:5432/dbname \
  -e OPENAI_API_KEY=sk-... \
  luchiniatwork/moneta-api
```

The API server is multi-tenant — it does not require `MONETA_PROJECT_ID`.
Clients identify their project via the `X-Project-Id` header on each request.

### Docker Compose (API + PostgreSQL)

For a complete local setup with the database included, use the provided
`docker-compose.yml`:

```sh
# Set required env vars
export OPENAI_API_KEY=sk-...

# Start API server + pgvector database
docker compose up -d

# Stop services
docker compose down
```

The compose file starts a `pgvector/pgvector:pg16` database and the API server
on port 3000. Migrations are applied automatically on first start. Set
`MONETA_API_KEY` to require authentication on all API requests (the
`/health` endpoint is always unauthenticated).

### Production Compose

For production deployments, use `docker-compose.prod.yml`. It pulls a pre-built
image from a registry, enforces required environment variables, and applies
security hardening (read-only filesystem, resource limits, no-new-privileges).

```sh
# Create a .env file with required variables
cat > .env <<EOF
MONETA_IMAGE=luchiniatwork/moneta-api:latest
MONETA_DATABASE_URL=postgresql://user:pass@db-host:5432/moneta
OPENAI_API_KEY=sk-...
MONETA_API_KEY=your-secret-key
EOF

# Start the API server (database is external)
docker compose -f docker-compose.prod.yml up -d
```

If you don't have an external database, start one alongside the API using the
`db` profile:

```sh
# Add database credentials to .env
cat >> .env <<EOF
POSTGRES_USER=moneta
POSTGRES_PASSWORD=a-strong-password
EOF

# Start API + self-hosted PostgreSQL
docker compose -f docker-compose.prod.yml --profile db up -d
```

Key differences from the development compose file:

| Concern          | `docker-compose.yml` (dev)       | `docker-compose.prod.yml`              |
| ---------------- | -------------------------------- | -------------------------------------- |
| API image        | `build: .` (local build)         | Pre-built from registry                |
| Database         | Always started                   | Optional (`--profile db`)              |
| DB credentials   | Hardcoded defaults               | Required via environment               |
| DB port          | Exposed to host (`:5432`)        | Internal only                          |
| Secrets          | Optional / defaults              | Enforced (compose refuses to start)    |
| Resource limits  | None                             | Memory + CPU caps                      |
| Filesystem       | Read-write                       | Read-only + tmpfs                      |
| Restart policy   | None                             | `unless-stopped`                       |
| Logging          | Docker default (unbounded)       | `json-file` with size/rotation caps    |

## Deploying to Supabase

Moneta uses PostgreSQL with pgvector -- it has no runtime dependency on Supabase
SDKs, Auth, Storage, or Edge Functions. You can use
[Supabase](https://supabase.com/) as a managed PostgreSQL host for the database
and deploy the API server separately.

All database objects live in a dedicated `moneta` schema, so Moneta can safely
share a database with other applications (including an existing Supabase
project) without naming conflicts.

### 1. Set up the database

Create a Supabase project (or use an existing one), then apply the migrations.

**Option A -- Supabase CLI:**

```sh
# Link to your remote project
supabase link --project-ref <your-project-ref>

# Push all migrations
supabase db push
```

**Option B -- SQL Editor:**

Paste each migration file into the Supabase Dashboard SQL Editor and run them in
order:

1. `supabase/migrations/20260410000001_create_project_memory.sql`
2. `supabase/migrations/20260410000002_create_indexes.sql`
3. `supabase/migrations/20260410000003_create_functions.sql`
4. `supabase/migrations/20260410000004_create_cron_jobs.sql`

Grab your **database connection string** from Supabase Dashboard > Settings >
Database > Connection string (URI format).

> **Note:** Supabase includes both `pgvector` and `pg_cron` out of the box, so
> all migrations will succeed and the daily archival cron job will run
> automatically.

### 2. Deploy the API server

The API server is a long-running Bun process -- it cannot run as a Supabase Edge
Function. Deploy it on any Docker-capable host (Fly.io, Railway, Render, Cloud
Run, a VPS, etc.):

```sh
docker pull luchiniatwork/moneta-api
docker run -d \
  -p 3000:3000 \
  -e MONETA_DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres \
  -e OPENAI_API_KEY=sk-... \
  -e MONETA_API_KEY=your-secret-key \
  luchiniatwork/moneta-api
```

Replace the `MONETA_DATABASE_URL` with your Supabase connection string. The API
server automatically sets `search_path = moneta, public` on the database
connection, so no additional configuration is needed. The server is multi-tenant
— clients provide their project ID via the `X-Project-Id` header.

### 3. Connect your agents

Point the MCP server and CLI at your deployed API server:

```json
{
  "mcpServers": {
    "moneta": {
      "command": "npx",
      "args": ["@luchiniatwork22/moneta-mcp-server"],
      "env": {
        "MONETA_PROJECT_ID": "my-project",
        "MONETA_API_URL": "https://your-api-host.example.com/api/v1",
        "MONETA_API_KEY": "your-secret-key",
        "MONETA_AGENT_ID": "alice/code-reviewer"
      }
    }
  }
}
```

### Colocation with an existing Supabase project

Since all Moneta objects live in the `moneta` schema (not `public`), you can
safely apply the migrations to a database that already hosts another application.
The `moneta.project_memory` table, `moneta.recall()` function, and all other
objects will not conflict with your existing tables or with Supabase's internal
schemas (`auth`, `storage`, etc.).

The only shared resource is the `pgvector` extension, which is database-wide and
safe to share. If your existing project already has pgvector enabled, the
`CREATE EXTENSION IF NOT EXISTS vector` statement is a no-op.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Publishing

Both `@luchiniatwork22/moneta-cli` and `@luchiniatwork22/moneta-mcp-server` are
published to the npm registry. The `shared` and `api-client` packages are
**not** published -- they are bundled into each package at build time.

The API server Docker image is published to Docker Hub as
`luchiniatwork/moneta-api`.

### Automated releases (GitHub Actions)

Pushing a semver tag triggers the
[release workflow](.github/workflows/release.yml), which:

1. Runs typecheck, lint, and tests (quality gate)
2. Builds and publishes both npm packages with the tag version
3. Builds and pushes the Docker image tagged with the version and `latest`

To create a release:

```sh
# 1. Commit your changes
git add -A && git commit -m "prepare release"

# 2. Tag with a semver version
git tag v1.0.0

# 3. Push the tag — this triggers the release workflow
git push origin v1.0.0
```

### Required GitHub secrets

| Secret              | Description                                      |
| ------------------- | ------------------------------------------------ |
| `NPM_TOKEN`         | npm access token with publish permission         |
| `DOCKERHUB_USERNAME` | Docker Hub username                             |
| `DOCKERHUB_TOKEN`    | Docker Hub access token                         |

### Manual publishing

If you need to publish manually without the CI workflow:

```sh
# Build
bun run build

# Verify contents
npm pack --dry-run -w packages/cli
npm pack --dry-run -w packages/mcp-server

# Publish
npm publish -w packages/cli --access public
npm publish -w packages/mcp-server --access public

# Docker
docker build -t luchiniatwork/moneta-api .
docker push luchiniatwork/moneta-api
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Roadmap

- [x] **Phase 1: Foundation** — Monorepo scaffolding, database schema, shared
  library
- [x] **Phase 2: MCP Server MVP** — `remember` and `recall` tools
- [x] **Phase 3: MCP Server Complete** — All 6 tools, error handling
- [x] **Phase 4: CLI Read Path** — `search`, `list`, `show`, `stats`
- [x] **Phase 5: CLI Write Path** — `pin`, `forget`, `correct`, `import`,
  `export`
- [x] **Phase 6: TUI** — Interactive terminal interface
- [ ] **Phase 7: Ops & Hardening** — Archival verification, monitoring,
  deployment docs
- [x] **Phase 8: REST API Server** — Hono REST API, API client, MCP/CLI
  refactor, Docker

See [TODO.md](TODO.md) for the detailed build plan with task breakdowns.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

Distributed under the MIT License. See [`LICENSE.txt`](LICENSE.txt) for more
information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>
