import type { RecallResult } from "@moneta/shared"
import { callRecall, callTouchMemories, embed, updateMemory } from "@moneta/shared"
import type { CliContext } from "../context.ts"
import { pc, printJson, printTable, relativeTime, truncate } from "../format.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options parsed from CLI flags for the recall command. */
export interface RecallOptions {
  limit?: string
  threshold?: string
  agent?: string
  engineer?: string
  repo?: string
  tags?: string
  archived?: boolean
  json?: boolean
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `moneta recall <question>` command.
 *
 * Performs semantic search by embedding the question, querying the database,
 * touching returned memories (resetting their archival clock), and optionally
 * promoting archived memories back to active.
 *
 * @param question - Natural language search question
 * @param options - CLI flag values
 * @param ctx - CLI context with config and database
 */
export async function handleRecall(
  question: string,
  options: RecallOptions,
  ctx: CliContext,
): Promise<void> {
  const { config, db } = ctx

  const limit = options.limit ? Number.parseInt(options.limit, 10) : config.searchLimit
  const threshold = options.threshold
    ? Number.parseFloat(options.threshold)
    : config.searchThreshold
  const includeArchived = options.archived ?? false
  const tags = options.tags ? options.tags.split(",").map((t) => t.trim()) : undefined

  // Generate embedding for the question
  const embedding = await embed(question, config.openaiApiKey, config.embeddingModel)

  // Semantic search
  const results = await callRecall(db, {
    projectId: config.projectId,
    embedding,
    limit,
    threshold,
    includeArchived,
    agent: options.agent,
    engineer: options.engineer,
    repo: options.repo,
    tags,
  })

  // Touch all returned memories (bump access timestamps)
  const ids = results.map((r) => r.id)
  if (ids.length > 0) {
    await callTouchMemories(db, ids)
  }

  // Promote archived memories back to active
  if (includeArchived) {
    const archivedResults = results.filter((r) => r.archived)
    for (const result of archivedResults) {
      await updateMemory(db, result.id, { archived: false })
      result.archived = false
    }
  }

  // Output
  if (options.json) {
    printJson(results)
    return
  }

  if (results.length === 0) {
    console.log(pc.dim(`No results for "${question}" (threshold: ${threshold.toFixed(2)})`))
    return
  }

  printRecallResults(results)
  console.log()
  console.log(pc.dim(`${results.length} results (threshold: ${threshold.toFixed(2)})`))
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function printRecallResults(results: RecallResult[]): void {
  const columns = [
    { label: "#", width: 3, align: "right" as const },
    { label: "Score", width: 5 },
    { label: "Content", width: 48 },
    { label: "By", width: 22 },
    { label: "Accessed", width: 10 },
  ]

  const rows = results.map((r, i) => {
    const pinIcon = r.pinned ? pc.yellow("*") : " "
    const content = `${pinIcon}${truncate(r.content, 46)}`
    return [
      String(i + 1),
      r.similarity.toFixed(2),
      content,
      r.createdBy,
      relativeTime(r.lastAccessedAt),
    ]
  })

  console.log()
  printTable(columns, rows)
}
