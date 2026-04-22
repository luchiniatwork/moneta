#!/usr/bin/env node
import { Command } from "commander"
import { handleArchive } from "./commands/archive.ts"
import { handleCorrect } from "./commands/correct.ts"
import { handleExport } from "./commands/export.ts"
import { handleForget } from "./commands/forget.ts"
import { handleImport } from "./commands/import.ts"
import { handleList } from "./commands/list.ts"
import { handlePin } from "./commands/pin.ts"
import { handleRecall } from "./commands/recall.ts"
import { handleRemember } from "./commands/remember.ts"
import { handleRestore } from "./commands/restore.ts"
import { handleShow } from "./commands/show.ts"
import { handleStats } from "./commands/stats.ts"
import { handleUnpin } from "./commands/unpin.ts"
import { createContext, destroyContext } from "./context.ts"
import { launchTui } from "./tui/index.tsx"

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

const program = new Command()

program
  .name("moneta")
  .description("CLI for browsing and managing the Moneta shared memory store")
  .version("0.0.5")
  .option("--project-id <id>", "Project identifier (overrides MONETA_PROJECT_ID)")
  .option("--agent-id <id>", "Agent identity (overrides MONETA_AGENT_ID)")

// Apply global flags to the environment before any command runs.
// This ensures loadConfig() inside createContext() picks up the overrides.
program.hook("preAction", (thisCommand) => {
  const opts = thisCommand.opts<{ projectId?: string; agentId?: string }>()
  if (opts.projectId) {
    process.env.MONETA_PROJECT_ID = opts.projectId
  }
  if (opts.agentId) {
    process.env.MONETA_AGENT_ID = opts.agentId
  }
})

// ---------------------------------------------------------------------------
// moneta remember <content>
// ---------------------------------------------------------------------------

program
  .command("remember")
  .description("Store a new memory in the project")
  .argument("<content>", "The fact to remember (clear, self-contained statement)")
  .option("--tags <tags>", "Free-form tags (comma-separated)")
  .option("--repo <name>", "Repository this memory relates to")
  .option("--importance <level>", 'Importance: "normal", "high", or "critical"')
  .option("--json", "Output as JSON")
  .action(async (content: string, options: Record<string, unknown>) => {
    const ctx = await createContext()
    try {
      await handleRemember(content, options, ctx)
    } finally {
      await destroyContext(ctx)
    }
  })

// ---------------------------------------------------------------------------
// moneta recall <question>
// ---------------------------------------------------------------------------

program
  .command("recall")
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
      await handleRecall(question, options, ctx)
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
// moneta pin <id>
// ---------------------------------------------------------------------------

program
  .command("pin")
  .description("Pin a memory so it will never be archived")
  .argument("<id>", "Full UUID or short prefix (6+ chars)")
  .action(async (id: string) => {
    const ctx = await createContext()
    try {
      await handlePin(id, ctx)
    } finally {
      await destroyContext(ctx)
    }
  })

// ---------------------------------------------------------------------------
// moneta unpin <id>
// ---------------------------------------------------------------------------

program
  .command("unpin")
  .description("Unpin a memory, making it eligible for archival")
  .argument("<id>", "Full UUID or short prefix (6+ chars)")
  .action(async (id: string) => {
    const ctx = await createContext()
    try {
      await handleUnpin(id, ctx)
    } finally {
      await destroyContext(ctx)
    }
  })

// ---------------------------------------------------------------------------
// moneta archive <id>
// ---------------------------------------------------------------------------

program
  .command("archive")
  .description("Manually archive a memory")
  .argument("<id>", "Full UUID or short prefix (6+ chars)")
  .action(async (id: string) => {
    const ctx = await createContext()
    try {
      await handleArchive(id, ctx)
    } finally {
      await destroyContext(ctx)
    }
  })

// ---------------------------------------------------------------------------
// moneta restore <id>
// ---------------------------------------------------------------------------

program
  .command("restore")
  .description("Restore an archived memory to active")
  .argument("<id>", "Full UUID or short prefix (6+ chars)")
  .action(async (id: string) => {
    const ctx = await createContext()
    try {
      await handleRestore(id, ctx)
    } finally {
      await destroyContext(ctx)
    }
  })

// ---------------------------------------------------------------------------
// moneta forget <id>
// ---------------------------------------------------------------------------

program
  .command("forget")
  .description("Permanently delete a memory")
  .argument("<id>", "Full UUID or short prefix (6+ chars)")
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (id: string, options: Record<string, unknown>) => {
    const ctx = await createContext()
    try {
      await handleForget(id, options, ctx)
    } finally {
      await destroyContext(ctx)
    }
  })

// ---------------------------------------------------------------------------
// moneta correct <id> <new-content>
// ---------------------------------------------------------------------------

program
  .command("correct")
  .description("Update a memory's content")
  .argument("<id>", "Full UUID or short prefix (6+ chars)")
  .argument("<new-content>", "The corrected fact")
  .action(async (id: string, newContent: string) => {
    const ctx = await createContext()
    try {
      await handleCorrect(id, newContent, ctx)
    } finally {
      await destroyContext(ctx)
    }
  })

// ---------------------------------------------------------------------------
// moneta export
// ---------------------------------------------------------------------------

program
  .command("export")
  .description("Export memories as JSON to stdout")
  .option("--all", "Include archived memories (default: active only)")
  .action(async (options: Record<string, unknown>) => {
    const ctx = await createContext()
    try {
      await handleExport(options, ctx)
    } finally {
      await destroyContext(ctx)
    }
  })

// ---------------------------------------------------------------------------
// moneta import <file>
// ---------------------------------------------------------------------------

program
  .command("import")
  .description("Import memories from a JSONL file")
  .argument("<file>", "Path to JSONL file")
  .action(async (file: string) => {
    const ctx = await createContext()
    try {
      await handleImport(file, ctx)
    } finally {
      await destroyContext(ctx)
    }
  })

// ---------------------------------------------------------------------------
// moneta tui
// ---------------------------------------------------------------------------

program
  .command("tui")
  .description("Launch the interactive terminal UI")
  .action(async () => {
    const ctx = await createContext()
    try {
      await launchTui(ctx)
    } finally {
      await destroyContext(ctx)
    }
  })

// ---------------------------------------------------------------------------
// Default action: launch TUI when no command is given
// ---------------------------------------------------------------------------

program.action(async () => {
  const ctx = await createContext()
  try {
    await launchTui(ctx)
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
