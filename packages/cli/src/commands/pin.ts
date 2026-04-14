import type { CliContext } from "../context.ts"
import { shortId } from "../format.ts"
import { resolveMemory } from "../resolve.ts"

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `moneta pin <id>` command.
 *
 * Marks a memory as pinned so it will never be archived by the reaper.
 *
 * @param id - Full UUID or short prefix
 * @param ctx - CLI context with config and API client
 */
export async function handlePin(id: string, ctx: CliContext): Promise<void> {
  const memory = await resolveMemory(id, ctx)
  await ctx.client.pin(memory.id)
  console.log(`Pinned ${shortId(memory.id)}. This memory will not be archived.`)
}
