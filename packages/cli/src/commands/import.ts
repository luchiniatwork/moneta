import { readFileSync } from "node:fs"
import type { Importance } from "@moneta/shared"
import { callDedupCheck, embedBatch, insertMemory, parseAgentId } from "@moneta/shared"
import type { CliContext } from "../context.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options parsed from CLI flags for the import command. */
export interface ImportOptions {
  agent?: string
}

/** Shape of a single entry in the JSONL import file. */
interface ImportEntry {
  content: string
  tags?: string[]
  repo?: string
  importance?: Importance
}

/** Result summary of an import operation. */
interface ImportSummary {
  imported: number
  skipped: number
  errors: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_IMPORTANCE_VALUES = new Set<string>(["normal", "high", "critical"])
const EMBEDDING_BATCH_SIZE = 100

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `moneta import <file>` command.
 *
 * Reads a JSONL file (one JSON object per line), generates embeddings
 * in batch, checks for near-duplicates, and inserts new memories.
 * Progress is reported to stderr so it doesn't pollute stdout.
 *
 * @param file - Path to the JSONL file
 * @param options - CLI flag values
 * @param ctx - CLI context with config and database
 */
export async function handleImport(
  file: string,
  options: ImportOptions,
  ctx: CliContext,
): Promise<void> {
  const agentStr = options.agent ?? "cli/import"
  const identity = parseAgentId(agentStr)

  // Read and parse file
  const entries = parseJsonlFile(file, ctx.config.maxContentLength)

  if (entries.length === 0) {
    console.log("No entries found in file.")
    return
  }

  progress(`Parsed ${entries.length} entries from ${file}`)

  // Generate embeddings in batches
  const texts = entries.map((e) => e.content)
  const embeddings = await generateEmbeddings(texts, ctx)

  // Insert with dedup checks
  const summary = await insertWithDedup(entries, embeddings, identity, ctx)

  // Print summary
  const parts = [`Imported ${summary.imported} memories.`]
  if (summary.skipped > 0) {
    parts.push(`${summary.skipped} near-duplicates skipped.`)
  }
  if (summary.errors > 0) {
    parts.push(`${summary.errors} errors.`)
  }
  console.log(parts.join(" "))
}

// ---------------------------------------------------------------------------
// File parsing
// ---------------------------------------------------------------------------

/**
 * Parse a JSONL file into validated import entries.
 *
 * @param filePath - Path to the JSONL file
 * @param maxContentLength - Maximum allowed content length
 * @returns Array of validated import entries
 * @throws If the file cannot be read
 */
function parseJsonlFile(filePath: string, maxContentLength: number): ImportEntry[] {
  let raw: string
  try {
    raw = readFileSync(filePath, "utf-8")
  } catch (error) {
    throw new Error(
      `Cannot read file: ${filePath} (${error instanceof Error ? error.message : String(error)})`,
    )
  }

  const lines = raw.split("\n").filter((line) => line.trim().length > 0)
  const entries: ImportEntry[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    const lineNum = i + 1

    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      progress(`Warning: line ${lineNum} is not valid JSON, skipping`)
      continue
    }

    const entry = validateEntry(parsed, lineNum, maxContentLength)
    if (entry) {
      entries.push(entry)
    }
  }

  return entries
}

/**
 * Validate a parsed JSON object as an import entry.
 *
 * @param data - Parsed JSON value
 * @param lineNum - Line number for error messages
 * @param maxContentLength - Maximum allowed content length
 * @returns Validated entry or null if invalid
 */
function validateEntry(
  data: unknown,
  lineNum: number,
  maxContentLength: number,
): ImportEntry | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    progress(`Warning: line ${lineNum} is not a JSON object, skipping`)
    return null
  }

  const obj = data as Record<string, unknown>

  if (typeof obj.content !== "string" || !obj.content.trim()) {
    progress(`Warning: line ${lineNum} missing or empty "content" field, skipping`)
    return null
  }

  if (obj.content.length > maxContentLength) {
    progress(`Warning: line ${lineNum} content exceeds ${maxContentLength} chars, skipping`)
    return null
  }

  const entry: ImportEntry = { content: obj.content }

  if (obj.tags !== undefined) {
    if (Array.isArray(obj.tags) && obj.tags.every((t: unknown) => typeof t === "string")) {
      entry.tags = obj.tags as string[]
    } else {
      progress(`Warning: line ${lineNum} has invalid "tags" (expected string[]), ignoring tags`)
    }
  }

  if (obj.repo !== undefined) {
    if (typeof obj.repo === "string") {
      entry.repo = obj.repo
    } else {
      progress(`Warning: line ${lineNum} has invalid "repo" (expected string), ignoring repo`)
    }
  }

  if (obj.importance !== undefined) {
    if (typeof obj.importance === "string" && VALID_IMPORTANCE_VALUES.has(obj.importance)) {
      entry.importance = obj.importance as Importance
    } else {
      progress(
        `Warning: line ${lineNum} has invalid "importance" (expected normal/high/critical), ignoring`,
      )
    }
  }

  return entry
}

// ---------------------------------------------------------------------------
// Embedding generation
// ---------------------------------------------------------------------------

/**
 * Generate embeddings for all texts in batches, with progress reporting.
 *
 * @param texts - Array of texts to embed
 * @param ctx - CLI context
 * @returns Array of embedding vectors in the same order as input
 */
async function generateEmbeddings(texts: string[], ctx: CliContext): Promise<number[][]> {
  const allEmbeddings: number[][] = []

  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const end = Math.min(start + EMBEDDING_BATCH_SIZE, texts.length)
    const chunk = texts.slice(start, end)

    progress(`Embedding ${start + 1}–${end} of ${texts.length}...`)

    const embeddings = await embedBatch(chunk, ctx.config.openaiApiKey, ctx.config.embeddingModel)
    allEmbeddings.push(...embeddings)
  }

  return allEmbeddings
}

// ---------------------------------------------------------------------------
// Insertion with dedup
// ---------------------------------------------------------------------------

/**
 * Insert entries with dedup checking, matching the MCP server's
 * remember tool behavior.
 *
 * @param entries - Validated import entries
 * @param embeddings - Pre-computed embeddings (same order as entries)
 * @param identity - Parsed agent identity for attribution
 * @param ctx - CLI context
 * @returns Summary of imported, skipped, and errored entries
 */
async function insertWithDedup(
  entries: ImportEntry[],
  embeddings: number[][],
  identity: ReturnType<typeof parseAgentId>,
  ctx: CliContext,
): Promise<ImportSummary> {
  let imported = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as ImportEntry
    const embedding = embeddings[i] as number[]

    if ((i + 1) % 50 === 0 || i === entries.length - 1) {
      progress(`Inserting ${i + 1} of ${entries.length}...`)
    }

    try {
      // Check for near-duplicates
      const duplicates = await callDedupCheck(ctx.db, {
        projectId: ctx.config.projectId,
        embedding,
        threshold: ctx.config.dedupThreshold,
      })

      if (duplicates.length > 0) {
        skipped++
        continue
      }

      // Insert new memory
      const effectiveImportance = entry.importance ?? "normal"

      await insertMemory(ctx.db, {
        project_id: ctx.config.projectId,
        content: entry.content,
        embedding,
        created_by: identity.createdBy,
        engineer: identity.engineer,
        agent_type: identity.agentType,
        repo: entry.repo ?? null,
        tags: entry.tags,
        importance: effectiveImportance,
        pinned: effectiveImportance === "critical",
      })

      imported++
    } catch (error) {
      progress(`Error on entry ${i + 1}: ${error instanceof Error ? error.message : String(error)}`)
      errors++
    }
  }

  return { imported, skipped, errors }
}

// ---------------------------------------------------------------------------
// Progress reporting
// ---------------------------------------------------------------------------

/**
 * Print a progress message to stderr (so it doesn't interfere with
 * piped output).
 */
function progress(message: string): void {
  process.stderr.write(`[moneta] ${message}\n`)
}
