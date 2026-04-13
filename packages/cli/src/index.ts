#!/usr/bin/env bun
import { Command } from "commander"
import { handleList } from "./commands/list.ts"
import { handleSearch } from "./commands/search.ts"
import { handleShow } from "./commands/show.ts"
import { handleStats } from "./commands/stats.ts"
import { createContext, destroyContext } from "./context.ts"

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

const program = new Command()

program
  .name("moneta")
  .description("CLI for browsing and managing the Moneta shared memory store")
  .version("0.0.1")

// ---------------------------------------------------------------------------
// moneta search <question>
// ---------------------------------------------------------------------------

program
  .command("search")
  .description("Semantic search — find memories by asking a question")
  .argument("<question>", "Natural language question or topic")
  .option("-n, --limit <number>", "Max results")
  .option("-t, --threshold <number>", "Min similarity score")
  .option("--agent <identity>", "Filter by agent identity")
  .option("--engineer <name>", "Filter by engineer")
  .option("--repo <name>", "Filter by repository")
  .option("--tags <tags>", "Filter by tags (comma-separated)")
  .option("--archived", "Include archived memories")
  .option("--json", "Output as JSON")
  .action(async (question: string, options: Record<string, unknown>) => {
    const ctx = await createContext()
    try {
      await handleSearch(question, options, ctx)
    } finally {
      await destroyContext(ctx)
    }
  })

// ---------------------------------------------------------------------------
// moneta list
// ---------------------------------------------------------------------------

program
  .command("list")
  .description("List memories chronologically with filters")
  .option("-r, --recent <number>", "Show N most recent (default 20)")
  .option("--agent <identity>", "Filter by agent identity")
  .option("--engineer <name>", "Filter by engineer")
  .option("--repo <name>", "Filter by repository")
  .option("--tags <tags>", "Filter by tags (comma-separated)")
  .option("--pinned", "Only pinned memories")
  .option("--archived", "Only archived memories")
  .option("--stale", "Show memories approaching archival (accessed >20d ago)")
  .option("--json", "Output as JSON")
  .action(async (options: Record<string, unknown>) => {
    const ctx = await createContext()
    try {
      await handleList(options, ctx)
    } finally {
      await destroyContext(ctx)
    }
  })

// ---------------------------------------------------------------------------
// moneta show <id>
// ---------------------------------------------------------------------------

program
  .command("show")
  .description("Display full detail of a single memory")
  .argument("<id>", "Full UUID or short prefix (6+ chars)")
  .option("--json", "Output as JSON")
  .action(async (id: string, options: Record<string, unknown>) => {
    const ctx = await createContext()
    try {
      await handleShow(id, options, ctx)
    } finally {
      await destroyContext(ctx)
    }
  })

// ---------------------------------------------------------------------------
// moneta stats
// ---------------------------------------------------------------------------

program
  .command("stats")
  .description("Show aggregate statistics dashboard")
  .option("--json", "Output as JSON")
  .action(async (options: Record<string, unknown>) => {
    const ctx = await createContext()
    try {
      await handleStats(options, ctx)
    } finally {
      await destroyContext(ctx)
    }
  })

// ---------------------------------------------------------------------------
// Parse and run
// ---------------------------------------------------------------------------

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[moneta] Error: ${message}`)
  process.exit(1)
})
