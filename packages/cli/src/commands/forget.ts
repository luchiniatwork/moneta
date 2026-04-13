import { deleteMemory } from "@moneta/shared"
import type { CliContext } from "../context.ts"
import { pc, shortId, truncate } from "../format.ts"
import { confirm } from "../prompt.ts"
import { resolveMemory } from "../resolve.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options parsed from CLI flags for the forget command. */
export interface ForgetOptions {
  yes?: boolean
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `moneta forget <id>` command.
 *
 * Permanently deletes a memory. Shows the memory content and asks
 * for confirmation before deleting, unless `--yes` is passed.
 *
 * @param id - Full UUID or short prefix
 * @param options - CLI flag values
 * @param ctx - CLI context with config and database
 */
export async function handleForget(
  id: string,
  options: ForgetOptions,
  ctx: CliContext,
): Promise<void> {
  const memory = await resolveMemory(id, ctx)

  // Show what's about to be deleted
  console.log()
  console.log(`  ${pc.bold("Memory")} ${shortId(memory.id)}`)
  console.log(`  ${pc.dim(truncate(memory.content, 80))}`)
  console.log()

  if (!options.yes) {
    const confirmed = await confirm("Are you sure you want to permanently delete this memory?")
    if (!confirmed) {
      console.log("Cancelled.")
      return
    }
  }

  await deleteMemory(ctx.db, memory.id)
  console.log(`Deleted ${shortId(memory.id)}.`)
}
