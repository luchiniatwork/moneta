import type { MemoryRow } from "@moneta/shared"
import { z } from "zod"

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/** All known API error codes. */
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "MEMORY_NOT_FOUND"
  | "CONTENT_TOO_LONG"
  | "CONTENT_EMPTY"
  | "UNAUTHORIZED"
  | "PROJECT_ID_REQUIRED"
  | "AGENT_ID_REQUIRED"
  | "AGENT_ID_INVALID"
  | "EMBEDDING_FAILED"
  | "DATABASE_ERROR"

/** Structured API error response body. */
export interface ApiError {
  error: {
    code: ApiErrorCode
    message: string
  }
}

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

/** Zod schema for the remember request body. */
export const RememberRequestSchema = z.object({
  content: z.string().min(1, "content must not be empty"),
  tags: z.array(z.string()).optional(),
  repo: z.string().optional(),
  importance: z.enum(["normal", "high", "critical"]).optional(),
})

/** Inferred type for the remember request body. */
export type RememberRequest = z.infer<typeof RememberRequestSchema>

/** Zod schema for the recall request body. */
export const RecallRequestSchema = z.object({
  question: z.string().min(1, "question must not be empty"),
  scope: z
    .object({
      agent: z.string().optional(),
      engineer: z.string().optional(),
      repo: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  limit: z.number().int().positive().optional(),
  includeArchived: z.boolean().optional(),
})

/** Inferred type for the recall request body. */
export type RecallRequest = z.infer<typeof RecallRequestSchema>

/** Zod schema for the correct request body. */
export const CorrectRequestSchema = z.object({
  newContent: z.string().min(1, "newContent must not be empty"),
})

/** Inferred type for the correct request body. */
export type CorrectRequest = z.infer<typeof CorrectRequestSchema>

/** Zod schema for the import request body. */
export const ImportRequestSchema = z.object({
  memories: z.array(
    z.object({
      content: z.string().min(1, "content must not be empty"),
      tags: z.array(z.string()).optional(),
      repo: z.string().optional(),
      importance: z.enum(["normal", "high", "critical"]).optional(),
    }),
  ),
})

/** Inferred type for the import request body. */
export type ImportRequest = z.infer<typeof ImportRequestSchema>

/** Zod schema for the touch request body. */
export const TouchRequestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "ids must contain at least one ID"),
})

/** Inferred type for the touch request body. */
export type TouchRequest = z.infer<typeof TouchRequestSchema>

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/** A memory in camelCase format for API responses. */
export interface MemoryResponse {
  id: string
  projectId: string
  content: string
  createdBy: string
  engineer: string | null
  agentType: string | null
  repo: string | null
  tags: string[]
  importance: string
  pinned: boolean
  archived: boolean
  createdAt: string
  updatedAt: string
  lastAccessedAt: string
  accessCount: number
}

/** Response body for the remember endpoint. */
export interface RememberResponse {
  id: string
  content: string
  deduplicated: boolean
}

/** Response body for the recall endpoint. */
export interface RecallResponse {
  memories: Array<{
    id: string
    content: string
    similarity: number
    createdBy: string
    engineer: string | null
    repo: string | null
    tags: string[]
    importance: string
    pinned: boolean
    archived: boolean
    accessCount: number
    createdAt: string
    lastAccessedAt: string
  }>
}

/** Response body for the correct endpoint. */
export interface CorrectResponse {
  id: string
  oldContent: string
  newContent: string
}

/** Response body for the import endpoint. */
export interface ImportResponse {
  imported: number
  skipped: number
  errors?: string[]
}

/** Response body for the list memories endpoint. */
export interface ListMemoriesResponse {
  memories: MemoryResponse[]
  total: number
}

/** Response body for the health endpoint. */
export interface HealthResponse {
  status: string
  version: string
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

/**
 * Map a snake_case database MemoryRow to a camelCase API MemoryResponse.
 *
 * Excludes the embedding vector (large and not useful to clients).
 *
 * @param row - Database row from project_memory
 * @returns camelCase memory object for JSON responses
 */
export function mapMemoryRow(row: MemoryRow): MemoryResponse {
  return {
    id: row.id,
    projectId: row.project_id,
    content: row.content,
    createdBy: row.created_by,
    engineer: row.engineer,
    agentType: row.agent_type,
    repo: row.repo,
    tags: row.tags,
    importance: row.importance,
    pinned: row.pinned,
    archived: row.archived,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    lastAccessedAt: row.last_accessed_at.toISOString(),
    accessCount: row.access_count,
  }
}
