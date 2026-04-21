import type { AgentIdentity, Config, MonetaDb } from "@moneta/shared"
import { Hono } from "hono"
import { handleRemember } from "../handlers/remember.ts"
import { createAgentIdMiddleware } from "../middleware/agent-id.ts"
import { RememberRequestSchema } from "../types.ts"

// ---------------------------------------------------------------------------
// Remember route
// ---------------------------------------------------------------------------

/**
 * Create the remember route.
 *
 * Requires `X-Agent-Id` header for agent identity and `X-Project-Id`
 * header for project scoping (provided by project-id middleware).
 *
 * @param config - Server configuration
 * @param db - Database instance
 * @returns Hono app with POST /memories/remember
 */
export function createRememberRoute(config: Config, db: MonetaDb): Hono {
  const app = new Hono()

  app.post("/memories/remember", createAgentIdMiddleware(), async (c) => {
    const body = await c.req.json()
    const parsed = RememberRequestSchema.safeParse(body)

    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues.map((i) => i.message).join(", "),
          },
        },
        400,
      )
    }

    // biome-ignore lint/suspicious/noExplicitAny: Hono context variable typing
    const identity = (c as any).get("agentIdentity") as AgentIdentity
    // biome-ignore lint/suspicious/noExplicitAny: Hono context variable typing
    const projectId = (c as any).get("projectId") as string
    const result = await handleRemember(
      { config, db, identity, projectId },
      {
        content: parsed.data.content,
        tags: parsed.data.tags,
        repo: parsed.data.repo,
        importance: parsed.data.importance,
      },
    )

    return c.json(result, 201)
  })

  return app
}
