import type { MiddlewareHandler } from "hono"

// ---------------------------------------------------------------------------
// Project ID header middleware
// ---------------------------------------------------------------------------

/**
 * Create a middleware that extracts and validates the `X-Project-Id` header.
 *
 * All project-scoped endpoints require this header to identify which project
 * the request targets. The API server is multi-tenant: it does not own a
 * project identity — clients provide it per-request.
 *
 * The extracted project ID is stored in the request context for handlers.
 *
 * @returns Hono middleware handler
 */
export function createProjectIdMiddleware(): MiddlewareHandler {
  return async function projectIdMiddleware(c, next) {
    const projectId = c.req.header("X-Project-Id")

    if (!projectId) {
      return c.json(
        {
          error: {
            code: "PROJECT_ID_REQUIRED",
            message: "X-Project-Id header is required",
          },
        },
        400,
      )
    }

    c.set("projectId", projectId)
    await next()
  }
}
