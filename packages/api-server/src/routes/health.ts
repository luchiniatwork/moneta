import { Hono } from "hono"
import type { HealthResponse } from "../types.ts"

// ---------------------------------------------------------------------------
// Health route
// ---------------------------------------------------------------------------

/**
 * Create the health check route.
 *
 * @param projectId - The configured project identifier
 * @returns Hono app with GET /health
 */
export function createHealthRoute(projectId: string): Hono {
  const app = new Hono()

  app.get("/health", (c) => {
    const response: HealthResponse = {
      status: "ok",
      project: projectId,
      version: "0.0.1",
    }
    return c.json(response)
  })

  return app
}
