import type { CliContext } from "../context.ts"
import { printJson } from "../format.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options parsed from CLI flags for the export command. */
export interface ExportOptions {
  all?: boolean
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `moneta export` command.
 *
 * Dumps memories as JSON to stdout via the API. By default exports
 * only active memories; use `--all` to include archived entries.
 *
 * @param options - CLI flag values
 * @param ctx - CLI context with config and API client
 */
export async function handleExport(options: ExportOptions, ctx: CliContext): Promise<void> {
  const memories = await ctx.client.exportMemories({
    archived: options.all ? "all" : false,
  })

  printJson(memories)
}
