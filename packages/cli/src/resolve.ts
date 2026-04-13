import type { MemoryRow } from "@moneta/shared"
import { findMemoryByIdPrefix, getMemoryById } from "@moneta/shared"
import type { CliContext } from "./context.ts"
import { shortId } from "./format.ts"

// ---------------------------------------------------------------------------
// ID Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a memory ID that may be a full UUID or a short prefix.
 *
 * Tries an exact match first, then falls back to prefix matching.
 * Used by all commands that operate on a single memory (show, pin,
 * unpin, archive, restore, forget, correct).
 *
 * @param id - Full UUID or prefix (6+ chars)
 * @param ctx - CLI context
 * @returns The resolved memory row
 * @throws If the memory is not found or the prefix is ambiguous
 */
export async function resolveMemory(id: string, ctx: CliContext): Promise<MemoryRow> {
  // Try exact match first
  const exact = await getMemoryById(ctx.db, id)
  if (exact) return exact

  // Try prefix match
  const matches = await findMemoryByIdPrefix(ctx.db, ctx.config.projectId, id)

  if (matches.length === 0) {
    throw new Error(`Memory not found: ${id}`)
  }

  if (matches.length > 1) {
    const ids = matches.map((m) => shortId(m.id)).join(", ")
    throw new Error(`Ambiguous ID prefix "${id}", matches: ${ids}. Be more specific.`)
  }

  return matches[0] as MemoryRow
}
