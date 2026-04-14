import type { Config, CorrectResult, MonetaDb } from "@moneta/shared"
import { embed, getMemoryById, updateMemory } from "@moneta/shared"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters for the correct handler. */
export interface CorrectHandlerParams {
  memoryId: string
  newContent: string
}

/** Dependencies injected into the correct handler. */
export interface CorrectHandlerDeps {
  config: Config
  db: MonetaDb
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Update a memory's content when it is discovered to be stale or wrong.
 *
 * Validates that the memory exists and the new content is valid, then
 * generates a new embedding and updates the memory. The `created_by`
 * field is NOT changed -- the original author remains.
 *
 * @param deps - Injected dependencies (config, db)
 * @param params - Handler parameters
 * @returns The old and new content for confirmation
 * @throws Error if the memory is not found or content is invalid
 */
export async function handleCorrect(
  deps: CorrectHandlerDeps,
  params: CorrectHandlerParams,
): Promise<CorrectResult> {
  const { config, db } = deps
  const { memoryId, newContent } = params

  // Validate content
  if (!newContent || newContent.trim().length === 0) {
    throw new Error("Content must not be empty")
  }
  if (newContent.length > config.maxContentLength) {
    throw new Error(
      `Content exceeds maximum length of ${config.maxContentLength} characters (got ${newContent.length})`,
    )
  }

  // Verify memory exists
  const existing = await getMemoryById(db, memoryId)
  if (!existing) {
    throw new Error(`Memory not found: ${memoryId}`)
  }

  // Generate new embedding and update
  let newEmbedding: number[]
  try {
    newEmbedding = await embed(newContent, config.openaiApiKey, config.embeddingModel)
  } catch (error) {
    throw new Error(
      `Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}. ` +
        "Check that OPENAI_API_KEY is valid and the embedding service is reachable.",
    )
  }

  await updateMemory(db, memoryId, {
    content: newContent,
    newEmbedding,
  })

  return {
    id: memoryId,
    oldContent: existing.content,
    newContent,
  }
}
