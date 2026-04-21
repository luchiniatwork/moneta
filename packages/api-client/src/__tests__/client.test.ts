import { beforeEach, describe, expect, it, mock } from "bun:test"
import { createClient } from "../client.ts"
import { ApiError } from "../errors.ts"
import type { MonetaClient } from "../types.ts"

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: mock fetch for testing
const mockFetch = mock<(...args: any[]) => Promise<Response>>(() => Promise.resolve(new Response()))

beforeEach(() => {
  mockFetch.mockClear()
  globalThis.fetch = mockFetch as unknown as typeof fetch
})

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function emptyResponse(status: number): Response {
  return new Response(null, { status })
}

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

const BASE_URL = "http://localhost:3000/api/v1"
let client: MonetaClient

beforeEach(() => {
  client = createClient({
    baseUrl: BASE_URL,
    projectId: "test-project",
    apiKey: "test-key",
    agentId: "alice/reviewer",
  })
})

// ---------------------------------------------------------------------------
// remember
// ---------------------------------------------------------------------------

describe("remember", () => {
  it("sends POST with correct body and agent header", async () => {
    const result = { id: "uuid-1", content: "Test fact", deduplicated: false }
    mockFetch.mockImplementation(() => Promise.resolve(jsonResponse(result)))

    const res = await client.remember({ content: "Test fact", tags: ["arch"] })

    expect(res).toEqual(result)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/memories/remember`)
    expect(opts.method).toBe("POST")
    expect(opts.headers).toHaveProperty("X-Project-Id", "test-project")
    expect(opts.headers).toHaveProperty("X-Agent-Id", "alice/reviewer")
    expect(opts.headers).toHaveProperty("Authorization", "Bearer test-key")
    expect(JSON.parse(opts.body as string)).toEqual({ content: "Test fact", tags: ["arch"] })
  })
})

// ---------------------------------------------------------------------------
// recall
// ---------------------------------------------------------------------------

describe("recall", () => {
  it("sends POST and unwraps memories array", async () => {
    const memories = [
      {
        id: "uuid-1",
        content: "Test",
        similarity: 0.87,
        createdBy: "alice/reviewer",
        engineer: "alice",
        repo: null,
        tags: [],
        importance: "normal" as const,
        pinned: false,
        archived: false,
        accessCount: 3,
        createdAt: "2026-04-08T14:30:00Z",
        lastAccessedAt: "2026-04-10T09:15:00Z",
      },
    ]
    mockFetch.mockImplementation(() => Promise.resolve(jsonResponse({ memories })))

    const res = await client.recall({ question: "How does auth work?" })

    expect(res).toEqual(memories)
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/memories/recall`)
    expect(opts.method).toBe("POST")
  })
})

// ---------------------------------------------------------------------------
// getMemory
// ---------------------------------------------------------------------------

describe("getMemory", () => {
  it("returns null on 404", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(errorResponse(404, "MEMORY_NOT_FOUND", "Not found")),
    )

    const res = await client.getMemory("nonexistent")
    expect(res).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// deleteMemory
// ---------------------------------------------------------------------------

describe("deleteMemory", () => {
  it("returns true on 204", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(emptyResponse(204)))

    const res = await client.deleteMemory("uuid-1")

    expect(res).toBe(true)
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/memories/uuid-1`)
    expect(opts.method).toBe("DELETE")
  })
})

// ---------------------------------------------------------------------------
// listMemories
// ---------------------------------------------------------------------------

describe("listMemories", () => {
  it("builds query string from params", async () => {
    const data = { memories: [], total: 0 }
    mockFetch.mockImplementation(() => Promise.resolve(jsonResponse(data)))

    await client.listMemories({ limit: 10, tags: ["arch", "db"], pinned: true })

    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toContain("limit=10")
    expect(url).toContain("tags=arch%2Cdb")
    expect(url).toContain("pinned=true")
  })
})

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

describe("pin", () => {
  it("sends POST to pin endpoint", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(jsonResponse({ memory: { id: "uuid-1", pinned: true, content: "test" } })),
    )

    await client.pin("uuid-1")

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/memories/uuid-1/pin`)
    expect(opts.method).toBe("POST")
  })
})

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------

describe("getStats", () => {
  it("fetches stats from /stats", async () => {
    const stats = {
      total: 100,
      active: 80,
      archived: 15,
      pinned: 5,
      byEngineer: [],
      byRepo: [],
      topTags: [],
      approachingStale: 0,
      archivedLast7Days: 0,
      createdToday: 0,
      mostAccessed: [],
    }
    mockFetch.mockImplementation(() => Promise.resolve(jsonResponse(stats)))

    const res = await client.getStats()

    expect(res).toEqual(stats)
    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toBe(`${BASE_URL}/stats`)
  })
})

// ---------------------------------------------------------------------------
// error handling
// ---------------------------------------------------------------------------

describe("error handling", () => {
  it("throws ApiError on non-2xx response", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(errorResponse(400, "VALIDATION_ERROR", "Content empty")),
    )

    try {
      await client.remember({ content: "" })
      expect(true).toBe(false) // Should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      const err = e as ApiError
      expect(err.status).toBe(400)
      expect(err.code).toBe("VALIDATION_ERROR")
      expect(err.message).toBe("Content empty")
    }
  })
})

// ---------------------------------------------------------------------------
// auth header
// ---------------------------------------------------------------------------

describe("auth", () => {
  it("omits Authorization header when no apiKey", async () => {
    const noAuthClient = createClient({ baseUrl: BASE_URL, projectId: "test-project" })
    mockFetch.mockImplementation(() => Promise.resolve(jsonResponse({ status: "ok" })))

    await noAuthClient.health()

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    const h = opts.headers as Record<string, string>
    expect(h["X-Project-Id"]).toBe("test-project")
    expect(h.Authorization).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// import with agent header
// ---------------------------------------------------------------------------

describe("importMemories", () => {
  it("sends X-Agent-Id header", async () => {
    const result = { imported: 5, skipped: 0 }
    mockFetch.mockImplementation(() => Promise.resolve(jsonResponse(result)))

    await client.importMemories([{ content: "Test" }])

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/memories/import`)
    const h = opts.headers as Record<string, string>
    expect(h["X-Project-Id"]).toBe("test-project")
    expect(h["X-Agent-Id"]).toBe("alice/reviewer")
  })
})
