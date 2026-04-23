// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** Importance level for a memory. */
export type Importance = "normal" | "high" | "critical"

/**
 * A memory as returned by the API.
 *
 * All dates are ISO 8601 strings. Fields use camelCase matching
 * the REST API contract.
 */
export interface Memory {
  id: string
  projectId: string
  content: string
  createdBy: string
  engineer: string | null
  agentType: string | null
  repo: string | null
  tags: string[]
  importance: Importance
  pinned: boolean
  archived: boolean
  createdAt: string
  updatedAt: string
  lastAccessedAt: string
  accessCount: number
}

/** A memory with a similarity score, returned by recall. */
export interface RecallResult {
  id: string
  content: string
  similarity: number
  createdBy: string
  engineer: string | null
  repo: string | null
  tags: string[]
  importance: Importance
  pinned: boolean
  archived: boolean
  accessCount: number
  createdAt: string
  lastAccessedAt: string
}

/** Scope filters for narrowing recall results. */
export interface SearchScope {
  agent?: string
  engineer?: string
  repo?: string
  tags?: string[]
}

// ---------------------------------------------------------------------------
// Request parameters
// ---------------------------------------------------------------------------

/** Parameters for the remember operation. */
export interface RememberParams {
  content: string
  tags?: string[]
  repo?: string
  importance?: Importance
}

/** Parameters for the recall operation. */
export interface RecallParams {
  question: string
  scope?: SearchScope
  limit?: number
  /** Override the server's default similarity threshold (0 < threshold <= 1). */
  threshold?: number
  includeArchived?: boolean
}

/** Parameters for listing memories chronologically. */
export interface ListParams {
  limit?: number
  offset?: number
  agent?: string
  engineer?: string
  repo?: string
  tags?: string[]
  pinned?: boolean
  archived?: boolean
  stale?: boolean
  orderBy?: "created_at" | "updated_at" | "last_accessed_at"
  orderDirection?: "asc" | "desc"
}

/** A single entry for bulk import. */
export interface ImportEntry {
  content: string
  tags?: string[]
  repo?: string
  importance?: Importance
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/** Result of a remember operation. */
export interface RememberResult {
  id: string
  content: string
  deduplicated: boolean
}

/** Result of a correct operation. */
export interface CorrectResult {
  id: string
  oldContent: string
  newContent: string
}

/** Result of a bulk import operation. */
export interface ImportResult {
  imported: number
  skipped: number
  errors?: number
}

/** Aggregate memory counts for headers. */
export interface MemoryCounts {
  active: number
  archived: number
  pinned: number
}

/** Full statistics dashboard data. */
export interface MemoryStats {
  total: number
  active: number
  archived: number
  pinned: number
  byEngineer: Array<{ engineer: string; count: number; pinned: number }>
  byRepo: Array<{ repo: string; count: number }>
  topTags: Array<{ tag: string; count: number }>
  approachingStale: number
  archivedLast7Days: number
  createdToday: number
  mostAccessed: Array<{ id: string; content: string; accessCount: number }>
}

/** Health check response. */
export interface HealthStatus {
  status: "ok" | "error"
  version: string
}

// ---------------------------------------------------------------------------
// Client options
// ---------------------------------------------------------------------------

/** Options for creating a Moneta API client. */
export interface ClientOptions {
  /** Base URL of the REST API (e.g. "http://localhost:3000/api/v1") */
  baseUrl: string
  /** Project identifier sent via X-Project-Id header on every request */
  projectId: string
  /** Bearer token for authentication (optional) */
  apiKey?: string
  /** Default agent identity for write operations (e.g. "alice/code-reviewer") */
  agentId?: string
}

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

/** The Moneta API client interface. */
export interface MonetaClient {
  // High-level (server handles embedding)
  remember(params: RememberParams): Promise<RememberResult>
  recall(params: RecallParams): Promise<RecallResult[]>
  correct(id: string, newContent: string): Promise<CorrectResult>

  // CRUD
  getMemory(id: string): Promise<Memory | null>
  listMemories(params?: ListParams): Promise<{ memories: Memory[]; total: number }>
  deleteMemory(id: string): Promise<boolean>

  // Lifecycle
  pin(id: string): Promise<Memory>
  unpin(id: string): Promise<Memory>
  archive(id: string): Promise<Memory>
  restore(id: string): Promise<Memory>

  // Bulk
  importMemories(memories: ImportEntry[]): Promise<ImportResult>
  exportMemories(filter?: { archived?: boolean | "all" }): Promise<Memory[]>

  // Analytics
  getStats(): Promise<MemoryStats>
  getCounts(): Promise<MemoryCounts>

  // Utility
  resolvePrefix(prefix: string): Promise<Memory[]>
  touchMemories(ids: string[]): Promise<number>

  // Admin
  archiveStale(): Promise<number>
  health(): Promise<HealthStatus>
}
