---
name: moneta-memory-mcp
description: Use Moneta shared memory via MCP tools to recall project knowledge
  and remember discoveries. Activate at the start of every task, when exploring
  unfamiliar code, after learning something worth preserving, and when the user
  expresses preferences or corrections.
metadata:
  author: moneta
  version: "1.0.0"
---

# Moneta Memory (MCP)

Moneta is a shared persistent memory system for AI coding agents. Memories are
short factual statements stored with semantic embeddings and retrieved via
natural-language questions. All agents in a project share the same memory pool,
so what one agent learns is available to every other agent.

You have access to Moneta through MCP tools: `remember`, `recall`, `pin`,
`unpin`, `forget`, and `correct`.

## When to Recall Memories

**You should proactively search for relevant memories before doing work.** Do
not wait to be asked. Recalling is cheap and fast -- prefer to recall too often
rather than too rarely.

Recall memories in these situations:

- **At the start of every task.** Before writing any code, recall memories
  related to the task topic, the files you will touch, and the domain area.
  Example: `recall("How does authentication work in this project?")`

- **When encountering unfamiliar code.** If you open a file or module you have
  not seen before, search for what other agents have learned about it.
  Example: `recall("What are the conventions for the API layer?")`

- **Before making architectural decisions.** Check whether prior decisions,
  patterns, or constraints have been recorded.
  Example: `recall("What database patterns does this project use?")`

- **When debugging.** Search for known issues, gotchas, or past fixes related
  to the error or component.
  Example: `recall("Known issues with the payment processing flow")`

- **When the user references something that might have prior context.** If the
  user mentions a concept, component, or past decision, check memories for it.

### Writing Good Recall Queries

- Formulate queries as natural-language questions or topic phrases.
- Be specific enough to surface relevant results, but not so narrow that you
  miss related memories.
- Use scope filters to narrow results when you know the context:
  - `scope.repo` -- limit to a specific repository
  - `scope.tags` -- filter by tags like `["convention"]` or `["bug-fix"]`
  - `scope.agent` -- limit to a specific agent's memories
  - `scope.engineer` -- limit to a specific engineer's agents

## When to Remember

**You should proactively save memories whenever you learn something that would
help a future agent working on this project.** Do not wait to be asked. If you
find yourself thinking "I wish I had known this earlier," that is a memory
worth saving.

Remember in these situations:

- **After discovering a codebase convention or pattern.**
  Example: `"All API route handlers in this project use zod validation middleware before the controller function."`

- **When the user states a preference or gives corrective feedback.**
  Example: `"User preference: always use named exports, never default exports."`

- **After making an architectural decision** -- save the rationale, not just
  the choice.
  Example: `"Chose Redis for session storage over JWT because sessions need server-side revocation for the admin panel."`

- **After fixing a bug** -- save what was wrong and why.
  Example: `"The auth token cache in AuthService was shared across requests because it was a module-level variable. Fixed by moving it into the request context."`

- **When learning about tooling, deployment, or environment specifics.**
  Example: `"CI runs on GitHub Actions. The test suite requires a running PostgreSQL instance -- use the docker-compose.ci.yml service."`

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

Use tags to categorize memories for easier retrieval. Common tags:

- `convention` -- coding standards, naming patterns, file organization rules
- `architecture` -- system design decisions and their rationale
- `bug-fix` -- root causes and solutions for bugs encountered
- `preference` -- user or team preferences for how things should be done
- `tooling` -- build tools, CI/CD, deployment, dev environment details
- `gotcha` -- non-obvious pitfalls or surprising behaviors

### Importance Levels

- `normal` (default) -- standard memories, archived after 30 days of inactivity
- `high` -- important conventions or decisions that should persist longer
- `critical` -- fundamental project facts that must never be archived (auto-pinned)

Use `critical` sparingly -- reserve it for facts like "This project uses
PostgreSQL 16 with pgvector" or "All API responses must follow the JSON:API
envelope format."

### The `repo` Field

Set the `repo` parameter when a memory is specific to a particular repository
in a multi-repo project. Omit it when the memory applies to the whole project.

## Tool Reference

### `remember` -- Store a new memory

| Parameter    | Type       | Required | Description                                             |
| ------------ | ---------- | -------- | ------------------------------------------------------- |
| `content`    | string     | yes      | The fact to remember. Clear, self-contained statement.  |
| `tags`       | string[]   | no       | Free-form tags for organization.                        |
| `repo`       | string     | no       | Repository this memory relates to.                      |
| `importance` | string     | no       | `"normal"`, `"high"`, or `"critical"`.                  |

Near-duplicate memories from the same agent are automatically updated in place.
If a different agent stores a near-duplicate, a new memory is created with a
`corroborated` tag.

### `recall` -- Search memories

| Parameter          | Type     | Required | Description                                      |
| ------------------ | -------- | -------- | ------------------------------------------------ |
| `question`         | string   | yes      | Natural-language question or topic to search for. |
| `scope.agent`      | string   | no       | Only this agent's memories.                      |
| `scope.engineer`   | string   | no       | Only this engineer's agents.                     |
| `scope.repo`       | string   | no       | Only this repository.                            |
| `scope.tags`       | string[] | no       | Must have all of these tags.                     |
| `limit`            | integer  | no       | Max results (default 10, max 100).               |
| `include_archived` | boolean  | no       | Include archived memories in search.             |

Returns memories ranked by semantic similarity with scores, author info, and
metadata.

### `correct` -- Update a stale or wrong memory

| Parameter     | Type   | Required | Description                         |
| ------------- | ------ | -------- | ----------------------------------- |
| `memory_id`   | string | yes      | UUID of the memory to correct.      |
| `new_content` | string | yes      | The corrected fact (replaces old).  |

Use `correct` when you find a memory that is outdated or inaccurate. The
original author attribution is preserved.

### `forget` -- Permanently delete a memory

| Parameter   | Type   | Required | Description                         |
| ----------- | ------ | -------- | ----------------------------------- |
| `memory_id` | string | yes      | UUID of the memory to delete.       |

Use `forget` when a memory is wrong and cannot be corrected, or is no longer
relevant. This is permanent.

### `pin` -- Protect a memory from archival

| Parameter   | Type   | Required | Description                         |
| ----------- | ------ | -------- | ----------------------------------- |
| `memory_id` | string | yes      | UUID of the memory to pin.          |

Pinned memories are never archived by the automatic archival process.

### `unpin` -- Allow a memory to be archived

| Parameter   | Type   | Required | Description                         |
| ----------- | ------ | -------- | ----------------------------------- |
| `memory_id` | string | yes      | UUID of the memory to unpin.        |

The memory is not immediately archived -- it simply becomes eligible for
archival if not accessed within the archival window (default 30 days).

## Example Workflow

Here is how to use Moneta during a typical task:

**1. Recall before starting work:**

> User asks: "Add rate limiting to the API endpoints."

Before writing any code, recall relevant context:
- `recall("How are API endpoints structured in this project?")`
- `recall("Are there any existing rate limiting patterns or middleware?")`
- `recall("What conventions does this project follow for middleware?")`

**2. Do the work** using insights from recalled memories.

**3. Remember what you learned:**

After implementing the feature:
- `remember("Rate limiting is implemented using express-rate-limit middleware in src/middleware/rateLimit.ts. The default limit is 100 requests per 15-minute window per IP.", tags: ["architecture", "convention"], importance: "high")`

**4. Correct stale memories** if any recalled memories turned out to be outdated:
- `correct(memory_id: "abc-123", new_content: "API middleware chain order: cors -> rateLimit -> auth -> validation -> handler (rate limiting was added before auth).")`
