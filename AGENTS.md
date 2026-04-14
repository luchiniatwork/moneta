# AGENTS.md

Moneta is a shared persistent memory system for AI coding agents. It is a
TypeScript monorepo running on **Bun** with **Biome** for linting/formatting
and **PostgreSQL + pgvector** (via Supabase) for storage.

## Build & Development Commands

```bash
bun install                # install all dependencies
bun run typecheck          # type-check all packages (runs tsc --noEmit per package)
bun run lint               # lint with biome
bun run lint:fix           # auto-fix lint issues
bun run format             # format with biome

# Tests (Bun's built-in test runner)
bun test                                                  # run all tests
bun test packages/shared/src/__tests__/config.test.ts     # run a single test file
bun test --grep "pattern"                                 # run tests matching a pattern

# API server (local development)
bun run dev:api            # start REST API server with --watch

# Docker
bun run docker:build       # build the API server Docker image
bun run docker:up          # start API server + PostgreSQL via docker compose
bun run docker:down        # stop docker compose services

# Supabase (local database)
bun run db:start           # start local supabase
bun run db:stop            # stop local supabase
bun run db:reset           # reset database and re-run migrations
```

Always run `bun run typecheck` and `bun run lint` before considering work done.

## Monorepo Structure

```
packages/
  shared/        # Core library: config, database, embeddings, identity, types
  api-server/    # Hono REST API server (owns DB + OpenAI, serves all clients)
  api-client/    # Zero-dep HTTP client for the REST API
  mcp-server/    # MCP server exposing tools (thin adapter over REST API)
  cli/           # CLI/TUI for human management (via REST API)
supabase/
  migrations/    # PostgreSQL migration files (pgvector, cron jobs)
```

Packages reference each other via `workspace:*` dependencies and Bun workspaces.
The `@moneta/shared` package is used only by `api-server`. The `@moneta/api-client`
package provides the HTTP client used by `mcp-server` and `cli`.

## Code Style

### Formatting (enforced by Biome)

- 2-space indentation, 100-character line width
- No semicolons (Biome `"semicolons": "asNeeded"`)
- Double quotes for all strings
- Biome organizes imports automatically on `lint:fix`/`format`

### Imports

- **Order**: Node.js built-ins, third-party, local (Biome enforces this)
- **Node built-ins** must use the `node:` prefix: `import { join } from "node:path"`
- **Type-only imports** must use `import type` (enforced by `verbatimModuleSyntax`):
  ```ts
  import type { Config } from "./types.ts"
  ```
- **Relative imports** must include the `.ts` extension:
  ```ts
  import { loadConfig } from "./config.ts"
  ```
- **No path aliases** in source; all local imports are relative

### Naming Conventions

| Construct                  | Convention         | Example                          |
| -------------------------- | ------------------ | -------------------------------- |
| Functions, variables       | camelCase          | `loadConfig`, `configPath`       |
| Interfaces, types, classes | PascalCase         | `AgentIdentity`, `RecallResult`  |
| Constants                  | UPPER_SNAKE_CASE   | `DEFAULTS`                       |
| Database columns           | snake_case         | `project_id`, `last_accessed_at` |
| Config file keys (JSON)    | snake_case         | `database_url`, `openai_api_key` |

There is a deliberate **snake_case/camelCase boundary**: database tables and config
files use snake_case, while all application-layer code uses camelCase. A mapping
function (e.g. `mapRecallRow`) bridges the two at the boundary.

### Types

- Use `interface` for object shapes (domain models, configs, parameters)
- Use `type` for unions, computed types, and Kysely derivations (`Selectable<T>`, etc.)
- Always declare **explicit return types** on functions (both exported and private)
- Use `as const` for constant objects that should have literal types
- Minimize type assertions; use them only at serialization boundaries

### TypeScript Strictness

The project uses `strict: true` plus additional flags. Pay special attention to:

- **`noUncheckedIndexedAccess`**: Array/object index access returns `T | undefined`.
  Always handle the `undefined` case.
- **`noFallthroughCasesInSwitch`**: Every `case` must `break` or `return`.
- **`noImplicitOverride`**: Use the `override` keyword when overriding base methods.
- **`verbatimModuleSyntax`**: Must use `import type` for type-only imports.

### Functions

- Use `function` declarations for all named functions (not arrow functions)
- Use arrow functions only for inline callbacks and lambdas
- Mark functions `async` only when they actually `await` something
- Use guard clauses (early `throw` / early `return`) over nested conditionals

### Exports

- **Named exports only** -- never use default exports
- Each package has one barrel file (`index.ts`) that re-exports public API
- Barrel files list exports explicitly (no `export *`)
- Separate `export type { ... }` from value exports in barrel files
- Private helpers are simply not exported

### Error Handling

- Throw plain `Error` with descriptive messages (no custom error classes)
- Use guard-clause throws for validation: `throw new Error("Agent ID must not be empty")`
- For non-critical failures, catch silently and return a safe default
- For validation functions, return `string[]` of error messages (empty = valid)

### Documentation

- JSDoc on all exported functions with `@param`, `@returns`, `@throws` as relevant
- JSDoc on exported interfaces and their individual fields
- Use section dividers in longer files:
  ```ts
  // ---------------------------------------------------------------------------
  // Section Name
  // ---------------------------------------------------------------------------
  ```
- Minimal inline comments; prefer self-documenting code

### File Organization

- One concern per file (config, db, types, embeddings, identity)
- All types for a package go in a single `types.ts`
- Tests live in `__tests__/` co-located with source, named `<module>.test.ts`
- Internal file structure: imports, then sections grouped by purpose

## Database Conventions

- All database operations take `db: Kysely<Database>` as the first parameter
  (dependency injection, not globals/singletons)
- Database table interfaces use snake_case matching the PostgreSQL schema
- Domain-facing interfaces use camelCase; boundary mapping functions translate
- Embeddings are stored as `vector` (pgvector) but passed as `number[]` in the API
- Use Kysely's query builder for CRUD; use `sql` tagged templates for RPC/raw SQL

## Testing Conventions

- Test runner: Bun built-in (`import { describe, expect, it } from "bun:test"`)
- Structure tests with `describe` blocks per function, `it` blocks per behavior
- Mock external services (e.g. OpenAI) using `mock` from `bun:test`
- Call cleanup functions (e.g. `resetClient()`) in tests that use mocks
- Test files should exercise both happy paths and error cases (invalid input,
  missing values, edge cases)
