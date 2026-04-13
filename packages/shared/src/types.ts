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
