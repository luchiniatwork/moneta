import type { Generated, Insertable, Kysely, Selectable, Updateable } from "kysely"

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** Importance levels for a memory. Critical memories are auto-pinned. */
export type Importance = "normal" | "high" | "critical"

/** Decomposed agent identity from the `engineer/agent-type` format. */
export interface AgentIdentity {
  /** Full identity string, e.g. "alice/code-reviewer" */
  createdBy: string
  /** Engineer prefix, null for autonomous agents ("auto/...") */
  engineer: string | null
  /** Agent type suffix, e.g. "code-reviewer" */
  agentType: string
}

/** Scope filters for narrowing recall results. */
export interface SearchScope {
  /** Only this agent's memories, e.g. "alice/code-reviewer" */
  agent?: string
  /** Only this engineer's agents, e.g. "alice" */
  engineer?: string
  /** Only this repository */
  repo?: string
  /** Must have all of these tags */
  tags?: string[]
}

/** A memory as returned by recall (includes similarity score). */
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
  createdAt: Date
  lastAccessedAt: Date
}

/** Result of a remember operation. */
export interface RememberResult {
  id: string
  content: string
  deduplicated: boolean
}

/** Result of a dedup check. */
export interface DedupMatch {
  id: string
  content: string
  similarity: number
  createdBy: string
}

/** Result of a correct operation. */
export interface CorrectResult {
  id: string
  oldContent: string
  newContent: string
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface Config {
  /** Project identifier, e.g. "acme-platform" */
  projectId: string
  /** PostgreSQL connection string */
  databaseUrl: string
  /** OpenAI API key for embeddings */
  openaiApiKey: string
  /** Agent identity, e.g. "alice/code-reviewer" (required for MCP server) */
  agentId?: string
  /** Embedding model name */
  embeddingModel: string
  /** Days before a memory is eligible for archival */
  archiveAfterDays: number
  /** Similarity threshold for dedup detection */
  dedupThreshold: number
  /** Minimum similarity for search results */
  searchThreshold: number
  /** Default max search results */
  searchLimit: number
  /** Maximum characters per memory content */
  maxContentLength: number
  /** Base URL of the Moneta REST API server (e.g. "http://localhost:3000/api/v1") */
  apiUrl?: string
  /** API key for authenticating with the REST API server */
  apiKey?: string
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

/** Aggregate memory counts used in headers and list footers. */
export interface MemoryCounts {
  active: number
  archived: number
  pinned: number
}

/** Aggregate memory statistics for the stats dashboard. */
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

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/** Parameters for listing memories chronologically (no embedding needed). */
export interface ListMemoriesParams {
  /** Project identifier */
  projectId: string
  /** Maximum number of rows to return (default 20) */
  limit?: number
  /** Offset for pagination (default 0) */
  offset?: number
  /** Filter by agent identity (created_by) */
  agent?: string
  /** Filter by engineer */
  engineer?: string
  /** Filter by repository */
  repo?: string
  /** Filter by tags (must have all) */
  tags?: string[]
  /** Only pinned memories */
  pinned?: boolean
  /** Only archived memories (default false = active only) */
  archived?: boolean
  /** Only memories approaching archival (accessed > 20 days ago, not pinned, not archived) */
  stale?: boolean
  /** Column to sort by (default "created_at") */
  orderBy?: "created_at" | "updated_at" | "last_accessed_at"
  /** Sort direction (default "desc") */
  orderDirection?: "asc" | "desc"
}

// ---------------------------------------------------------------------------
// Kysely database interface
// ---------------------------------------------------------------------------

/** Kysely table definition for `project_memory`. */
export interface ProjectMemoryTable {
  id: Generated<string>
  project_id: string

  content: string
  embedding: string | null

  created_by: string
  engineer: string | null
  agent_type: string | null

  repo: string | null
  tags: Generated<string[]>

  importance: Generated<Importance>
  pinned: Generated<boolean>
  archived: Generated<boolean>

  created_at: Generated<Date>
  updated_at: Generated<Date>
  last_accessed_at: Generated<Date>
  access_count: Generated<number>
}

/** Full database schema for Kysely. */
export interface Database {
  project_memory: ProjectMemoryTable
}

/** Typed Kysely database instance for consumers that don't import Kysely directly. */
export type MonetaDb = Kysely<Database>

/** A selected row from project_memory. */
export type MemoryRow = Selectable<ProjectMemoryTable>

/** Shape for inserting into project_memory. */
export type NewMemory = Insertable<ProjectMemoryTable>

/** Shape for updating project_memory. */
export type MemoryUpdate = Updateable<ProjectMemoryTable>
