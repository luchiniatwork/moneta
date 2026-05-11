import type { Memory } from "@moneta/api-client"
import type { CliContext } from "../context.ts"
import { normalizeOptionalString, parseTags } from "../filters.ts"
import { age, formatTags, pc, printJson, printTable, shortId, truncate } from "../format.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options parsed from CLI flags for the list command. */
export interface ListOptions {
  recent?: string
  agent?: string
  engineer?: string
  repo?: string
  tags?: string
  pinned?: boolean
  archived?: boolean
  stale?: boolean
  json?: boolean
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `moneta list` command.
 *
 * Lists memories chronologically with filters. Displays a table with
 * a footer showing total counts.
 *
 * @param options - CLI flag values
 * @param ctx - CLI context with config and API client
 */
export async function handleList(options: ListOptions, ctx: CliContext): Promise<void> {
  const limit = options.recent ? Number.parseInt(options.recent, 10) : 20

  // Fetch filtered memories via API
  const { memories } = await ctx.client.listMemories({
    limit,
    agent: normalizeOptionalString(options.agent),
    engineer: normalizeOptionalString(options.engineer),
    repo: normalizeOptionalString(options.repo),
    tags: parseTags(options.tags),
    pinned: options.pinned,
    archived: options.archived,
    stale: options.stale,
  })

  // Fetch total counts for the footer
  const counts = await ctx.client.getCounts()

  // Output
  if (options.json) {
    printJson({ memories, ...counts })
    return
  }

  if (memories.length === 0) {
    console.log(pc.dim("No memories found matching the filters."))
    return
  }

  printMemoryTable(memories)
  console.log()
  console.log(
    pc.dim(`${memories.length} of ${counts.active} active memories (${counts.archived} archived)`),
  )
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function printMemoryTable(memories: Memory[]): void {
  const columns = [
    { label: "ID", width: 6 },
    { label: "Content", width: 40 },
    { label: "By", width: 20 },
    { label: "Tags", width: 18 },
    { label: "Pinned", width: 6 },
    { label: "Age", width: 5 },
  ]

  const tableRows = memories.map((m) => [
    shortId(m.id),
    truncate(m.content, 40),
    m.createdBy,
    formatTags(m.tags),
    m.pinned ? "yes" : "no",
    age(new Date(m.createdAt)),
  ])

  console.log()
  printTable(columns, tableRows)
}
