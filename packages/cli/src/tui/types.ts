import type { Importance } from "@moneta/api-client"

// ---------------------------------------------------------------------------
// Modes & Overlays
// ---------------------------------------------------------------------------

/** Active view mode in the TUI. */
export type Mode = "recall" | "list" | "stats"

/** Active overlay (rendered on top of the current mode). */
export type Overlay = "none" | "help" | "confirm" | "filters" | "tags" | "add"

// ---------------------------------------------------------------------------
// Unified memory item
// ---------------------------------------------------------------------------

/**
 * Normalized memory representation used by all TUI components.
 *
 * Bridges the API `Memory` and `RecallResult` types (both camelCase
 * with ISO string dates) into a single shape with parsed Date objects
 * for easy formatting.
 */
export interface MemoryItem {
  id: string
  content: string
  /** Similarity score — only present in search results. */
  similarity?: number
  createdBy: string
  engineer: string | null
  agentType: string | null
  repo: string | null
  tags: string[]
  importance: Importance
  pinned: boolean
  archived: boolean
  accessCount: number
  createdAt: Date
  updatedAt: Date
  lastAccessedAt: Date
}

// ---------------------------------------------------------------------------
// Header counts
// ---------------------------------------------------------------------------

/** Aggregate counts shown in the header bar. */
export interface MemoryCounts {
  active: number
  archived: number
  pinned: number
}

// ---------------------------------------------------------------------------
// Filter state (list mode)
// ---------------------------------------------------------------------------

/** Filter values applied in list mode. */
export interface FilterState {
  agent: string
  engineer: string
  repo: string
  tags: string
  archived: boolean
  pinned: boolean
}

/** Default (empty) filters. */
export const EMPTY_FILTERS: FilterState = {
  agent: "",
  engineer: "",
  repo: "",
  tags: "",
  archived: false,
  pinned: false,
} as const
