import type { MonetaDb } from "@moneta/shared"
import { sql } from "kysely"
import type { CliContext } from "../context.ts"
import { pc, printJson, shortId, truncate } from "../format.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options parsed from CLI flags for the stats command. */
export interface StatsOptions {
  json?: boolean
}

interface MemoryStats {
  total: number
  active: number
  archived: number
  pinned: number
  byEngineer: Array<{ engineer: string; count: number; pinned: number }>
  byRepo: Array<{ repo: string; count: number }>
  topTags: Array<{ tag: string; count: number }>
  approachingStale: number
  archivedLast7Days: number
  createdToday: number
  mostAccessed: Array<{ id: string; content: string; accessCount: number }>
}

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
 * @param ctx - CLI context with config and database
 */
export async function handleStats(options: StatsOptions, ctx: CliContext): Promise<void> {
  const stats = await gatherStats(ctx.db, ctx.config.projectId)

  if (options.json) {
    printJson(stats)
    return
  }

  printStatsDashboard(stats, ctx.config.projectId)
}

// ---------------------------------------------------------------------------
// Data gathering
// ---------------------------------------------------------------------------

async function gatherStats(db: MonetaDb, projectId: string): Promise<MemoryStats> {
  // Run all independent queries in parallel
  const [counts, byEngineer, byRepo, topTags, archivalMetrics, mostAccessed] = await Promise.all([
    fetchCounts(db, projectId),
    fetchByEngineer(db, projectId),
    fetchByRepo(db, projectId),
    fetchTopTags(db, projectId),
    fetchArchivalMetrics(db, projectId),
    fetchMostAccessed(db, projectId),
  ])

  return {
    ...counts,
    byEngineer,
    byRepo,
    topTags,
    ...archivalMetrics,
    mostAccessed,
  }
}

async function fetchCounts(
  db: MonetaDb,
  projectId: string,
): Promise<{ total: number; active: number; archived: number; pinned: number }> {
  const result = await sql<{
    total: string
    active: string
    archived: string
    pinned: string
  }>`
    SELECT
      COUNT(*)                                  AS total,
      COUNT(*) FILTER (WHERE NOT archived)      AS active,
      COUNT(*) FILTER (WHERE archived)          AS archived,
      COUNT(*) FILTER (WHERE pinned)            AS pinned
    FROM project_memory
    WHERE project_id = ${projectId}
  `.execute(db)

  const row = result.rows[0]
  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    archived: Number(row?.archived ?? 0),
    pinned: Number(row?.pinned ?? 0),
  }
}

async function fetchByEngineer(
  db: MonetaDb,
  projectId: string,
): Promise<Array<{ engineer: string; count: number; pinned: number }>> {
  const result = await sql<{ engineer: string; count: string; pinned: string }>`
    SELECT
      COALESCE(engineer, 'auto') AS engineer,
      COUNT(*)                   AS count,
      COUNT(*) FILTER (WHERE pinned) AS pinned
    FROM project_memory
    WHERE project_id = ${projectId} AND NOT archived
    GROUP BY COALESCE(engineer, 'auto')
    ORDER BY count DESC
  `.execute(db)

  return result.rows.map((r) => ({
    engineer: String(r.engineer),
    count: Number(r.count),
    pinned: Number(r.pinned),
  }))
}

async function fetchByRepo(
  db: MonetaDb,
  projectId: string,
): Promise<Array<{ repo: string; count: number }>> {
  const result = await sql<{ repo: string; count: string }>`
    SELECT
      COALESCE(repo, '(no repo)') AS repo,
      COUNT(*)                    AS count
    FROM project_memory
    WHERE project_id = ${projectId} AND NOT archived
    GROUP BY COALESCE(repo, '(no repo)')
    ORDER BY count DESC
  `.execute(db)

  return result.rows.map((r) => ({
    repo: String(r.repo),
    count: Number(r.count),
  }))
}

async function fetchTopTags(
  db: MonetaDb,
  projectId: string,
): Promise<Array<{ tag: string; count: number }>> {
  const result = await sql<{ tag: string; count: string }>`
    SELECT
      unnest(tags) AS tag,
      COUNT(*)     AS count
    FROM project_memory
    WHERE project_id = ${projectId} AND NOT archived
    GROUP BY tag
    ORDER BY count DESC
    LIMIT 10
  `.execute(db)

  return result.rows.map((r) => ({
    tag: String(r.tag),
    count: Number(r.count),
  }))
}

async function fetchArchivalMetrics(
  db: MonetaDb,
  projectId: string,
): Promise<{ approachingStale: number; archivedLast7Days: number; createdToday: number }> {
  const result = await sql<{
    approaching_stale: string
    archived_last_7_days: string
    created_today: string
  }>`
    SELECT
      COUNT(*) FILTER (
        WHERE NOT pinned AND NOT archived
          AND last_accessed_at < now() - INTERVAL '20 days'
      ) AS approaching_stale,
      COUNT(*) FILTER (
        WHERE archived AND updated_at > now() - INTERVAL '7 days'
      ) AS archived_last_7_days,
      COUNT(*) FILTER (
        WHERE created_at > date_trunc('day', now())
      ) AS created_today
    FROM project_memory
    WHERE project_id = ${projectId}
  `.execute(db)

  const row = result.rows[0]
  return {
    approachingStale: Number(row?.approaching_stale ?? 0),
    archivedLast7Days: Number(row?.archived_last_7_days ?? 0),
    createdToday: Number(row?.created_today ?? 0),
  }
}

async function fetchMostAccessed(
  db: MonetaDb,
  projectId: string,
): Promise<Array<{ id: string; content: string; accessCount: number }>> {
  const result = await sql<{ id: string; content: string; access_count: string }>`
    SELECT id, content, access_count
    FROM project_memory
    WHERE project_id = ${projectId} AND NOT archived
    ORDER BY access_count DESC
    LIMIT 3
  `.execute(db)

  return result.rows.map((r) => ({
    id: String(r.id),
    content: String(r.content),
    accessCount: Number(r.access_count),
  }))
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
