import type { Importance } from "@moneta/shared"

// ---------------------------------------------------------------------------
// Modes & Overlays
// ---------------------------------------------------------------------------

/** Active view mode in the TUI. */
export type Mode = "search" | "list" | "stats"

/** Active overlay (rendered on top of the current mode). */
export type Overlay = "none" | "help" | "confirm" | "filters" | "tags"

// ---------------------------------------------------------------------------
// Unified memory item
// ---------------------------------------------------------------------------

/**
 * Normalized memory representation used by all TUI components.
 *
 * Bridges the snake_case `MemoryRow` (from list queries) and the
 * camelCase `RecallResult` (from semantic search) into a single shape.
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
