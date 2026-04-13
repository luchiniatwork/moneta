import type { MonetaDb } from "@moneta/shared"
import { deleteMemory, getMemoryById } from "@moneta/shared"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Validated parameters for the forget tool. */
export interface ForgetParams {
  memory_id: string
}

/** Dependencies injected into the forget handler. */
export interface ForgetDeps {
  db: MonetaDb
}

/** Result returned from the forget handler. */
export interface ForgetResult {
  id: string
  deleted: true
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Permanently delete a memory.
 *
 * Validates that the memory exists, then hard-deletes it.
 * No soft-delete, no undo — the agent is explicitly saying
 * "this is wrong, remove it."
 *
 * @param deps - Injected dependencies (db)
 * @param params - Tool parameters from the agent
 * @returns The deleted memory ID and confirmation
 * @throws Error if the memory is not found
 */
export async function handleForget(deps: ForgetDeps, params: ForgetParams): Promise<ForgetResult> {
  const { db } = deps
  const { memory_id: memoryId } = params

  const existing = await getMemoryById(db, memoryId)
  if (!existing) {
    throw new Error(`Memory not found: ${memoryId}`)
  }

  await deleteMemory(db, memoryId)

  return { id: memoryId, deleted: true }
}
