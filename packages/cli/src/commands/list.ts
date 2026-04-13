import type { MemoryRow } from "@moneta/shared"
import { listMemories } from "@moneta/shared"
import { sql } from "kysely"
import type { CliContext } from "../context.ts"
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
 * @param ctx - CLI context with config and database
 */
export async function handleList(options: ListOptions, ctx: CliContext): Promise<void> {
  const { config, db } = ctx

  const limit = options.recent ? Number.parseInt(options.recent, 10) : 20
  const tags = options.tags ? options.tags.split(",").map((t) => t.trim()) : undefined

  // Fetch filtered memories
  const rows = await listMemories(db, {
    projectId: config.projectId,
    limit,
    agent: options.agent,
    engineer: options.engineer,
    repo: options.repo,
    tags,
    pinned: options.pinned,
    archived: options.archived,
    stale: options.stale,
  })

  // Fetch total counts for the footer
  const counts = await fetchCounts(ctx)

  // Output
  if (options.json) {
    printJson({ memories: rows, ...counts })
    return
  }

  if (rows.length === 0) {
    console.log(pc.dim("No memories found matching the filters."))
    return
  }

  printMemoryTable(rows)
  console.log()
  console.log(
    pc.dim(`${rows.length} of ${counts.active} active memories (${counts.archived} archived)`),
  )
}

// ---------------------------------------------------------------------------
// Count queries
// ---------------------------------------------------------------------------

interface MemoryCounts {
  active: number
  archived: number
}

async function fetchCounts(ctx: CliContext): Promise<MemoryCounts> {
  const result = await sql<{ active: string; archived: string }>`
    SELECT
      COUNT(*) FILTER (WHERE NOT archived) AS active,
      COUNT(*) FILTER (WHERE archived) AS archived
    FROM project_memory
    WHERE project_id = ${ctx.config.projectId}
  `.execute(ctx.db)

  const row = result.rows[0]
  return {
    active: Number(row?.active ?? 0),
    archived: Number(row?.archived ?? 0),
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function printMemoryTable(rows: MemoryRow[]): void {
  const columns = [
    { label: "ID", width: 6 },
    { label: "Content", width: 40 },
    { label: "By", width: 20 },
    { label: "Tags", width: 18 },
    { label: "Pinned", width: 6 },
    { label: "Age", width: 5 },
  ]

  const tableRows = rows.map((r) => [
    shortId(r.id),
    truncate(r.content, 40),
    r.created_by,
    formatTags(r.tags),
    r.pinned ? "yes" : "no",
    age(r.created_at),
  ])

  console.log()
  printTable(columns, tableRows)
}
