import type { MonetaClient, RecallResult } from "@moneta/api-client"
import type { Config } from "@moneta/shared"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Validated parameters for the recall tool. */
export interface RecallParams {
  question: string
  scope?: {
    agent?: string
    engineer?: string
    repo?: string
    tags?: string[]
  }
  limit?: number
  threshold?: number
  include_archived?: boolean
}

/** Dependencies injected into the recall handler. */
export interface RecallDeps {
  client: MonetaClient
  config: Config
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Search memories by asking a natural language question.
 *
 * Delegates to the API client which handles embedding generation,
 * semantic search, access tracking, and archive promotion.
 *
 * @param deps - Injected dependencies (client, config)
 * @param params - Tool parameters from the agent
 * @returns Array of matching memories with similarity scores
 * @throws Error if the API request fails
 */
export async function handleRecall(
  deps: RecallDeps,
  params: RecallParams,
): Promise<RecallResult[]> {
  const { client, config } = deps

  return client.recall({
    question: params.question,
    scope: params.scope,
    limit: params.limit ?? config.searchLimit,
    threshold: params.threshold,
    includeArchived: params.include_archived,
  })
}
