import { updateMemory } from "@moneta/shared"
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
 * @param ctx - CLI context with config and database
 */
export async function handleArchive(id: string, ctx: CliContext): Promise<void> {
  const memory = await resolveMemory(id, ctx)
  await updateMemory(ctx.db, memory.id, { archived: true })
  console.log(`Archived ${shortId(memory.id)}.`)
}
