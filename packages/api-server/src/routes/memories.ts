import type { AgentIdentity, Config, MonetaDb } from "@moneta/shared"
import {
  callTouchMemories,
  deleteMemory,
  findMemoryByIdPrefix,
  getMemoryById,
  listMemories,
  updateMemory,
} from "@moneta/shared"
import { Hono } from "hono"
import { handleCorrect } from "../handlers/correct.ts"
import { handleImport } from "../handlers/import.ts"
import { createAgentIdMiddleware } from "../middleware/agent-id.ts"
import {
  CorrectRequestSchema,
  ImportRequestSchema,
  mapMemoryRow,
  TouchRequestSchema,
} from "../types.ts"

// ---------------------------------------------------------------------------
// Memories CRUD + lifecycle routes
// ---------------------------------------------------------------------------

/**
 * Create all memory CRUD, lifecycle, and bulk operation routes.
 *
 * @param config - Server configuration
 * @param db - Database instance
 * @returns Hono app with memory routes
 */
export function createMemoriesRoute(config: Config, db: MonetaDb): Hono {
  const app = new Hono()

  // -------------------------------------------------------------------------
  // GET /memories — list memories with filters
  // -------------------------------------------------------------------------
  app.get("/memories", async (c) => {
    const limit = parseInt(c.req.query("limit") ?? "20", 10)
    const offset = parseInt(c.req.query("offset") ?? "0", 10)
    const agent = c.req.query("agent")
    const engineer = c.req.query("engineer")
    const repo = c.req.query("repo")
    const tagsParam = c.req.query("tags")
    const pinnedParam = c.req.query("pinned")
    const archivedParam = c.req.query("archived")
    const staleParam = c.req.query("stale")
    const orderBy = c.req.query("orderBy") as
      | "created_at"
      | "updated_at"
      | "last_accessed_at"
      | undefined
    const orderDirection = c.req.query("orderDirection") as "asc" | "desc" | undefined

    const tags = tagsParam ? tagsParam.split(",") : undefined
    const pinned = pinnedParam !== undefined ? pinnedParam === "true" : undefined
    const archived = archivedParam !== undefined ? archivedParam === "true" : undefined
    const stale = staleParam === "true"

    const rows = await listMemories(db, {
      projectId: config.projectId,
      limit,
      offset,
      agent,
      engineer,
      repo,
      tags,
      pinned,
      archived,
      stale,
      orderBy,
      orderDirection,
    })

    return c.json({
      memories: rows.map(mapMemoryRow),
      total: rows.length,
    })
  })

  // -------------------------------------------------------------------------
  // GET /memories/export — export all memories (without embedding)
  // -------------------------------------------------------------------------
  app.get("/memories/export", async (c) => {
    const archivedParam = c.req.query("archived")

    let archived: boolean | undefined
    if (archivedParam === "true") {
      archived = true
    } else if (archivedParam === "false") {
      archived = false
    }
    // "all" or undefined means no filter — fetch both active and archived
    // We need two queries for "all" since listMemories defaults to active
    if (archivedParam === "all" || archivedParam === undefined) {
      const [activeRows, archivedRows] = await Promise.all([
        listMemories(db, {
          projectId: config.projectId,
          archived: false,
          limit: 10000,
        }),
        listMemories(db, {
          projectId: config.projectId,
          archived: true,
          limit: 10000,
        }),
      ])
      const allRows = [...activeRows, ...archivedRows]
      return c.json(allRows.map(mapMemoryRow))
    }

    const rows = await listMemories(db, {
      projectId: config.projectId,
      archived,
      limit: 10000,
    })
    return c.json(rows.map(mapMemoryRow))
  })

  // -------------------------------------------------------------------------
  // GET /memories/resolve/:prefix — resolve a UUID prefix
  // -------------------------------------------------------------------------
  app.get("/memories/resolve/:prefix", async (c) => {
    const prefix = c.req.param("prefix")
    const rows = await findMemoryByIdPrefix(db, config.projectId, prefix)
    return c.json({ memories: rows.map(mapMemoryRow) })
  })

  // -------------------------------------------------------------------------
  // POST /memories/touch — bump access timestamps
  // -------------------------------------------------------------------------
  app.post("/memories/touch", async (c) => {
    const body = await c.req.json()
    const parsed = TouchRequestSchema.safeParse(body)

    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues.map((i) => i.message).join(", "),
          },
        },
        400,
      )
    }

    await callTouchMemories(db, parsed.data.ids)
    return c.json({ touched: parsed.data.ids.length })
  })

  // -------------------------------------------------------------------------
  // POST /memories/import — bulk import
  // -------------------------------------------------------------------------
  app.post("/memories/import", createAgentIdMiddleware(), async (c) => {
    const body = await c.req.json()
    const parsed = ImportRequestSchema.safeParse(body)

    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues.map((i) => i.message).join(", "),
          },
        },
        400,
      )
    }

    // biome-ignore lint/suspicious/noExplicitAny: Hono context variable typing
    const identity = (c as any).get("agentIdentity") as AgentIdentity
    const result = await handleImport({ config, db, identity }, { memories: parsed.data.memories })

    return c.json(result, 201)
  })

  // -------------------------------------------------------------------------
  // GET /memories/:id — get a single memory
  // -------------------------------------------------------------------------
  app.get("/memories/:id", async (c) => {
    const id = c.req.param("id")
    const row = await getMemoryById(db, id)

    if (!row) {
      return c.json(
        { error: { code: "MEMORY_NOT_FOUND", message: `Memory with ID ${id} not found` } },
        404,
      )
    }

    return c.json({ memory: mapMemoryRow(row) })
  })

  // -------------------------------------------------------------------------
  // DELETE /memories/:id — delete a memory
  // -------------------------------------------------------------------------
  app.delete("/memories/:id", async (c) => {
    const id = c.req.param("id")
    const deleted = await deleteMemory(db, id)

    if (!deleted) {
      return c.json(
        { error: { code: "MEMORY_NOT_FOUND", message: `Memory with ID ${id} not found` } },
        404,
      )
    }

    return c.body(null, 204)
  })

  // -------------------------------------------------------------------------
  // POST /memories/:id/correct — correct a memory
  // -------------------------------------------------------------------------
  app.post("/memories/:id/correct", createAgentIdMiddleware(), async (c) => {
    const id = c.req.param("id")
    const body = await c.req.json()
    const parsed = CorrectRequestSchema.safeParse(body)

    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues.map((i) => i.message).join(", "),
          },
        },
        400,
      )
    }

    const result = await handleCorrect(
      { config, db },
      { memoryId: id, newContent: parsed.data.newContent },
    )

    return c.json(result)
  })

  // -------------------------------------------------------------------------
  // POST /memories/:id/pin — pin a memory
  // -------------------------------------------------------------------------
  app.post("/memories/:id/pin", async (c) => {
    const id = c.req.param("id")
    const existing = await getMemoryById(db, id)

    if (!existing) {
      return c.json(
        { error: { code: "MEMORY_NOT_FOUND", message: `Memory with ID ${id} not found` } },
        404,
      )
    }

    const updated = await updateMemory(db, id, { pinned: true })
    return c.json({ memory: mapMemoryRow(updated) })
  })

  // -------------------------------------------------------------------------
  // POST /memories/:id/unpin — unpin a memory
  // -------------------------------------------------------------------------
  app.post("/memories/:id/unpin", async (c) => {
    const id = c.req.param("id")
    const existing = await getMemoryById(db, id)

    if (!existing) {
      return c.json(
        { error: { code: "MEMORY_NOT_FOUND", message: `Memory with ID ${id} not found` } },
        404,
      )
    }

    const updated = await updateMemory(db, id, { pinned: false })
    return c.json({ memory: mapMemoryRow(updated) })
  })

  // -------------------------------------------------------------------------
  // POST /memories/:id/archive — archive a memory
  // -------------------------------------------------------------------------
  app.post("/memories/:id/archive", async (c) => {
    const id = c.req.param("id")
    const existing = await getMemoryById(db, id)

    if (!existing) {
      return c.json(
        { error: { code: "MEMORY_NOT_FOUND", message: `Memory with ID ${id} not found` } },
        404,
      )
    }

    const updated = await updateMemory(db, id, { archived: true })
    return c.json({ memory: mapMemoryRow(updated) })
  })

  // -------------------------------------------------------------------------
  // POST /memories/:id/restore — restore an archived memory
  // -------------------------------------------------------------------------
  app.post("/memories/:id/restore", async (c) => {
    const id = c.req.param("id")
    const existing = await getMemoryById(db, id)

    if (!existing) {
      return c.json(
        { error: { code: "MEMORY_NOT_FOUND", message: `Memory with ID ${id} not found` } },
        404,
      )
    }

    const updated = await updateMemory(db, id, { archived: false })
    return c.json({ memory: mapMemoryRow(updated) })
  })

  return app
}
