import type { AgentIdentity, Config, Importance, MonetaDb } from "@moneta/shared"
import { callDedupCheck, embedBatch, insertMemory } from "@moneta/shared"
import type { ImportResponse } from "../types.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single memory item in the import batch. */
export interface ImportMemoryItem {
  content: string
  tags?: string[]
  repo?: string
  importance?: Importance
}

/** Parameters for the import handler. */
export interface ImportHandlerParams {
  memories: ImportMemoryItem[]
}

/** Dependencies injected into the import handler. */
export interface ImportHandlerDeps {
  config: Config
  db: MonetaDb
  identity: AgentIdentity
  /** Project identifier from the X-Project-Id request header */
  projectId: string
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Bulk import memories with batch embedding for efficiency.
 *
 * Generates embeddings for all memories in a single batch call, then
 * checks each for duplicates and inserts new ones. Skips duplicates
 * from the same agent and tags cross-agent duplicates as "corroborated".
 *
 * @param deps - Injected dependencies (config, db, identity)
 * @param params - Handler parameters containing the memories array
 * @returns Summary of imported, skipped, and errored items
 * @throws Error if batch embedding fails
 */
export async function handleImport(
  deps: ImportHandlerDeps,
  params: ImportHandlerParams,
): Promise<ImportResponse> {
  const { config, db, identity, projectId } = deps
  const { memories } = params

  if (memories.length === 0) {
    return { imported: 0, skipped: 0 }
  }

  // Validate all content lengths upfront
  const errors: string[] = []
  for (let i = 0; i < memories.length; i++) {
    const item = memories[i]
    if (!item) continue
    if (item.content.length > config.maxContentLength) {
      errors.push(
        `Item ${i}: content exceeds maximum length of ${config.maxContentLength} characters`,
      )
    }
  }

  if (errors.length > 0) {
    return { imported: 0, skipped: 0, errors }
  }

  // Batch embed all contents
  const texts = memories.map((m) => m.content)
  let embeddings: number[][]
  try {
    embeddings = await embedBatch(texts, config.openaiApiKey, config.embeddingModel)
  } catch (error) {
    throw new Error(
      `Failed to generate embeddings: ${error instanceof Error ? error.message : String(error)}. ` +
        "Check that OPENAI_API_KEY is valid and the embedding service is reachable.",
    )
  }

  let imported = 0
  let skipped = 0

  // Process each memory individually for dedup checks
  for (let i = 0; i < memories.length; i++) {
    const item = memories[i]
    const embedding = embeddings[i]
    if (!item || !embedding) continue

    try {
      const duplicates = await callDedupCheck(db, {
        projectId,
        embedding,
        threshold: config.dedupThreshold,
      })

      const firstDupe = duplicates[0]

      if (firstDupe && firstDupe.createdBy === identity.createdBy) {
        // Same agent duplicate: skip during import
        skipped++
        continue
      }

      const effectiveImportance = item.importance ?? "normal"
      const effectiveTags = firstDupe
        ? [...(item.tags ?? []), "corroborated"]
        : (item.tags ?? undefined)

      await insertMemory(db, {
        project_id: projectId,
        content: item.content,
        embedding,
        created_by: identity.createdBy,
        engineer: identity.engineer,
        agent_type: identity.agentType,
        repo: item.repo ?? null,
        tags: effectiveTags,
        importance: effectiveImportance,
        pinned: effectiveImportance === "critical",
      })

      imported++
    } catch (error) {
      errors.push(`Item ${i}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    imported,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  }
}
