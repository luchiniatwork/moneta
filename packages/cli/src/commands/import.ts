import { readFileSync } from "node:fs"
import type { Importance, ImportEntry } from "@moneta/api-client"
import type { CliContext } from "../context.ts"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_IMPORTANCE_VALUES = new Set<string>(["normal", "high", "critical"])

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `moneta import <file>` command.
 *
 * Reads a JSONL file (one JSON object per line), validates entries,
 * and sends them to the API for bulk import. The server handles
 * embedding, deduplication, and insertion.
 *
 * @param file - Path to the JSONL file
 * @param ctx - CLI context with config and API client
 */
export async function handleImport(file: string, ctx: CliContext): Promise<void> {
  // Read and parse file
  const entries = parseJsonlFile(file, ctx.config.maxContentLength)

  if (entries.length === 0) {
    console.log("No entries found in file.")
    return
  }

  progress(`Parsed ${entries.length} entries from ${file}`)
  progress("Sending to API for import...")

  // Send to API for bulk import
  const result = await ctx.client.importMemories(entries)

  // Print summary
  const parts = [`Imported ${result.imported} memories.`]
  if (result.skipped > 0) {
    parts.push(`${result.skipped} near-duplicates skipped.`)
  }
  if (result.errors && result.errors > 0) {
    parts.push(`${result.errors} errors.`)
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
// Progress reporting
// ---------------------------------------------------------------------------

/**
 * Print a progress message to stderr (so it doesn't interfere with
 * piped output).
 */
function progress(message: string): void {
  process.stderr.write(`[moneta] ${message}\n`)
}
