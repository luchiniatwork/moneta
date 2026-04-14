import type { CliContext } from "../context.ts"
import { pc, shortId } from "../format.ts"
import { resolveMemory } from "../resolve.ts"

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `moneta correct <id> <new-content>` command.
 *
 * Updates a memory's content via the API. The server handles
 * regenerating the embedding.
 *
 * @param id - Full UUID or short prefix
 * @param newContent - The corrected fact
 * @param ctx - CLI context with config and API client
 */
export async function handleCorrect(
  id: string,
  newContent: string,
  ctx: CliContext,
): Promise<void> {
  // Validate content
  if (!newContent.trim()) {
    throw new Error("Content must not be empty")
  }

  if (newContent.length > ctx.config.maxContentLength) {
    throw new Error(
      `Content exceeds maximum length of ${ctx.config.maxContentLength} characters (got ${newContent.length})`,
    )
  }

  const memory = await resolveMemory(id, ctx)

  // Correct via API (server re-embeds)
  const result = await ctx.client.correct(memory.id, newContent)

  console.log(`Corrected ${shortId(memory.id)}.`)
  console.log(`  ${pc.dim("Old:")} ${result.oldContent}`)
  console.log(`  ${pc.dim("New:")} ${result.newContent}`)
}
