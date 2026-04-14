import type { Importance, MonetaClient, RememberResult } from "@moneta/api-client"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Validated parameters for the remember tool. */
export interface RememberParams {
  content: string
  tags?: string[]
  repo?: string
  importance?: Importance
}

/** Dependencies injected into the remember handler. */
export interface RememberDeps {
  client: MonetaClient
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Store a new memory in the project.
 *
 * Delegates to the API client which handles embedding generation,
 * deduplication, and storage.
 *
 * @param deps - Injected dependencies (client)
 * @param params - Tool parameters from the agent
 * @returns The stored memory result
 * @throws Error if the API request fails
 */
export async function handleRemember(
  deps: RememberDeps,
  params: RememberParams,
): Promise<RememberResult> {
  const { client } = deps

  return client.remember({
    content: params.content,
    tags: params.tags,
    repo: params.repo,
    importance: params.importance,
  })
}
