import type { Config, MonetaDb, RecallResult, SearchScope } from "@moneta/shared"
import { callRecall, callTouchMemories, embed, updateMemory } from "@moneta/shared"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Validated parameters for the recall tool. */
export interface RecallParams {
  question: string
  scope?: SearchScope
  limit?: number
  include_archived?: boolean
}

/** Dependencies injected into the recall handler. */
export interface RecallDeps {
  config: Config
  db: MonetaDb
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Search memories by asking a natural language question.
 *
 * Generates an embedding for the question, performs semantic search,
 * bumps access timestamps on returned memories, and promotes any
 * archived memories back to active if `include_archived` is set.
 *
 * @param deps - Injected dependencies (config, db)
 * @param params - Tool parameters from the agent
 * @returns Array of matching memories with similarity scores
 * @throws Error if embedding generation or database operations fail
 */
export async function handleRecall(
  deps: RecallDeps,
  params: RecallParams,
): Promise<RecallResult[]> {
  const { config, db } = deps
  const { question, scope, include_archived: includeArchived } = params
  const limit = params.limit ?? config.searchLimit

  // Generate embedding for the question
  let embedding: number[]
  try {
    embedding = await embed(question, config.openaiApiKey, config.embeddingModel)
  } catch (error) {
    throw new Error(
      `Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}. ` +
        "Check that OPENAI_API_KEY is valid and the embedding service is reachable.",
    )
  }

  // Semantic search via the recall() SQL function
  const results = await callRecall(db, {
    projectId: config.projectId,
    embedding,
    limit,
    threshold: config.searchThreshold,
    includeArchived: includeArchived ?? false,
    agent: scope?.agent,
    engineer: scope?.engineer,
    repo: scope?.repo,
    tags: scope?.tags,
  })

  if (results.length === 0) {
    return []
  }

  // Bump access timestamps for all returned memories
  const ids = results.map((r) => r.id)
  await callTouchMemories(db, ids)

  // Promote archived memories back to active
  if (includeArchived) {
    const archivedResults = results.filter((r) => r.archived)
    for (const result of archivedResults) {
      await updateMemory(db, result.id, { archived: false })
      result.archived = false
    }
  }

  return results
}
