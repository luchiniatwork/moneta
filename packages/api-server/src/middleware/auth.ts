import type { Context, MiddlewareHandler } from "hono"

// ---------------------------------------------------------------------------
// Bearer token auth middleware
// ---------------------------------------------------------------------------

/**
 * Create a middleware that validates Bearer token authentication.
 *
 * When an API key is configured (via MONETA_API_KEY), all requests must
 * include a matching `Authorization: Bearer <key>` header. If no API key
 * is configured, the middleware is a no-op pass-through.
 *
 * @param apiKey - The expected API key, or undefined to skip auth
 * @returns Hono middleware handler
 */
export function createAuthMiddleware(apiKey: string | undefined): MiddlewareHandler {
  return async function authMiddleware(c: Context, next: () => Promise<void>): Promise<void> {
    if (!apiKey) {
      await next()
      return
    }

    const header = c.req.header("Authorization")
    if (!header) {
      c.status(401)
      c.res = c.json({
        error: { code: "UNAUTHORIZED", message: "Missing Authorization header" },
      })
      return
    }

    const match = header.match(/^Bearer\s+(.+)$/i)
    if (!match?.[1] || match[1] !== apiKey) {
      c.status(401)
      c.res = c.json({
        error: { code: "UNAUTHORIZED", message: "Invalid API key" },
      })
      return
    }

    await next()
  }
}
