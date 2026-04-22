---
name: moneta-memory-cli
description: Use the Moneta CLI to recall project knowledge and remember
  discoveries via bash commands. Activate at the start of every task, when
  exploring unfamiliar code, after learning something worth preserving, and
  when the user expresses preferences or corrections.
metadata:
  author: moneta
  version: "1.0.0"
---

# Moneta Memory (CLI)

Moneta is a shared persistent memory system for AI coding agents. Memories are
short factual statements stored with semantic embeddings and retrieved via
natural-language questions. All agents in a project share the same memory pool,
so what one agent learns is available to every other agent.

You interact with Moneta through the `moneta` CLI. The core commands are:
`remember`, `recall`, `pin`, `unpin`, `forget`, and `correct`.

## When to Recall Memories

**You should proactively search for relevant memories before doing work.** Do
not wait to be asked. Recalling is cheap and fast -- prefer to recall too often
rather than too rarely.

Recall memories in these situations:

- **At the start of every task.** Before writing any code, recall memories
  related to the task topic, the files you will touch, and the domain area.
  ```bash
  moneta recall "How does authentication work in this project?"
  ```

- **When encountering unfamiliar code.** If you open a file or module you have
  not seen before, search for what other agents have learned about it.
  ```bash
  moneta recall "What are the conventions for the API layer?"
  ```

- **Before making architectural decisions.** Check whether prior decisions,
  patterns, or constraints have been recorded.
  ```bash
  moneta recall "What database patterns does this project use?"
  ```

- **When debugging.** Search for known issues, gotchas, or past fixes related
  to the error or component.
  ```bash
  moneta recall "Known issues with the payment processing flow"
  ```

- **When the user references something that might have prior context.** If the
  user mentions a concept, component, or past decision, check memories for it.

### Writing Good Recall Queries

- Formulate queries as natural-language questions or topic phrases.
- Be specific enough to surface relevant results, but not so narrow that you
  miss related memories.
- Use flags to narrow results when you know the context:
  - `--repo <name>` -- limit to a specific repository
  - `--tags <tag1,tag2>` -- filter by tags like `convention` or `bug-fix`
  - `--agent <identity>` -- limit to a specific agent's memories
  - `--engineer <name>` -- limit to a specific engineer's agents
- Use `--json` when you need to parse the output programmatically.
- Use `-n <number>` to control how many results are returned (default 10).

Example with filters:
```bash
moneta recall "deployment configuration" --repo backend --tags tooling --json
```

## When to Remember

**You should proactively save memories whenever you learn something that would
help a future agent working on this project.** Do not wait to be asked. If you
find yourself thinking "I wish I had known this earlier," that is a memory
worth saving.

Remember in these situations:

- **After discovering a codebase convention or pattern.**
  ```bash
  moneta remember "All API route handlers in this project use zod validation middleware before the controller function." --tags convention
  ```

- **When the user states a preference or gives corrective feedback.**
  ```bash
  moneta remember "User preference: always use named exports, never default exports." --tags preference --importance high
  ```

- **After making an architectural decision** -- save the rationale, not just
  the choice.
  ```bash
  moneta remember "Chose Redis for session storage over JWT because sessions need server-side revocation for the admin panel." --tags architecture --importance high
  ```

- **After fixing a bug** -- save what was wrong and why.
  ```bash
  moneta remember "The auth token cache in AuthService was shared across requests because it was a module-level variable. Fixed by moving it into the request context." --tags bug-fix
  ```

- **When learning about tooling, deployment, or environment specifics.**
  ```bash
  moneta remember "CI runs on GitHub Actions. The test suite requires a running PostgreSQL instance -- use the docker-compose.ci.yml service." --tags tooling
  ```

- **After completing a task** -- save key learnings that would help a future
  agent.

### How to Write Good Memories

- **Self-contained.** A future agent with zero context should understand the
  fact without needing to read the conversation that produced it.
- **Concise.** One clear statement per memory. Keep it under 2000 characters.
  If you have multiple facts, store multiple memories.
- **Factual.** State what IS, not what was discussed. Write assertions, not
  narratives.
- **Not code.** Do not dump code blocks, conversation logs, or full documents
  into memories. Summarize the insight instead.

**Bad memory:** "We talked about auth and decided to change it."
**Good memory:** "Authentication uses short-lived JWTs (15 min) with a refresh token rotation strategy. The refresh endpoint is POST /api/auth/refresh."

### Tags

Use tags to categorize memories for easier retrieval. Pass them as a
comma-separated list with `--tags`:

```bash
moneta remember "..." --tags convention,architecture
```

Common tags:

- `convention` -- coding standards, naming patterns, file organization rules
- `architecture` -- system design decisions and their rationale
- `bug-fix` -- root causes and solutions for bugs encountered
- `preference` -- user or team preferences for how things should be done
- `tooling` -- build tools, CI/CD, deployment, dev environment details
- `gotcha` -- non-obvious pitfalls or surprising behaviors

### Importance Levels

Set importance with `--importance <level>`:

- `normal` (default) -- standard memories, archived after 30 days of inactivity
- `high` -- important conventions or decisions that should persist longer
- `critical` -- fundamental project facts that must never be archived (auto-pinned)

Use `critical` sparingly -- reserve it for facts like "This project uses
PostgreSQL 16 with pgvector" or "All API responses must follow the JSON:API
envelope format."

### The `--repo` Flag

Set `--repo <name>` when a memory is specific to a particular repository in a
multi-repo project. Omit it when the memory applies to the whole project.

### Agent Identity

The `remember` command requires an agent identity. This is normally set via the
`MONETA_AGENT_ID` environment variable (format: `"engineer/agent-type"`, e.g.,
`"alice/code-reviewer"`). You can override it globally with `--agent-id`:

```bash
moneta --agent-id "alice/code-reviewer" remember "..."
```

## Command Reference

### `moneta remember <content>` -- Store a new memory

```bash
moneta remember "<content>" [--tags <tags>] [--repo <name>] [--importance <level>] [--json]
```

| Flag            | Description                                            |
| --------------- | ------------------------------------------------------ |
| `--tags`        | Comma-separated tags for organization.                 |
| `--repo`        | Repository this memory relates to.                     |
| `--importance`  | `normal`, `high`, or `critical`.                       |
| `--json`        | Output as JSON.                                        |

Near-duplicate memories from the same agent are automatically updated in place.
If a different agent stores a near-duplicate, a new memory is created with a
`corroborated` tag.

### `moneta recall <question>` -- Search memories

```bash
moneta recall "<question>" [-n <limit>] [-t <threshold>] [--agent <identity>] [--engineer <name>] [--repo <name>] [--tags <tags>] [--archived] [--json]
```

| Flag            | Short | Description                                    |
| --------------- | ----- | ---------------------------------------------- |
| `--limit`       | `-n`  | Max results (default 10).                      |
| `--threshold`   | `-t`  | Min similarity score (default 0.3).            |
| `--agent`       |       | Filter by agent identity.                      |
| `--engineer`    |       | Filter by engineer.                            |
| `--repo`        |       | Filter by repository.                          |
| `--tags`        |       | Filter by tags (comma-separated).              |
| `--archived`    |       | Include archived memories in search.           |
| `--json`        |       | Output as JSON.                                |

Returns memories ranked by semantic similarity.

### `moneta correct <id> <new-content>` -- Update a stale or wrong memory

```bash
moneta correct <id> "<new-content>"
```

Use `correct` when you find a memory that is outdated or inaccurate. The
original author attribution is preserved. IDs can be short prefixes (6+
characters).

### `moneta forget <id>` -- Permanently delete a memory

```bash
moneta forget <id> [--yes]
```

| Flag    | Short | Description                              |
| ------- | ----- | ---------------------------------------- |
| `--yes` | `-y`  | Skip confirmation prompt.                |

Use `forget` when a memory is wrong and cannot be corrected, or is no longer
relevant. This is permanent. Always pass `--yes` to avoid interactive prompts.

### `moneta pin <id>` -- Protect a memory from archival

```bash
moneta pin <id>
```

Pinned memories are never archived by the automatic archival process.

### `moneta unpin <id>` -- Allow a memory to be archived

```bash
moneta unpin <id>
```

The memory is not immediately archived -- it simply becomes eligible for
archival if not accessed within the archival window (default 30 days).

## Example Workflow

Here is how to use Moneta during a typical task:

**1. Recall before starting work:**

> User asks: "Add rate limiting to the API endpoints."

Before writing any code, recall relevant context:
```bash
moneta recall "How are API endpoints structured in this project?" --json
moneta recall "Are there any existing rate limiting patterns or middleware?" --json
moneta recall "What conventions does this project follow for middleware?" --json
```

**2. Do the work** using insights from recalled memories.

**3. Remember what you learned:**

After implementing the feature:
```bash
moneta remember "Rate limiting is implemented using express-rate-limit middleware in src/middleware/rateLimit.ts. The default limit is 100 requests per 15-minute window per IP." --tags architecture,convention --importance high
```

**4. Correct stale memories** if any recalled memories turned out to be outdated:
```bash
moneta correct a1b2c3 "API middleware chain order: cors -> rateLimit -> auth -> validation -> handler (rate limiting was added before auth)."
```
