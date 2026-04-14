import type { Importance } from "@moneta/api-client"
import type { CliContext } from "../context.ts"
import { pc, printJson, shortId } from "../format.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options parsed from CLI flags for the remember command. */
export interface RememberOptions {
  tags?: string
  repo?: string
  importance?: string
  agent?: string
  json?: boolean
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `moneta remember <content>` command.
 *
 * Stores a new memory in the project via the API. The server handles
 * embedding, deduplication, and insertion.
 *
 * @param content - The fact to remember
 * @param options - CLI flag values
 * @param ctx - CLI context with config and API client
 */
export async function handleRemember(
  content: string,
  options: RememberOptions,
  ctx: CliContext,
): Promise<void> {
  // Validate content
  const trimmed = content.trim()
  if (trimmed.length === 0) {
    throw new Error("Content must not be empty.")
  }
  if (trimmed.length > ctx.config.maxContentLength) {
    throw new Error(
      `Content exceeds maximum length of ${ctx.config.maxContentLength} characters (got ${trimmed.length}).`,
    )
  }

  // Parse optional fields
  const tags = options.tags ? options.tags.split(",").map((t) => t.trim()) : undefined
  const repo = options.repo ?? undefined
  const importance: Importance = validateImportance(options.importance)

  // Call the API
  const result = await ctx.client.remember({
    content: trimmed,
    tags,
    repo,
    importance,
  })

  if (options.json) {
    printJson(result)
    return
  }

  if (result.deduplicated) {
    console.log(`Updated existing memory ${pc.bold(shortId(result.id))} (near-duplicate).`)
    console.log(pc.dim(`  ${trimmed}`))
    return
  }

  const pinnedNote = importance === "critical" ? " (auto-pinned)" : ""
  console.log(`Remembered ${pc.bold(shortId(result.id))}${pinnedNote}.`)
  console.log(pc.dim(`  ${trimmed}`))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_IMPORTANCE = new Set(["normal", "high", "critical"])

/**
 * Validate and parse the importance flag value.
 *
 * @param value - Raw string from CLI flag
 * @returns Validated importance level
 * @throws Error if the value is not a valid importance level
 */
function validateImportance(value: string | undefined): Importance {
  if (!value) return "normal"
  if (!VALID_IMPORTANCE.has(value)) {
    throw new Error(`Invalid importance "${value}". Must be one of: normal, high, critical.`)
  }
  return value as Importance
}
