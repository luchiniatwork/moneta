import { embed, updateMemory } from "@moneta/shared"
import type { CliContext } from "../context.ts"
import { pc, shortId } from "../format.ts"
import { resolveMemory } from "../resolve.ts"

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `moneta correct <id> <new-content>` command.
 *
 * Updates a memory's content and regenerates its embedding.
 * Shows old and new content for confirmation.
 *
 * @param id - Full UUID or short prefix
 * @param newContent - The corrected fact
 * @param ctx - CLI context with config and database
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

  // Generate new embedding
  const newEmbedding = await embed(newContent, ctx.config.openaiApiKey, ctx.config.embeddingModel)

  // Update content and embedding
  await updateMemory(ctx.db, memory.id, {
    content: newContent,
    newEmbedding,
  })

  console.log(`Corrected ${shortId(memory.id)}.`)
  console.log(`  ${pc.dim("Old:")} ${memory.content}`)
  console.log(`  ${pc.dim("New:")} ${newContent}`)
}
