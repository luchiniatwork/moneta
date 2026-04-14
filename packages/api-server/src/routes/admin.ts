import type { Config, MonetaDb } from "@moneta/shared"
import { callArchiveStale } from "@moneta/shared"
import { Hono } from "hono"

// ---------------------------------------------------------------------------
// Admin routes
// ---------------------------------------------------------------------------

/**
 * Create admin routes for maintenance operations.
 *
 * @param config - Server configuration
 * @param db - Database instance
 * @returns Hono app with POST /admin/archive-stale
 */
export function createAdminRoute(config: Config, db: MonetaDb): Hono {
  const app = new Hono()

  app.post("/admin/archive-stale", async (c) => {
    const archived = await callArchiveStale(db, config.archiveAfterDays)
    return c.json({ archived })
  })

  return app
}
