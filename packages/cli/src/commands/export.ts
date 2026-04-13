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
 * Dumps memories as JSON to stdout. By default exports only active
 * memories; use `--all` to include archived entries. The raw
 * embedding vector is excluded from the output.
 *
 * @param options - CLI flag values
 * @param ctx - CLI context with config and database
 */
export async function handleExport(options: ExportOptions, ctx: CliContext): Promise<void> {
  let query = ctx.db
    .selectFrom("project_memory")
    .select([
      "id",
      "project_id",
      "content",
      "created_by",
      "engineer",
      "agent_type",
      "repo",
      "tags",
      "importance",
      "pinned",
      "archived",
      "created_at",
      "updated_at",
      "last_accessed_at",
      "access_count",
    ])
    .where("project_id", "=", ctx.config.projectId)

  if (!options.all) {
    query = query.where("archived", "=", false)
  }

  query = query.orderBy("created_at", "desc")

  const rows = await query.execute()

  printJson(rows)
}
