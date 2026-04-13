import type { MonetaDb } from "@moneta/shared"
import { getMemoryById, updateMemory } from "@moneta/shared"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Validated parameters for the pin tool. */
export interface PinParams {
  memory_id: string
}

/** Dependencies injected into the pin handler. */
export interface PinDeps {
  db: MonetaDb
}

/** Result returned from the pin handler. */
export interface PinResult {
  id: string
  pinned: true
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Pin a memory so it is never archived.
 *
 * Validates that the memory exists, then sets `pinned = true`.
 *
 * @param deps - Injected dependencies (db)
 * @param params - Tool parameters from the agent
 * @returns The pinned memory ID and status
 * @throws Error if the memory is not found
 */
export async function handlePin(deps: PinDeps, params: PinParams): Promise<PinResult> {
  const { db } = deps
  const { memory_id: memoryId } = params

  const existing = await getMemoryById(db, memoryId)
  if (!existing) {
    throw new Error(`Memory not found: ${memoryId}`)
  }

  await updateMemory(db, memoryId, { pinned: true })

  return { id: memoryId, pinned: true }
}
