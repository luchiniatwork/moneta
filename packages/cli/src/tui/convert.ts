import type { Memory, RecallResult } from "@moneta/api-client"
import type { MemoryItem } from "./types.ts"

// ---------------------------------------------------------------------------
// Converters: RecallResult / Memory → MemoryItem
// ---------------------------------------------------------------------------

/**
 * Convert a semantic search result into a unified MemoryItem.
 *
 * Parses ISO string dates from the API response into Date objects.
 *
 * @param r - Recall result from the API
 * @returns Normalized memory item with similarity score
 */
export function fromRecallResult(r: RecallResult): MemoryItem {
  return {
    id: r.id,
    content: r.content,
    similarity: r.similarity,
    createdBy: r.createdBy,
    engineer: r.engineer,
    agentType: null,
    repo: r.repo,
    tags: r.tags,
    importance: r.importance,
    pinned: r.pinned,
    archived: r.archived,
    accessCount: r.accessCount,
    createdAt: new Date(r.createdAt),
    // RecallResult does not include updatedAt; fall back to createdAt
    updatedAt: new Date(r.createdAt),
    lastAccessedAt: new Date(r.lastAccessedAt),
  }
}

/**
 * Convert an API memory into a unified MemoryItem.
 *
 * Parses ISO string dates from the API response into Date objects.
 *
 * @param m - Memory from the API (camelCase fields, dates as strings)
 * @returns Normalized memory item
 */
export function fromMemory(m: Memory): MemoryItem {
  return {
    id: m.id,
    content: m.content,
    createdBy: m.createdBy,
    engineer: m.engineer,
    agentType: m.agentType,
    repo: m.repo,
    tags: m.tags,
    importance: m.importance,
    pinned: m.pinned,
    archived: m.archived,
    accessCount: m.accessCount,
    createdAt: new Date(m.createdAt),
    updatedAt: new Date(m.updatedAt),
    lastAccessedAt: new Date(m.lastAccessedAt),
  }
}
