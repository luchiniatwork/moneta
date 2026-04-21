import type { MemoryStats, MonetaDb } from "@moneta/shared"
import { getStats } from "@moneta/shared"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Dependencies injected into the stats handler. */
export interface StatsHandlerDeps {
  db: MonetaDb
  /** Project identifier from the X-Project-Id request header */
  projectId: string
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Retrieve aggregate memory statistics for the project.
 *
 * Delegates to the shared `getStats` function which runs multiple
 * parallel queries for efficiency.
 *
 * @param deps - Injected dependencies (db, projectId)
 * @returns Full statistics dashboard data
 */
export async function handleStats(deps: StatsHandlerDeps): Promise<MemoryStats> {
  const { db, projectId } = deps
  return await getStats(db, projectId)
}
