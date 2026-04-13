import pc from "picocolors"

// ---------------------------------------------------------------------------
// ID formatting
// ---------------------------------------------------------------------------

/**
 * Display the first 6 characters of a UUID for compact table views.
 *
 * @param uuid - Full UUID string
 * @returns First 6 characters
 */
export function shortId(uuid: string): string {
  return uuid.slice(0, 6)
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Format a date as a human-readable relative time string.
 *
 * @param date - The date to format relative to now
 * @returns Relative time string like "2h ago", "3d ago", "just now"
 */
export function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime()

  if (diff < MINUTE) return "just now"
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE)
    return `${mins}m ago`
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR)
    return `${hours}h ago`
  }
  const days = Math.floor(diff / DAY)
  return `${days}d ago`
}

/**
 * Format a date as a short age string (without "ago").
 *
 * @param date - The date to format relative to now
 * @returns Age string like "2h", "3d"
 */
export function age(date: Date): string {
  const diff = Date.now() - date.getTime()

  if (diff < MINUTE) return "<1m"
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`
  return `${Math.floor(diff / DAY)}d`
}

// ---------------------------------------------------------------------------
// Text formatting
// ---------------------------------------------------------------------------

/**
 * Truncate a string to a maximum length, appending "..." if truncated.
 *
 * @param text - Text to truncate
 * @param maxLen - Maximum length including the ellipsis
 * @returns Truncated string
 */
export function truncate(text: string, maxLen: number): string {
  // Replace newlines with spaces for single-line display
  const singleLine = text.replace(/\n/g, " ")
  if (singleLine.length <= maxLen) return singleLine
  return `${singleLine.slice(0, maxLen - 3)}...`
}

/**
 * Pad a string to a fixed width (right-padded with spaces).
 *
 * @param text - Text to pad
 * @param width - Target width
 * @returns Padded string
 */
export function pad(text: string, width: number): string {
  if (text.length >= width) return text
  return text + " ".repeat(width - text.length)
}

// ---------------------------------------------------------------------------
// Table formatting
// ---------------------------------------------------------------------------

/** Column definition for table rendering. */
export interface Column {
  /** Column header label */
  label: string
  /** Fixed width in characters */
  width: number
  /** Alignment (default "left") */
  align?: "left" | "right"
}

/**
 * Render a formatted table to stdout with aligned columns and header.
 *
 * @param columns - Column definitions
 * @param rows - Array of row data (each row is an array of cell strings)
 */
export function printTable(columns: Column[], rows: string[][]): void {
  // Header
  const header = columns
    .map((col) => {
      const cell = col.align === "right" ? col.label.padStart(col.width) : pad(col.label, col.width)
      return cell
    })
    .join("  ")
  console.log(pc.bold(header))

  // Rows
  for (const row of rows) {
    const line = columns
      .map((col, i) => {
        const value = row[i] ?? ""
        return col.align === "right" ? value.padStart(col.width) : pad(value, col.width)
      })
      .join("  ")
    console.log(line)
  }
}

// ---------------------------------------------------------------------------
// Key-value formatting (detail views)
// ---------------------------------------------------------------------------

/**
 * Print aligned key-value pairs for detail views.
 *
 * @param pairs - Array of [key, value] tuples
 */
export function printKeyValue(pairs: [string, string][]): void {
  const maxKeyLen = Math.max(...pairs.map(([k]) => k.length))
  for (const [key, value] of pairs) {
    const paddedKey = pad(key, maxKeyLen)
    console.log(`  ${pc.bold(paddedKey)}  ${value}`)
  }
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

/**
 * Print data as formatted JSON (for --json flag).
 *
 * @param data - Data to serialize
 */
export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2))
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/**
 * Format tags array for display.
 *
 * @param tags - Array of tag strings
 * @returns Formatted string like "[arch, security]" or empty string
 */
export function formatTags(tags: string[]): string {
  if (tags.length === 0) return ""
  return `[${tags.join(", ")}]`
}

/** Re-export picocolors for commands to use directly. */
export { pc }
