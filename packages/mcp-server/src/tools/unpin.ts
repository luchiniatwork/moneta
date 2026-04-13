import type { MonetaDb } from "@moneta/shared"
import { getMemoryById, updateMemory } from "@moneta/shared"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Validated parameters for the unpin tool. */
export interface UnpinParams {
  memory_id: string
}

/** Dependencies injected into the unpin handler. */
export interface UnpinDeps {
  db: MonetaDb
}

/** Result returned from the unpin handler. */
export interface UnpinResult {
  id: string
  pinned: false
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Remove the never-archive mark from a memory.
 *
 * Validates that the memory exists, then sets `pinned = false`.
 * This does NOT immediately archive the memory — it just makes
 * it eligible for the archival reaper.
 *
 * @param deps - Injected dependencies (db)
 * @param params - Tool parameters from the agent
 * @returns The unpinned memory ID and status
 * @throws Error if the memory is not found
 */
export async function handleUnpin(deps: UnpinDeps, params: UnpinParams): Promise<UnpinResult> {
  const { db } = deps
  const { memory_id: memoryId } = params

  const existing = await getMemoryById(db, memoryId)
  if (!existing) {
    throw new Error(`Memory not found: ${memoryId}`)
  }

  await updateMemory(db, memoryId, { pinned: false })

  return { id: memoryId, pinned: false }
}
