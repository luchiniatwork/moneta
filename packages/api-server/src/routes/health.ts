import { Hono } from "hono"
import type { HealthResponse } from "../types.ts"

// ---------------------------------------------------------------------------
// Health route
// ---------------------------------------------------------------------------

/**
 * Create the health check route.
 *
 * The health endpoint is project-agnostic — it does not require the
 * `X-Project-Id` header. It reports server availability only.
 *
 * @returns Hono app with GET /health
 */
export function createHealthRoute(): Hono {
  const app = new Hono()

  app.get("/health", (c) => {
    const response: HealthResponse = {
      status: "ok",
      version: "0.0.6",
    }
    return c.json(response)
  })

  return app
}
