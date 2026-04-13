import type { MemoryRow } from "@moneta/shared"
import type { CliContext } from "../context.ts"
import { pc, printJson, printKeyValue, relativeTime } from "../format.ts"
import { resolveMemory } from "../resolve.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options parsed from CLI flags for the show command. */
export interface ShowOptions {
  json?: boolean
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `moneta show <id>` command.
 *
 * Displays full detail of a single memory. Accepts a full UUID or a
 * short prefix (6+ characters).
 *
 * @param id - Full UUID or short prefix
 * @param options - CLI flag values
 * @param ctx - CLI context with config and database
 */
export async function handleShow(id: string, options: ShowOptions, ctx: CliContext): Promise<void> {
  const memory = await resolveMemory(id, ctx)

  if (options.json) {
    printJson(memory)
    return
  }

  printMemoryDetail(memory)
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function printMemoryDetail(memory: MemoryRow): void {
  console.log()
  console.log(`  ${pc.bold("Memory")} ${memory.id}`)
  console.log(`  ${pc.dim("─".repeat(45))}`)

  const pairs: [string, string][] = [
    ["Content:", memory.content],
    ["Created by:", memory.created_by],
    ["Engineer:", memory.engineer ?? pc.dim("(none)")],
    ["Agent type:", memory.agent_type ?? pc.dim("(none)")],
    ["Repo:", memory.repo ?? pc.dim("(none)")],
    ["Tags:", memory.tags.length > 0 ? memory.tags.join(", ") : pc.dim("(none)")],
    ["Importance:", formatImportance(memory.importance)],
    ["Pinned:", memory.pinned ? pc.yellow("yes") : "no"],
    ["", ""],
    ["Created:", formatTimestamp(memory.created_at)],
    ["Updated:", formatTimestamp(memory.updated_at)],
    [
      "Last access:",
      `${formatTimestamp(memory.last_accessed_at)} (${relativeTime(memory.last_accessed_at)})`,
    ],
    ["Access count:", String(memory.access_count)],
    ["Archived:", memory.archived ? "yes" : "no"],
  ]

  printKeyValue(pairs)
  console.log()
}

function formatTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC")
}

function formatImportance(importance: string): string {
  switch (importance) {
    case "critical":
      return pc.red(importance)
    case "high":
      return pc.yellow(importance)
    default:
      return importance
  }
}
