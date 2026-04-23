import type { Context, ErrorHandler } from "hono"

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

/**
 * Global error handler that maps thrown errors to structured JSON responses.
 *
 * Recognizes specific error message patterns to set appropriate HTTP status
 * codes and error codes.
 *
 * @param err - The thrown error
 * @param c - Hono context
 * @returns JSON error response
 */
export function globalErrorHandler(err: Error, c: Context): Response {
  const message = err.message

  // Memory not found
  if (message.includes("Memory not found") || message.includes("not found")) {
    return c.json({ error: { code: "MEMORY_NOT_FOUND", message } }, 404)
  }

  // Content validation
  if (message.includes("must not be empty") || message.includes("Content must not be empty")) {
    return c.json({ error: { code: "CONTENT_EMPTY", message } }, 400)
  }

  if (message.includes("exceeds maximum length")) {
    return c.json({ error: { code: "CONTENT_TOO_LONG", message } }, 422)
  }

  // Embedding failures
  if (message.includes("Failed to generate embedding") || message.includes("embedding")) {
    return c.json({ error: { code: "EMBEDDING_FAILED", message } }, 503)
  }

  // Agent ID validation
  if (message.includes("Agent ID")) {
    return c.json({ error: { code: "AGENT_ID_INVALID", message } }, 400)
  }

  // Database errors
  if (
    message.includes("database") ||
    message.includes("connection") ||
    message.includes("ECONNREFUSED")
  ) {
    console.error("[moneta-api] Database error:", err)
    return c.json({ error: { code: "DATABASE_ERROR", message: "Database operation failed" } }, 503)
  }

  // Generic internal error
  console.error("[moneta-api] Unhandled error:", err)
  return c.json({ error: { code: "DATABASE_ERROR", message: "Internal server error" } }, 500)
}

/**
 * Create a Hono-compatible onError handler.
 *
 * @returns Error handler function
 */
export function createErrorHandler(): ErrorHandler {
  return globalErrorHandler
}
