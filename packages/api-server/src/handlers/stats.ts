import type { Config, MemoryStats, MonetaDb } from "@moneta/shared"
import { getStats } from "@moneta/shared"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Dependencies injected into the stats handler. */
export interface StatsHandlerDeps {
  config: Config
  db: MonetaDb
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
 * @param deps - Injected dependencies (config, db)
 * @returns Full statistics dashboard data
 */
export async function handleStats(deps: StatsHandlerDeps): Promise<MemoryStats> {
  const { config, db } = deps
  return await getStats(db, config.projectId)
}
