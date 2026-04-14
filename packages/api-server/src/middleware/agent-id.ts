import type { AgentIdentity } from "@moneta/shared"
import { parseAgentId } from "@moneta/shared"
import type { MiddlewareHandler } from "hono"

// ---------------------------------------------------------------------------
// Agent ID header middleware
// ---------------------------------------------------------------------------

/**
 * Create a middleware that parses and validates the `X-Agent-Id` header.
 *
 * Write endpoints (remember, correct, import) require the header to be present.
 * The parsed {@link AgentIdentity} is stored in the request context for handlers.
 *
 * @returns Hono middleware handler
 */
export function createAgentIdMiddleware(): MiddlewareHandler {
  return async function agentIdMiddleware(c, next) {
    const agentIdHeader = c.req.header("X-Agent-Id")

    if (!agentIdHeader) {
      return c.json(
        { error: { code: "AGENT_ID_REQUIRED", message: "X-Agent-Id header is required" } },
        400,
      )
    }

    let identity: AgentIdentity
    try {
      identity = parseAgentId(agentIdHeader)
    } catch (err) {
      return c.json(
        {
          error: {
            code: "AGENT_ID_INVALID",
            message: err instanceof Error ? err.message : "Invalid agent ID format",
          },
        },
        400,
      )
    }

    c.set("agentIdentity", identity)
    await next()
  }
}
