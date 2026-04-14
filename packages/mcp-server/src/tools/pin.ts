import type { MonetaClient } from "@moneta/api-client"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Validated parameters for the pin tool. */
export interface PinParams {
  memory_id: string
}

/** Dependencies injected into the pin handler. */
export interface PinDeps {
  client: MonetaClient
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
 * Delegates to the API client which validates the memory exists
 * and sets `pinned = true`.
 *
 * @param deps - Injected dependencies (client)
 * @param params - Tool parameters from the agent
 * @returns The pinned memory ID and status
 * @throws Error if the memory is not found or the API request fails
 */
export async function handlePin(deps: PinDeps, params: PinParams): Promise<PinResult> {
  const { client } = deps
  const { memory_id: memoryId } = params

  await client.pin(memoryId)

  return { id: memoryId, pinned: true }
}
