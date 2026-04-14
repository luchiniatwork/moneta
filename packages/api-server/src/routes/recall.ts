import type { Config, MonetaDb } from "@moneta/shared"
import { Hono } from "hono"
import { handleRecall } from "../handlers/recall.ts"
import { RecallRequestSchema } from "../types.ts"

// ---------------------------------------------------------------------------
// Recall route
// ---------------------------------------------------------------------------

/**
 * Create the recall route.
 *
 * @param config - Server configuration
 * @param db - Database instance
 * @returns Hono app with POST /memories/recall
 */
export function createRecallRoute(config: Config, db: MonetaDb): Hono {
  const app = new Hono()

  app.post("/memories/recall", async (c) => {
    const body = await c.req.json()
    const parsed = RecallRequestSchema.safeParse(body)

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

    const results = await handleRecall(
      { config, db },
      {
        question: parsed.data.question,
        scope: parsed.data.scope,
        limit: parsed.data.limit,
        includeArchived: parsed.data.includeArchived,
      },
    )

    return c.json({
      memories: results.map((r) => ({
        id: r.id,
        content: r.content,
        similarity: r.similarity,
        createdBy: r.createdBy,
        engineer: r.engineer,
        repo: r.repo,
        tags: r.tags,
        importance: r.importance,
        pinned: r.pinned,
        archived: r.archived,
        accessCount: r.accessCount,
        createdAt: r.createdAt.toISOString(),
        lastAccessedAt: r.lastAccessedAt.toISOString(),
      })),
    })
  })

  return app
}
