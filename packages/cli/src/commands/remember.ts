import type { Importance } from "@moneta/shared"
import { callDedupCheck, embed, insertMemory, parseAgentId, updateMemory } from "@moneta/shared"
import type { CliContext } from "../context.ts"
import { pc, printJson, shortId } from "../format.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options parsed from CLI flags for the remember command. */
export interface RememberOptions {
  tags?: string
  repo?: string
  importance?: string
  agent?: string
  json?: boolean
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `moneta remember <content>` command.
 *
 * Stores a new memory in the project. Generates an embedding, checks for
 * near-duplicates, and either updates an existing memory (same agent) or
 * inserts a new one. Critical memories are auto-pinned.
 *
 * Mirrors the MCP server's `remember` tool behavior exactly.
 *
 * @param content - The fact to remember
 * @param options - CLI flag values
 * @param ctx - CLI context with config and database
 */
export async function handleRemember(
  content: string,
  options: RememberOptions,
  ctx: CliContext,
): Promise<void> {
  const { config, db } = ctx

  // Resolve agent identity: --agent flag > MONETA_AGENT_ID env > error
  const agentIdRaw = options.agent ?? config.agentId
  if (!agentIdRaw) {
    throw new Error("Agent identity required. Set MONETA_AGENT_ID or pass --agent <identity>.")
  }

  // Validate content
  const trimmed = content.trim()
  if (trimmed.length === 0) {
    throw new Error("Content must not be empty.")
  }
  if (trimmed.length > config.maxContentLength) {
    throw new Error(
      `Content exceeds maximum length of ${config.maxContentLength} characters (got ${trimmed.length}).`,
    )
  }

  // Parse agent identity
  const identity = parseAgentId(agentIdRaw)

  // Parse optional fields
  const tags = options.tags ? options.tags.split(",").map((t) => t.trim()) : undefined
  const repo = options.repo ?? undefined
  const importance: Importance = validateImportance(options.importance)

  // Generate embedding
  let embedding: number[]
  try {
    embedding = await embed(trimmed, config.openaiApiKey, config.embeddingModel)
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
      content: trimmed,
      newEmbedding: embedding,
      tags: tags ?? undefined,
      repo: repo ?? undefined,
      importance: importance ?? undefined,
    })

    if (options.json) {
      printJson({ id: firstDupe.id, content: trimmed, deduplicated: true })
      return
    }

    console.log(`Updated existing memory ${pc.bold(shortId(firstDupe.id))} (near-duplicate).`)
    console.log(pc.dim(`  Old: ${firstDupe.content}`))
    console.log(pc.dim(`  New: ${trimmed}`))
    return
  }

  // Different agent duplicate or no duplicate: insert new memory
  const effectiveTags = firstDupe ? [...(tags ?? []), "corroborated"] : (tags ?? undefined)

  const row = await insertMemory(db, {
    project_id: config.projectId,
    content: trimmed,
    embedding,
    created_by: identity.createdBy,
    engineer: identity.engineer,
    agent_type: identity.agentType,
    repo: repo ?? null,
    tags: effectiveTags,
    importance,
    pinned: importance === "critical",
  })

  if (options.json) {
    printJson({ id: row.id, content: trimmed, deduplicated: false })
    return
  }

  const pinnedNote = importance === "critical" ? " (auto-pinned)" : ""
  const corroboratedNote = firstDupe ? " (corroborates existing memory)" : ""
  console.log(`Remembered ${pc.bold(shortId(row.id))}${pinnedNote}${corroboratedNote}.`)
  console.log(pc.dim(`  ${trimmed}`))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_IMPORTANCE = new Set(["normal", "high", "critical"])

/**
 * Validate and parse the importance flag value.
 *
 * @param value - Raw string from CLI flag
 * @returns Validated importance level
 * @throws Error if the value is not a valid importance level
 */
function validateImportance(value: string | undefined): Importance {
  if (!value) return "normal"
  if (!VALID_IMPORTANCE.has(value)) {
    throw new Error(`Invalid importance "${value}". Must be one of: normal, high, critical.`)
  }
  return value as Importance
}
