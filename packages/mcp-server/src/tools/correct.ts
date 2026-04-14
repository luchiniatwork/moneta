import type { CorrectResult, MonetaClient } from "@moneta/api-client"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Validated parameters for the correct tool. */
export interface CorrectParams {
  memory_id: string
  new_content: string
}

/** Dependencies injected into the correct handler. */
export interface CorrectDeps {
  client: MonetaClient
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Update a memory's content when an agent discovers a stored fact is
 * stale or wrong.
 *
 * Delegates to the API client which handles validation, embedding
 * generation, and content replacement. The `created_by` field is NOT
 * changed — the original author remains.
 *
 * @param deps - Injected dependencies (client)
 * @param params - Tool parameters from the agent
 * @returns The old and new content for confirmation
 * @throws Error if the memory is not found or the API request fails
 */
export async function handleCorrect(
  deps: CorrectDeps,
  params: CorrectParams,
): Promise<CorrectResult> {
  const { client } = deps
  const { memory_id: memoryId, new_content: newContent } = params

  return client.correct(memoryId, newContent)
}
