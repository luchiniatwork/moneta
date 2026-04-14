import { Kysely, sql } from "kysely"
import { PostgresJSDialect } from "kysely-postgres-js"
import postgres from "postgres"
import type {
  Database,
  DedupMatch,
  ListMemoriesParams,
  MemoryCounts,
  MemoryRow,
  MemoryStats,
  MemoryUpdate,
  NewMemory,
  RecallResult,
} from "./types.ts"

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/**
 * Create a Kysely database instance connected via postgres.js.
 *
 * @param connectionString - PostgreSQL connection URL
 */
export function createDb(connectionString: string): Kysely<Database> {
  const pg = postgres(connectionString)
  return new Kysely<Database>({
    dialect: new PostgresJSDialect({ postgres: pg }),
  })
}

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

/**
 * Format a number array as a PostgreSQL vector literal.
 * e.g. [0.1, 0.2, 0.3] → "[0.1,0.2,0.3]"
 */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/** Insert a new memory row. Returns the inserted row. */
export async function insertMemory(
  db: Kysely<Database>,
  memory: Omit<NewMemory, "embedding"> & { embedding?: number[] },
): Promise<MemoryRow> {
  const { embedding, ...rest } = memory

  if (embedding) {
    const vec = toVectorLiteral(embedding)
    const row = await db
      .insertInto("project_memory")
      .values({
        ...rest,
        embedding: sql`${vec}::vector(1536)` as unknown as string,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    return row
  }

  const row = await db
    .insertInto("project_memory")
    .values(rest)
    .returningAll()
    .executeTakeFirstOrThrow()
  return row
}

/** Get a memory by ID. Returns null if not found. */
export async function getMemoryById(db: Kysely<Database>, id: string): Promise<MemoryRow | null> {
  const row = await db
    .selectFrom("project_memory")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst()
  return row ?? null
}

/** Update a memory by ID. Returns the updated row. */
export async function updateMemory(
  db: Kysely<Database>,
  id: string,
  updates: MemoryUpdate & { newEmbedding?: number[] },
): Promise<MemoryRow> {
  const { newEmbedding, ...rest } = updates

  let query = db
    .updateTable("project_memory")
    .where("id", "=", id)
    .set({ ...rest, updated_at: new Date() })

  if (newEmbedding) {
    const vec = toVectorLiteral(newEmbedding)
    query = query.set({
      embedding: sql`${vec}::vector(1536)` as unknown as string,
    })
  }

  const row = await query.returningAll().executeTakeFirstOrThrow()
  return row
}

/** Hard-delete a memory by ID. Returns true if a row was deleted. */
export async function deleteMemory(db: Kysely<Database>, id: string): Promise<boolean> {
  const result = await db.deleteFrom("project_memory").where("id", "=", id).executeTakeFirst()
  return (result.numDeletedRows ?? 0n) > 0n
}

// ---------------------------------------------------------------------------
// Listing / prefix lookup
// ---------------------------------------------------------------------------

/**
 * List memories chronologically with optional filters.
 * Unlike `callRecall`, this does not require an embedding vector.
 *
 * @param db - Kysely database instance
 * @param params - Filters, pagination, and sort options
 * @returns Array of matching memory rows
 */
export async function listMemories(
  db: Kysely<Database>,
  params: ListMemoriesParams,
): Promise<MemoryRow[]> {
  const limit = params.limit ?? 20
  const offset = params.offset ?? 0
  const orderBy = params.orderBy ?? "created_at"
  const orderDirection = params.orderDirection ?? "desc"

  let query = db.selectFrom("project_memory").selectAll().where("project_id", "=", params.projectId)

  // Archived filter: default to active only
  if (params.stale) {
    // Stale: accessed > 20 days ago, not pinned, not archived
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
    query = query
      .where("last_accessed_at", "<", twentyDaysAgo)
      .where("pinned", "=", false)
      .where("archived", "=", false)
  } else if (params.archived === true) {
    query = query.where("archived", "=", true)
  } else if (params.archived !== undefined) {
    query = query.where("archived", "=", false)
  } else {
    // Default: active only
    query = query.where("archived", "=", false)
  }

  if (params.agent !== undefined) {
    query = query.where("created_by", "=", params.agent)
  }

  if (params.engineer !== undefined) {
    query = query.where("engineer", "=", params.engineer)
  }

  if (params.repo !== undefined) {
    query = query.where("repo", "=", params.repo)
  }

  if (params.pinned !== undefined) {
    query = query.where("pinned", "=", params.pinned)
  }

  if (params.tags !== undefined && params.tags.length > 0) {
    const tagsLiteral = `ARRAY[${params.tags.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}]::text[]`
    query = query.where(sql<boolean>`tags @> ${sql.raw(tagsLiteral)}`)
  }

  query = query.orderBy(orderBy, orderDirection).limit(limit).offset(offset)

  return await query.execute()
}

/**
 * Find memories whose UUID starts with the given prefix.
 * Used for short-ID lookups in the CLI (e.g. `moneta show a1b2c3`).
 *
 * @param db - Kysely database instance
 * @param projectId - Project to search within
 * @param prefix - UUID prefix string (typically 6+ characters)
 * @returns Matching memory rows (0, 1, or multiple)
 */
export async function findMemoryByIdPrefix(
  db: Kysely<Database>,
  projectId: string,
  prefix: string,
): Promise<MemoryRow[]> {
  return await db
    .selectFrom("project_memory")
    .selectAll()
    .where("project_id", "=", projectId)
    .where(sql<string>`id::text`, "like", `${prefix}%`)
    .limit(10)
    .execute()
}

// ---------------------------------------------------------------------------
// RPC wrappers (calling SQL functions)
// ---------------------------------------------------------------------------

/** Semantic search via the `recall()` SQL function. */
export async function callRecall(
  db: Kysely<Database>,
  params: {
    projectId: string
    embedding: number[]
    limit?: number
    threshold?: number
    includeArchived?: boolean
    agent?: string
    engineer?: string
    repo?: string
    tags?: string[]
  },
): Promise<RecallResult[]> {
  const vec = toVectorLiteral(params.embedding)
  const limit = params.limit ?? 10
  const threshold = params.threshold ?? 0.3
  const includeArchived = params.includeArchived ?? false
  const agent = params.agent ?? null
  const engineer = params.engineer ?? null
  const repo = params.repo ?? null
  const tags = params.tags ?? null

  const tagsLiteral = tags
    ? sql`${sql.raw(`ARRAY[${tags.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}]::text[]`)}`
    : sql`NULL::text[]`

  const rows = await sql<RecallResult>`
    SELECT * FROM recall(
      ${params.projectId},
      ${sql.raw(`'${vec}'::vector(1536)`)},
      ${limit},
      ${threshold},
      ${includeArchived},
      ${agent},
      ${engineer},
      ${repo},
      ${tagsLiteral}
    )
  `.execute(db)

  return rows.rows.map(mapRecallRow)
}

/** Bump access timestamps for recalled memories. */
export async function callTouchMemories(db: Kysely<Database>, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await sql`SELECT touch_memories(${sql.raw(`ARRAY[${ids.map((id) => `'${id}'::uuid`).join(",")}]`)})`.execute(
    db,
  )
}

/** Check for near-duplicate memories before insert. */
export async function callDedupCheck(
  db: Kysely<Database>,
  params: {
    projectId: string
    embedding: number[]
    threshold?: number
  },
): Promise<DedupMatch[]> {
  const vec = toVectorLiteral(params.embedding)
  const threshold = params.threshold ?? 0.95

  const rows = await sql<DedupMatch>`
    SELECT * FROM dedup_check(
      ${params.projectId},
      ${sql.raw(`'${vec}'::vector(1536)`)},
      ${threshold}
    )
  `.execute(db)

  return rows.rows.map((r) => {
    // The SQL dedup_check() function returns snake_case columns
    const raw = r as unknown as Record<string, unknown>
    return {
      id: String(raw.id),
      content: String(raw.content),
      similarity: Number(raw.similarity),
      createdBy: String(raw.created_by),
    }
  })
}

/** Archive stale memories. Returns count of archived rows. */
export async function callArchiveStale(
  db: Kysely<Database>,
  staleIntervalDays: number = 30,
): Promise<number> {
  const result = await sql<{ archive_stale: number }>`
    SELECT archive_stale(${sql.raw(`INTERVAL '${staleIntervalDays} days'`)})
  `.execute(db)

  return Number(result.rows[0]?.archive_stale ?? 0)
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

/**
 * Fetch aggregate memory counts for a project.
 *
 * @param db - Kysely database instance
 * @param projectId - Project identifier
 * @returns Active, archived, and pinned counts
 */
export async function getCounts(db: Kysely<Database>, projectId: string): Promise<MemoryCounts> {
  const result = await sql<{
    active: string
    archived: string
    pinned: string
  }>`
    SELECT
      COUNT(*) FILTER (WHERE NOT archived) AS active,
      COUNT(*) FILTER (WHERE archived)     AS archived,
      COUNT(*) FILTER (WHERE pinned)       AS pinned
    FROM project_memory
    WHERE project_id = ${projectId}
  `.execute(db)

  const row = result.rows[0]
  return {
    active: Number(row?.active ?? 0),
    archived: Number(row?.archived ?? 0),
    pinned: Number(row?.pinned ?? 0),
  }
}

/**
 * Gather aggregate memory statistics from the database.
 *
 * Runs multiple independent queries in parallel for efficiency.
 *
 * @param db - Kysely database instance
 * @param projectId - Project identifier
 * @returns Full statistics dashboard data
 */
export async function getStats(db: Kysely<Database>, projectId: string): Promise<MemoryStats> {
  const [counts, byEngineer, byRepo, topTags, archivalMetrics, mostAccessed] = await Promise.all([
    fetchStatsCounts(db, projectId),
    fetchByEngineer(db, projectId),
    fetchByRepo(db, projectId),
    fetchTopTags(db, projectId),
    fetchArchivalMetrics(db, projectId),
    fetchMostAccessed(db, projectId),
  ])

  return {
    ...counts,
    byEngineer,
    byRepo,
    topTags,
    ...archivalMetrics,
    mostAccessed,
  }
}

async function fetchStatsCounts(
  db: Kysely<Database>,
  projectId: string,
): Promise<{ total: number; active: number; archived: number; pinned: number }> {
  const result = await sql<{
    total: string
    active: string
    archived: string
    pinned: string
  }>`
    SELECT
      COUNT(*)                                  AS total,
      COUNT(*) FILTER (WHERE NOT archived)      AS active,
      COUNT(*) FILTER (WHERE archived)          AS archived,
      COUNT(*) FILTER (WHERE pinned)            AS pinned
    FROM project_memory
    WHERE project_id = ${projectId}
  `.execute(db)

  const row = result.rows[0]
  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    archived: Number(row?.archived ?? 0),
    pinned: Number(row?.pinned ?? 0),
  }
}

async function fetchByEngineer(
  db: Kysely<Database>,
  projectId: string,
): Promise<Array<{ engineer: string; count: number; pinned: number }>> {
  const result = await sql<{ engineer: string; count: string; pinned: string }>`
    SELECT
      COALESCE(engineer, 'auto') AS engineer,
      COUNT(*)                   AS count,
      COUNT(*) FILTER (WHERE pinned) AS pinned
    FROM project_memory
    WHERE project_id = ${projectId} AND NOT archived
    GROUP BY COALESCE(engineer, 'auto')
    ORDER BY count DESC
  `.execute(db)

  return result.rows.map((r) => ({
    engineer: String(r.engineer),
    count: Number(r.count),
    pinned: Number(r.pinned),
  }))
}

async function fetchByRepo(
  db: Kysely<Database>,
  projectId: string,
): Promise<Array<{ repo: string; count: number }>> {
  const result = await sql<{ repo: string; count: string }>`
    SELECT
      COALESCE(repo, '(no repo)') AS repo,
      COUNT(*)                    AS count
    FROM project_memory
    WHERE project_id = ${projectId} AND NOT archived
    GROUP BY COALESCE(repo, '(no repo)')
    ORDER BY count DESC
  `.execute(db)

  return result.rows.map((r) => ({
    repo: String(r.repo),
    count: Number(r.count),
  }))
}

async function fetchTopTags(
  db: Kysely<Database>,
  projectId: string,
): Promise<Array<{ tag: string; count: number }>> {
  const result = await sql<{ tag: string; count: string }>`
    SELECT
      unnest(tags) AS tag,
      COUNT(*)     AS count
    FROM project_memory
    WHERE project_id = ${projectId} AND NOT archived
    GROUP BY tag
    ORDER BY count DESC
    LIMIT 10
  `.execute(db)

  return result.rows.map((r) => ({
    tag: String(r.tag),
    count: Number(r.count),
  }))
}

async function fetchArchivalMetrics(
  db: Kysely<Database>,
  projectId: string,
): Promise<{ approachingStale: number; archivedLast7Days: number; createdToday: number }> {
  const result = await sql<{
    approaching_stale: string
    archived_last_7_days: string
    created_today: string
  }>`
    SELECT
      COUNT(*) FILTER (
        WHERE NOT pinned AND NOT archived
          AND last_accessed_at < now() - INTERVAL '20 days'
      ) AS approaching_stale,
      COUNT(*) FILTER (
        WHERE archived AND updated_at > now() - INTERVAL '7 days'
      ) AS archived_last_7_days,
      COUNT(*) FILTER (
        WHERE created_at > date_trunc('day', now())
      ) AS created_today
    FROM project_memory
    WHERE project_id = ${projectId}
  `.execute(db)

  const row = result.rows[0]
  return {
    approachingStale: Number(row?.approaching_stale ?? 0),
    archivedLast7Days: Number(row?.archived_last_7_days ?? 0),
    createdToday: Number(row?.created_today ?? 0),
  }
}

async function fetchMostAccessed(
  db: Kysely<Database>,
  projectId: string,
): Promise<Array<{ id: string; content: string; accessCount: number }>> {
  const result = await sql<{ id: string; content: string; access_count: string }>`
    SELECT id, content, access_count
    FROM project_memory
    WHERE project_id = ${projectId} AND NOT archived
    ORDER BY access_count DESC
    LIMIT 3
  `.execute(db)

  return result.rows.map((r) => ({
    id: String(r.id),
    content: String(r.content),
    accessCount: Number(r.access_count),
  }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRecallRow(row: RecallResult): RecallResult {
  // The SQL recall() function returns snake_case columns; cast to access raw keys
  const raw = row as unknown as Record<string, unknown>
  return {
    id: String(raw.id),
    content: String(raw.content),
    similarity: Number(raw.similarity),
    createdBy: String(raw.created_by),
    engineer: raw.engineer ? String(raw.engineer) : null,
    repo: raw.repo ? String(raw.repo) : null,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    importance: raw.importance as RecallResult["importance"],
    pinned: Boolean(raw.pinned),
    archived: Boolean(raw.archived),
    accessCount: Number(raw.access_count),
    createdAt: new Date(raw.created_at as string),
    lastAccessedAt: new Date(raw.last_accessed_at as string),
  }
}
