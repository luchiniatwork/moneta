import type { MonetaClient } from "@moneta/api-client"
import { createClient } from "@moneta/api-client"
import type { Config } from "@moneta/shared"
import { loadConfig, validateConfig } from "@moneta/shared"

// ---------------------------------------------------------------------------
// CLI Context
// ---------------------------------------------------------------------------

/** Shared context for all CLI commands. */
export interface CliContext {
  /** Loaded and validated configuration */
  config: Config
  /** Moneta API client */
  client: MonetaClient
}

/**
 * Bootstrap the CLI: load config, validate, and create the API client.
 *
 * Exits with code 1 if configuration is invalid (missing required fields).
 * The CLI requires `apiUrl` to connect to the Moneta REST API server.
 *
 * @returns CLI context with config and API client
 */
export async function createContext(): Promise<CliContext> {
  const config = loadConfig()

  const errors = validateConfig(config, { requireDatabase: false, requireApiUrl: true })
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[moneta] ${error}`)
    }
    process.exit(1)
  }

  const client = createClient({
    baseUrl: config.apiUrl as string,
    projectId: config.projectId,
    apiKey: config.apiKey,
    agentId: config.agentId,
  })

  return { config, client }
}

/**
 * Gracefully shut down the CLI context.
 *
 * No cleanup is needed — the HTTP client has no persistent connections.
 * Kept as a no-op for backwards compatibility with the command pattern.
 *
 * @param _ctx - CLI context (unused)
 */
export async function destroyContext(_ctx: CliContext): Promise<void> {
  // No cleanup needed — HTTP client has no persistent connections
}
