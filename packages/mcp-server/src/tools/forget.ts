import type { MonetaClient } from "@moneta/api-client"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Validated parameters for the forget tool. */
export interface ForgetParams {
  memory_id: string
}

/** Dependencies injected into the forget handler. */
export interface ForgetDeps {
  client: MonetaClient
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
 * Delegates to the API client which handles validation and deletion.
 * No soft-delete, no undo — the agent is explicitly saying
 * "this is wrong, remove it."
 *
 * @param deps - Injected dependencies (client)
 * @param params - Tool parameters from the agent
 * @returns The deleted memory ID and confirmation
 * @throws Error if the memory is not found or the API request fails
 */
export async function handleForget(deps: ForgetDeps, params: ForgetParams): Promise<ForgetResult> {
  const { client } = deps
  const { memory_id: memoryId } = params

  await client.deleteMemory(memoryId)

  return { id: memoryId, deleted: true }
}
