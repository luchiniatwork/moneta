import type { MemoryRow, RecallResult } from "@moneta/shared"
import type { MemoryItem } from "./types.ts"

// ---------------------------------------------------------------------------
// Converters: RecallResult / MemoryRow → MemoryItem
// ---------------------------------------------------------------------------

/**
 * Convert a semantic search result into a unified MemoryItem.
 *
 * @param r - Recall result from the database
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
    createdAt: r.createdAt,
    // RecallResult does not include updatedAt; fall back to createdAt
    updatedAt: r.createdAt,
    lastAccessedAt: r.lastAccessedAt,
  }
}

/**
 * Convert a database row into a unified MemoryItem.
 *
 * @param r - Raw database row (snake_case fields)
 * @returns Normalized memory item
 */
export function fromMemoryRow(r: MemoryRow): MemoryItem {
  return {
    id: r.id,
    content: r.content,
    createdBy: r.created_by,
    engineer: r.engineer,
    agentType: r.agent_type,
    repo: r.repo,
    tags: r.tags,
    importance: r.importance,
    pinned: r.pinned,
    archived: r.archived,
    accessCount: r.access_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastAccessedAt: r.last_accessed_at,
  }
}
