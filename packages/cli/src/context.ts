import type { Config, MonetaDb } from "@moneta/shared"
import { createDb, loadConfig, validateConfig } from "@moneta/shared"

// ---------------------------------------------------------------------------
// CLI Context
// ---------------------------------------------------------------------------

/** Shared context for all CLI commands. */
export interface CliContext {
  /** Loaded and validated configuration */
  config: Config
  /** Kysely database instance */
  db: MonetaDb
}

/**
 * Bootstrap the CLI: load config, validate, and connect to the database.
 *
 * Exits with code 1 if configuration is invalid (missing required fields).
 * The CLI does not require `agentId` — only the MCP server does.
 *
 * @returns CLI context with config and database connection
 */
export async function createContext(): Promise<CliContext> {
  const config = loadConfig()

  const errors = validateConfig(config)
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[moneta] ${error}`)
    }
    process.exit(1)
  }

  const db = createDb(config.databaseUrl)

  return { config, db }
}

/**
 * Gracefully shut down the CLI context by destroying the database connection.
 *
 * @param ctx - CLI context to shut down
 */
export async function destroyContext(ctx: CliContext): Promise<void> {
  await ctx.db.destroy()
}
