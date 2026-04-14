import { createDb, loadConfig, validateConfig } from "@moneta/shared"
import { createApp } from "./app.ts"

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export type { AppDeps } from "./app.ts"
export { createApp } from "./app.ts"
export type { CorrectHandlerDeps, CorrectHandlerParams } from "./handlers/correct.ts"
export { handleCorrect } from "./handlers/correct.ts"
export type { ImportHandlerDeps, ImportHandlerParams, ImportMemoryItem } from "./handlers/import.ts"
export { handleImport } from "./handlers/import.ts"
export type { RecallHandlerDeps, RecallHandlerParams } from "./handlers/recall.ts"
export { handleRecall } from "./handlers/recall.ts"
export type { RememberHandlerDeps, RememberHandlerParams } from "./handlers/remember.ts"
export { handleRemember } from "./handlers/remember.ts"
export type { StatsHandlerDeps } from "./handlers/stats.ts"
export { handleStats } from "./handlers/stats.ts"
export type {
  ApiError,
  ApiErrorCode,
  CorrectResponse,
  HealthResponse,
  ImportResponse,
  ListMemoriesResponse,
  MemoryResponse,
  RecallResponse,
  RememberResponse,
} from "./types.ts"
export { mapMemoryRow } from "./types.ts"

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

/**
 * Start the Moneta API server.
 *
 * Loads configuration, validates required fields, creates the database
 * connection, and starts listening on the configured port.
 */
async function main(): Promise<void> {
  const config = loadConfig()
  const errors = validateConfig(config, { requireDatabase: true })

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[moneta-api] Config error: ${error}`)
    }
    process.exit(1)
  }

  const db = createDb(config.databaseUrl)
  const apiKey = config.apiKey
  const port = parseInt(process.env.MONETA_API_PORT ?? "3000", 10)

  const app = createApp({ config, db, apiKey })

  console.error(`[moneta-api] Starting server on port ${port}`)
  console.error(`[moneta-api] Project: ${config.projectId}`)
  console.error(`[moneta-api] Auth: ${apiKey ? "enabled" : "disabled"}`)

  Bun.serve({
    fetch: app.fetch,
    port,
  })

  console.error(`[moneta-api] Server listening on http://localhost:${port}`)
}

main().catch((err) => {
  console.error("[moneta-api] Fatal error:", err)
  process.exit(1)
})
