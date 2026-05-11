import type { RecallResult } from "@moneta/api-client"
import type { CliContext } from "../context.ts"
import { buildSearchScope } from "../filters.ts"
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
 * Performs semantic search via the API. The server handles embedding,
 * querying, touch updates, and archived-memory promotion.
 *
 * @param question - Natural language search question
 * @param options - CLI flag values
 * @param ctx - CLI context with config and API client
 */
export async function handleRecall(
  question: string,
  options: RecallOptions,
  ctx: CliContext,
): Promise<void> {
  const limit = options.limit ? Number.parseInt(options.limit, 10) : ctx.config.searchLimit
  const threshold = options.threshold ? Number.parseFloat(options.threshold) : undefined
  const includeArchived = options.archived ?? false

  // Semantic search via API (hybrid: vector similarity + full-text fallback)
  const results = await ctx.client.recall({
    question,
    scope: buildSearchScope(options),
    limit,
    threshold,
    includeArchived,
  })

  // Output
  if (options.json) {
    printJson(results)
    return
  }

  const displayThreshold = threshold ?? ctx.config.searchThreshold

  if (results.length === 0) {
    console.log(pc.dim(`No results for "${question}" (threshold: ${displayThreshold.toFixed(2)})`))
    return
  }

  printRecallResults(results)
  console.log()
  console.log(pc.dim(`${results.length} results (threshold: ${displayThreshold.toFixed(2)})`))
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
      relativeTime(new Date(r.lastAccessedAt)),
    ]
  })

  console.log()
  printTable(columns, rows)
}
