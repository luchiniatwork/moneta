import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import type { Memory, MonetaClient, RecallResult } from "@moneta/api-client"
import type { Config } from "@moneta/shared"
import type { CliContext } from "../context.ts"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
const FAKE_UUID_2 = "b2c3d4e5-f6a7-8901-bcde-f12345678901"

function fakeConfig(overrides?: Partial<Config>): Config {
  return {
    projectId: "test-project",
    databaseUrl: "",
    openaiApiKey: "",
    embeddingModel: "text-embedding-3-small",
    archiveAfterDays: 30,
    dedupThreshold: 0.95,
    searchThreshold: 0.3,
    searchLimit: 10,
    maxContentLength: 2000,
    apiUrl: "http://localhost:3000/api/v1",
    ...overrides,
  }
}

function fakeMemory(overrides?: Partial<Memory>): Memory {
  return {
    id: FAKE_UUID,
    projectId: "test-project",
    content: "Auth service uses JWT with RS256",
    createdBy: "alice/code-reviewer",
    engineer: "alice",
    agentType: "code-reviewer",
    repo: null,
    tags: [],
    importance: "normal",
    pinned: false,
    archived: false,
    createdAt: "2026-04-08T14:30:00.000Z",
    updatedAt: "2026-04-08T14:30:00.000Z",
    lastAccessedAt: "2026-04-08T14:30:00.000Z",
    accessCount: 0,
    ...overrides,
  }
}

function fakeRecallResult(overrides?: Partial<RecallResult>): RecallResult {
  return {
    id: FAKE_UUID,
    content: "Auth service uses JWT with RS256",
    similarity: 0.87,
    createdBy: "alice/code-reviewer",
    engineer: "alice",
    repo: null,
    tags: [],
    importance: "normal",
    pinned: false,
    archived: false,
    accessCount: 3,
    createdAt: "2026-04-08T14:30:00.000Z",
    lastAccessedAt: "2026-04-10T09:15:00.000Z",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock client factory
// ---------------------------------------------------------------------------

function createMockClient(overrides?: Partial<MonetaClient>): MonetaClient {
  return {
    remember: mock(() => Promise.resolve({ id: FAKE_UUID, content: "", deduplicated: false })),
    recall: mock(() => Promise.resolve([] as RecallResult[])),
    correct: mock(() => Promise.resolve({ id: FAKE_UUID, oldContent: "old", newContent: "new" })),
    getMemory: mock(() => Promise.resolve(fakeMemory())),
    listMemories: mock(() => Promise.resolve({ memories: [], total: 0 })),
    deleteMemory: mock(() => Promise.resolve(true)),
    pin: mock(() => Promise.resolve(fakeMemory({ pinned: true }))),
    unpin: mock(() => Promise.resolve(fakeMemory({ pinned: false }))),
    archive: mock(() => Promise.resolve(fakeMemory({ archived: true }))),
    restore: mock(() => Promise.resolve(fakeMemory({ archived: false }))),
    importMemories: mock(() => Promise.resolve({ imported: 0, skipped: 0 })),
    exportMemories: mock(() => Promise.resolve([])),
    getStats: mock(() =>
      Promise.resolve({
        total: 0,
        active: 0,
        archived: 0,
        pinned: 0,
        byEngineer: [],
        byRepo: [],
        topTags: [],
        approachingStale: 0,
        archivedLast7Days: 0,
        createdToday: 0,
        mostAccessed: [],
      }),
    ),
    getCounts: mock(() => Promise.resolve({ active: 0, archived: 0, pinned: 0 })),
    resolvePrefix: mock(() => Promise.resolve([] as Memory[])),
    touchMemories: mock(() => Promise.resolve(0)),
    archiveStale: mock(() => Promise.resolve(0)),
    health: mock(() => Promise.resolve({ status: "ok" as const, project: "", version: "" })),
    ...overrides,
  }
}

function _fakeContext(overrides?: Partial<Config>): CliContext {
  return {
    config: fakeConfig(overrides),
    client: createMockClient(),
  }
}

// ---------------------------------------------------------------------------
// Import handlers (no mocking needed — we inject the client directly)
// ---------------------------------------------------------------------------

const { handleRecall } = await import("../commands/recall.ts")
const { handleShow } = await import("../commands/show.ts")

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let logOutput: string[]
const originalLog = console.log

beforeEach(() => {
  logOutput = []
  console.log = (...args: unknown[]) => {
    logOutput.push(args.map(String).join(" "))
  }
})

afterEach(() => {
  console.log = originalLog
})

// ---------------------------------------------------------------------------
// recall
// ---------------------------------------------------------------------------

describe("handleRecall", () => {
  it("calls client.recall with the question", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig(), client }
    await handleRecall("How does auth work?", {}, ctx)

    expect(client.recall).toHaveBeenCalledTimes(1)
    const args = (client.recall as ReturnType<typeof mock>).mock.calls[0] as unknown[]
    const params = args[0] as Record<string, unknown>
    expect(params.question).toBe("How does auth work?")
  })

  it("passes CLI flag values to client.recall", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig(), client }
    await handleRecall(
      "auth?",
      {
        limit: "5",
        threshold: "0.2",
        agent: "alice/code-reviewer",
        engineer: "alice",
        repo: "auth-service",
        tags: "security,jwt",
        archived: true,
      },
      ctx,
    )

    const args = (client.recall as ReturnType<typeof mock>).mock.calls[0] as unknown[]
    const params = args[0] as Record<string, unknown>
    expect(params.limit).toBe(5)
    expect(params.threshold).toBe(0.2)
    expect(params.includeArchived).toBe(true)
    const scope = params.scope as Record<string, unknown>
    expect(scope.agent).toBe("alice/code-reviewer")
    expect(scope.engineer).toBe("alice")
    expect(scope.repo).toBe("auth-service")
    expect(scope.tags).toEqual(["security", "jwt"])
  })

  it("outputs JSON when --json flag is set", async () => {
    const results = [fakeRecallResult()]
    const client = createMockClient({
      recall: mock(() => Promise.resolve(results)),
    })
    const ctx: CliContext = { config: fakeConfig(), client }
    await handleRecall("auth?", { json: true }, ctx)

    expect(logOutput).toHaveLength(1)
    const parsed = JSON.parse(logOutput[0] as string)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe(FAKE_UUID)
  })
})

// ---------------------------------------------------------------------------
// show
// ---------------------------------------------------------------------------

describe("handleShow", () => {
  it("resolves a full UUID via exact match", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig(), client }
    await handleShow(FAKE_UUID, {}, ctx)

    expect(client.getMemory).toHaveBeenCalledTimes(1)
    expect(client.getMemory).toHaveBeenCalledWith(FAKE_UUID)
    expect(client.resolvePrefix).not.toHaveBeenCalled()
  })

  it("falls back to prefix match when exact match fails", async () => {
    const client = createMockClient({
      getMemory: mock(() => Promise.resolve(null)),
      resolvePrefix: mock(() => Promise.resolve([fakeMemory()])),
    })
    const ctx: CliContext = { config: fakeConfig(), client }
    await handleShow("a1b2c3", {}, ctx)

    expect(client.getMemory).toHaveBeenCalledWith("a1b2c3")
    expect(client.resolvePrefix).toHaveBeenCalledWith("a1b2c3")
  })

  it("throws when no memory is found by exact or prefix match", async () => {
    const client = createMockClient({
      getMemory: mock(() => Promise.resolve(null)),
      resolvePrefix: mock(() => Promise.resolve([])),
    })
    const ctx: CliContext = { config: fakeConfig(), client }
    await expect(handleShow("nonexistent", {}, ctx)).rejects.toThrow(
      "Memory not found: nonexistent",
    )
  })

  it("throws on ambiguous prefix match", async () => {
    const client = createMockClient({
      getMemory: mock(() => Promise.resolve(null)),
      resolvePrefix: mock(() =>
        Promise.resolve([fakeMemory({ id: FAKE_UUID }), fakeMemory({ id: FAKE_UUID_2 })]),
      ),
    })
    const ctx: CliContext = { config: fakeConfig(), client }
    await expect(handleShow("a1b2c3", {}, ctx)).rejects.toThrow("Ambiguous ID prefix")
  })

  it("outputs JSON when --json flag is set", async () => {
    const memory = fakeMemory({ content: "test memory" })
    const client = createMockClient({
      getMemory: mock(() => Promise.resolve(memory)),
    })
    const ctx: CliContext = { config: fakeConfig(), client }
    await handleShow(FAKE_UUID, { json: true }, ctx)

    expect(logOutput).toHaveLength(1)
    const parsed = JSON.parse(logOutput[0] as string)
    expect(parsed.id).toBe(FAKE_UUID)
    expect(parsed.content).toBe("test memory")
  })

  it("displays detail view for a found memory", async () => {
    const memory = fakeMemory({
      content: "Auth service uses JWT",
      createdBy: "alice/code-reviewer",
      importance: "high",
      pinned: true,
      tags: ["security", "jwt"],
    })
    const client = createMockClient({
      getMemory: mock(() => Promise.resolve(memory)),
    })
    const ctx: CliContext = { config: fakeConfig(), client }
    await handleShow(FAKE_UUID, {}, ctx)

    // Verify output has multiple lines (detail view)
    expect(logOutput.length).toBeGreaterThan(3)

    // Check that key content appears in the output
    const allOutput = logOutput.join("\n")
    expect(allOutput).toContain(FAKE_UUID)
    expect(allOutput).toContain("Auth service uses JWT")
    expect(allOutput).toContain("alice/code-reviewer")
    expect(allOutput).toContain("security, jwt")
  })
})
