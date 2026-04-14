import type { CliContext } from "../context.ts"
import { shortId } from "../format.ts"
import { resolveMemory } from "../resolve.ts"

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `moneta restore <id>` command.
 *
 * Restores an archived memory back to active status. The server
 * handles resetting the access clock so it won't be immediately
 * re-archived by the reaper.
 *
 * @param id - Full UUID or short prefix
 * @param ctx - CLI context with config and API client
 */
export async function handleRestore(id: string, ctx: CliContext): Promise<void> {
  const memory = await resolveMemory(id, ctx)
  await ctx.client.restore(memory.id)
  console.log(`Restored ${shortId(memory.id)} to active. Access clock reset.`)
}
