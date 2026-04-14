import type { CliContext } from "../context.ts"
import { shortId } from "../format.ts"
import { resolveMemory } from "../resolve.ts"

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `moneta archive <id>` command.
 *
 * Manually archives a memory. Distinct from the automatic archive
 * reaper — this is an explicit human action.
 *
 * @param id - Full UUID or short prefix
 * @param ctx - CLI context with config and API client
 */
export async function handleArchive(id: string, ctx: CliContext): Promise<void> {
  const memory = await resolveMemory(id, ctx)
  await ctx.client.archive(memory.id)
  console.log(`Archived ${shortId(memory.id)}.`)
}
