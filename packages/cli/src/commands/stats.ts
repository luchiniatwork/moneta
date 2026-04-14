import type { MemoryStats } from "@moneta/api-client"
import type { CliContext } from "../context.ts"
import { pc, printJson, shortId, truncate } from "../format.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options parsed from CLI flags for the stats command. */
export interface StatsOptions {
  json?: boolean
}

// Re-export MemoryStats so the TUI hook can import from here if needed
export type { MemoryStats }

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `moneta stats` command.
 *
 * Displays an aggregate dashboard of memory statistics including counts,
 * breakdowns by engineer and repo, top tags, and archival metrics.
 *
 * @param options - CLI flag values
 * @param ctx - CLI context with config and API client
 */
export async function handleStats(options: StatsOptions, ctx: CliContext): Promise<void> {
  const stats = await ctx.client.getStats()

  if (options.json) {
    printJson(stats)
    return
  }

  printStatsDashboard(stats, ctx.config.projectId)
}

// ---------------------------------------------------------------------------
// Dashboard rendering
// ---------------------------------------------------------------------------

function printStatsDashboard(stats: MemoryStats, projectId: string): void {
  console.log()
  console.log(`  ${pc.bold("Project:")} ${projectId}`)
  console.log(`  ${pc.dim("─".repeat(40))}`)

  // Totals
  console.log()
  console.log(`  ${pc.bold("Total memories:")}     ${stats.total}`)
  console.log(`    Active:           ${stats.active}`)
  console.log(`    Archived:          ${stats.archived}`)
  console.log(`    Pinned:            ${stats.pinned}`)

  // By engineer
  if (stats.byEngineer.length > 0) {
    console.log()
    console.log(`  ${pc.bold("By engineer:")}`)
    for (const entry of stats.byEngineer) {
      const pinned = entry.pinned > 0 ? ` (${entry.pinned} pinned)` : ""
      console.log(
        `    ${entry.engineer.padEnd(18)} ${String(entry.count).padStart(4)} memories${pinned}`,
      )
    }
  }

  // By repo
  if (stats.byRepo.length > 0) {
    console.log()
    console.log(`  ${pc.bold("By repo:")}`)
    for (const entry of stats.byRepo) {
      console.log(`    ${entry.repo.padEnd(18)} ${String(entry.count).padStart(4)}`)
    }
  }

  // Top tags
  if (stats.topTags.length > 0) {
    console.log()
    console.log(`  ${pc.bold("Top tags:")}`)
    for (const entry of stats.topTags) {
      console.log(`    ${entry.tag.padEnd(18)} ${String(entry.count).padStart(4)}`)
    }
  }

  // Archival
  console.log()
  console.log(`  ${pc.bold("Archival:")}`)
  console.log(`    Approaching stale (>20d):   ${stats.approachingStale} memories`)
  console.log(`    Archived last 7 days:       ${stats.archivedLast7Days} memories`)
  console.log(`    Promoted from archive:       ${pc.dim("—")}`)

  // Access patterns
  console.log()
  console.log(`  ${pc.bold("Access patterns:")}`)
  console.log(`    Searches today:             ${pc.dim("—")}`)
  console.log(`    Memories created today:      ${stats.createdToday}`)
  if (stats.mostAccessed.length > 0) {
    const top = stats.mostAccessed[0]
    if (top) {
      console.log(
        `    Most accessed:      ${shortId(top.id)}  "${truncate(top.content, 30)}" (${top.accessCount} hits)`,
      )
    }
  }

  console.log()
}
