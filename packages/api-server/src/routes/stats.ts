import type { MonetaDb } from "@moneta/shared"
import { Hono } from "hono"
import { handleStats } from "../handlers/stats.ts"

// ---------------------------------------------------------------------------
// Stats route
// ---------------------------------------------------------------------------

/**
 * Create the stats route.
 *
 * Requires `X-Project-Id` header for project scoping (provided by
 * project-id middleware).
 *
 * @param db - Database instance
 * @returns Hono app with GET /stats
 */
export function createStatsRoute(db: MonetaDb): Hono {
  const app = new Hono()

  app.get("/stats", async (c) => {
    // biome-ignore lint/suspicious/noExplicitAny: Hono context variable typing
    const projectId = (c as any).get("projectId") as string
    const stats = await handleStats({ db, projectId })
    return c.json(stats)
  })

  return app
}
