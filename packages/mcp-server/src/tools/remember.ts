import type { AgentIdentity, Config, Importance, MonetaDb, RememberResult } from "@moneta/shared"
import { callDedupCheck, embed, insertMemory, updateMemory } from "@moneta/shared"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Validated parameters for the remember tool. */
export interface RememberParams {
  content: string
  tags?: string[]
  repo?: string
  importance?: Importance
}

/** Dependencies injected into the remember handler. */
export interface RememberDeps {
  config: Config
  db: MonetaDb
  identity: AgentIdentity
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Store a new memory in the project.
 *
 * Generates an embedding, checks for near-duplicates, and either updates
 * an existing memory (same agent, same content) or inserts a new one.
 * Critical memories are auto-pinned.
 *
 * @param deps - Injected dependencies (config, db, identity)
 * @param params - Tool parameters from the agent
 * @returns The stored memory result
 * @throws Error if embedding generation or database operations fail
 */
export async function handleRemember(
  deps: RememberDeps,
  params: RememberParams,
): Promise<RememberResult> {
  const { config, db, identity } = deps
  const { content, tags, repo, importance } = params

  // Generate embedding for the content
  let embedding: number[]
  try {
    embedding = await embed(content, config.openaiApiKey, config.embeddingModel)
  } catch (error) {
    throw new Error(
      `Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}. ` +
        "Check that OPENAI_API_KEY is valid and the embedding service is reachable.",
    )
  }

  // Check for near-duplicates
  const duplicates = await callDedupCheck(db, {
    projectId: config.projectId,
    embedding,
    threshold: config.dedupThreshold,
  })

  const firstDupe = duplicates[0]

  if (firstDupe && firstDupe.createdBy === identity.createdBy) {
    // Same agent wrote a near-duplicate: update in place
    await updateMemory(db, firstDupe.id, {
      content,
      newEmbedding: embedding,
      tags: tags ?? undefined,
      repo: repo ?? undefined,
      importance: importance ?? undefined,
    })

    return { id: firstDupe.id, content, deduplicated: true }
  }

  // Different agent duplicate or no duplicate: insert new memory
  const effectiveImportance = importance ?? "normal"
  const effectiveTags = firstDupe ? [...(tags ?? []), "corroborated"] : (tags ?? undefined)

  const row = await insertMemory(db, {
    project_id: config.projectId,
    content,
    embedding,
    created_by: identity.createdBy,
    engineer: identity.engineer,
    agent_type: identity.agentType,
    repo: repo ?? null,
    tags: effectiveTags,
    importance: effectiveImportance,
    pinned: effectiveImportance === "critical",
  })

  return { id: row.id, content, deduplicated: false }
}
