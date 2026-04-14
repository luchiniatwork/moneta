import type { MonetaClient } from "@moneta/api-client"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Validated parameters for the unpin tool. */
export interface UnpinParams {
  memory_id: string
}

/** Dependencies injected into the unpin handler. */
export interface UnpinDeps {
  client: MonetaClient
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
 * Delegates to the API client which validates the memory exists
 * and sets `pinned = false`. This does NOT immediately archive the
 * memory — it just makes it eligible for the archival reaper.
 *
 * @param deps - Injected dependencies (client)
 * @param params - Tool parameters from the agent
 * @returns The unpinned memory ID and status
 * @throws Error if the memory is not found or the API request fails
 */
export async function handleUnpin(deps: UnpinDeps, params: UnpinParams): Promise<UnpinResult> {
  const { client } = deps
  const { memory_id: memoryId } = params

  await client.unpin(memoryId)

  return { id: memoryId, pinned: false }
}
