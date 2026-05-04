import { describe, expect, it, mock } from "bun:test"
import type { Config, MonetaDb } from "@moneta/shared"

// ---------------------------------------------------------------------------
// Mock @moneta/shared — prevents real DB / OpenAI calls
// ---------------------------------------------------------------------------

mock.module("@moneta/shared", () => ({
  embed: mock(() => Promise.resolve(new Array(1536).fill(0.1) as number[])),
  embedBatch: mock(() => Promise.resolve([])),
  callDedupCheck: mock(() => Promise.resolve([])),
  callArchiveStale: mock(() => Promise.resolve(0)),
  callRecall: mock(() => Promise.resolve([])),
  callTouchMemories: mock(() => Promise.resolve()),
  insertMemory: mock(() => Promise.resolve({})),
  updateMemory: mock(() => Promise.resolve({})),
  getMemoryById: mock(() => Promise.resolve(null)),
  deleteMemory: mock(() => Promise.resolve(false)),
  listMemories: mock(() => Promise.resolve([])),
  findMemoryByIdPrefix: mock(() => Promise.resolve([])),
  getStats: mock(() => Promise.resolve({ total: 0, active: 0, archived: 0, pinned: 0 })),
  getCounts: mock(() => Promise.resolve({ active: 0, archived: 0, pinned: 0 })),
  createDb: mock(() => ({})),
  loadConfig: mock(() => ({})),
  validateConfig: mock(() => []),
  resetClient: mock(() => {}),
  parseDotEnv: mock(() => ({})),
  parseAgentId: (id: string) => {
    const parts = id.split("/")
    return {
      createdBy: id,
      engineer: parts[0] === "auto" ? null : (parts[0] ?? null),
      agentType: parts[1] ?? "",
    }
  },
}))

// Import AFTER mocking
const { createApp } = await import("../app.ts")

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_CONFIG: Config = {
  projectId: "test-project",
  databaseUrl: "postgres://localhost:5432/test",
  openaiApiKey: "test-key",
  embeddingModel: "text-embedding-3-small",
  archiveAfterDays: 30,
  dedupThreshold: 0.95,
  searchThreshold: 0.3,
  searchLimit: 10,
  maxContentLength: 2000,
}

const TEST_DB = {} as MonetaDb
const API_KEY = "super-secret-key"

// ---------------------------------------------------------------------------
// Health endpoint auth bypass
// ---------------------------------------------------------------------------

describe("health endpoint auth", () => {
  it("returns 200 without Authorization header when apiKey is configured", async () => {
    const app = createApp({ config: TEST_CONFIG, db: TEST_DB, apiKey: API_KEY })

    const res = await app.request("/api/v1/health")

    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe("ok")
  })

  it("returns 200 without any headers at all", async () => {
    const app = createApp({ config: TEST_CONFIG, db: TEST_DB, apiKey: API_KEY })

    const res = await app.request("/api/v1/health", { method: "GET" })

    expect(res.status).toBe(200)
  })

  it("returns 200 when apiKey is not configured", async () => {
    const app = createApp({ config: TEST_CONFIG, db: TEST_DB })

    const res = await app.request("/api/v1/health")

    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Protected routes still require auth
// ---------------------------------------------------------------------------

describe("protected routes require auth", () => {
  it("returns 401 on /stats without Authorization when apiKey is configured", async () => {
    const app = createApp({ config: TEST_CONFIG, db: TEST_DB, apiKey: API_KEY })

    const res = await app.request("/api/v1/stats", {
      headers: { "X-Project-Id": "test-project" },
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("UNAUTHORIZED")
  })

  it("returns 401 with invalid Bearer token", async () => {
    const app = createApp({ config: TEST_CONFIG, db: TEST_DB, apiKey: API_KEY })

    const res = await app.request("/api/v1/stats", {
      headers: {
        "X-Project-Id": "test-project",
        Authorization: "Bearer wrong-key",
      },
    })

    expect(res.status).toBe(401)
  })

  it("proceeds to X-Project-Id validation after valid auth", async () => {
    const app = createApp({ config: TEST_CONFIG, db: TEST_DB, apiKey: API_KEY })

    // Valid auth but missing X-Project-Id → should get 400, not 401
    const res = await app.request("/api/v1/stats", {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("PROJECT_ID_REQUIRED")
  })
})
