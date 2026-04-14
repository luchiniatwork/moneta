import type { Config, MonetaDb } from "@moneta/shared"
import { Hono } from "hono"
import { createAuthMiddleware } from "./middleware/auth.ts"
import { createErrorHandler } from "./middleware/error-handler.ts"
import { createAdminRoute } from "./routes/admin.ts"
import { createHealthRoute } from "./routes/health.ts"
import { createMemoriesRoute } from "./routes/memories.ts"
import { createRecallRoute } from "./routes/recall.ts"
import { createRememberRoute } from "./routes/remember.ts"
import { createStatsRoute } from "./routes/stats.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Dependencies required to create the Hono app. */
export interface AppDeps {
  /** Server configuration */
  config: Config
  /** Kysely database instance */
  db: MonetaDb
  /** Optional API key for Bearer auth (from MONETA_API_KEY) */
  apiKey?: string
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

/**
 * Create a fully configured Hono app with all routes and middleware.
 *
 * This is a pure factory function: it does not start a server or bind to a
 * port, making it easy to test in isolation.
 *
 * @param deps - Dependencies (config, db, apiKey)
 * @returns Configured Hono app instance
 */
export function createApp(deps: AppDeps): Hono {
  const { config, db, apiKey } = deps
  const app = new Hono()

  // Global error handler
  app.onError(createErrorHandler())

  // Auth middleware (no-op if apiKey is not set)
  app.use("/*", createAuthMiddleware(apiKey))

  // Mount routes under /api/v1
  const v1 = new Hono()

  v1.route("/", createHealthRoute(config.projectId))
  v1.route("/", createStatsRoute(config, db))
  v1.route("/", createRememberRoute(config, db))
  v1.route("/", createRecallRoute(config, db))
  v1.route("/", createMemoriesRoute(config, db))
  v1.route("/", createAdminRoute(config, db))

  app.route("/api/v1", v1)

  return app
}
