import { updateMemory } from "@moneta/shared"
import type { CliContext } from "../context.ts"
import { shortId } from "../format.ts"
import { resolveMemory } from "../resolve.ts"

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `moneta unpin <id>` command.
 *
 * Removes the pinned mark from a memory, making it eligible for
 * automatic archival by the reaper.
 *
 * @param id - Full UUID or short prefix
 * @param ctx - CLI context with config and database
 */
export async function handleUnpin(id: string, ctx: CliContext): Promise<void> {
  const memory = await resolveMemory(id, ctx)
  await updateMemory(ctx.db, memory.id, { pinned: false })
  console.log(`Unpinned ${shortId(memory.id)}. This memory is now eligible for archival.`)
}
