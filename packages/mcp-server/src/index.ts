#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio"
import { createDb, loadConfig, parseAgentId, validateConfig } from "@moneta/shared"
import { createMonetaServer } from "./server.ts"

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

/**
 * Start the Moneta MCP server.
 *
 * Loads configuration, validates it, creates the database connection,
 * parses the agent identity, and connects the server to stdio transport.
 */
async function main(): Promise<void> {
  const config = loadConfig()

  const errors = validateConfig(config, { requireAgentId: true })
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[moneta] ${error}`)
    }
    process.exit(1)
  }

  // agentId is guaranteed non-empty after validation with requireAgentId
  const agentId = config.agentId as string
  const identity = parseAgentId(agentId)

  const db = createDb(config.databaseUrl)

  const server = createMonetaServer({ config, db, identity })

  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error(
    `[moneta] Server started for agent "${identity.createdBy}" on project "${config.projectId}"`,
  )
}

main().catch((error: unknown) => {
  console.error("[moneta] Fatal error:", error)
  process.exit(1)
})
