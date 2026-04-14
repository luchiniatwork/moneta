import type { Config, MonetaDb } from "@moneta/shared"
import { Hono } from "hono"
import { handleStats } from "../handlers/stats.ts"

// ---------------------------------------------------------------------------
// Stats route
// ---------------------------------------------------------------------------

/**
 * Create the stats route.
 *
 * @param config - Server configuration
 * @param db - Database instance
 * @returns Hono app with GET /stats
 */
export function createStatsRoute(config: Config, db: MonetaDb): Hono {
  const app = new Hono()

  app.get("/stats", async (c) => {
    const stats = await handleStats({ config, db })
    return c.json(stats)
  })

  return app
}
