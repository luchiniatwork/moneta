import { beforeEach, describe, expect, it, mock } from "bun:test"
import type { CorrectResult, MonetaClient, RecallResult, RememberResult } from "@moneta/api-client"
import type { Config } from "@moneta/shared"
import { handleCorrect } from "../tools/correct.ts"
import { handleForget } from "../tools/forget.ts"
import { handlePin } from "../tools/pin.ts"
import { handleRecall } from "../tools/recall.ts"
import { handleRemember } from "../tools/remember.ts"
import { handleUnpin } from "../tools/unpin.ts"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

function fakeConfig(overrides?: Partial<Config>): Config {
  return {
    projectId: "test-project",
    databaseUrl: "postgresql://localhost:5432/test",
    openaiApiKey: "sk-test",
    embeddingModel: "text-embedding-3-small",
    archiveAfterDays: 30,
    dedupThreshold: 0.95,
    searchThreshold: 0.3,
    searchLimit: 10,
    maxContentLength: 2000,
    ...overrides,
  }
}

function fakeMemory(): {
  id: string
  projectId: string
  content: string
  createdBy: string
  engineer: string | null
  agentType: string | null
  repo: string | null
  tags: string[]
  importance: "normal"
  pinned: boolean
  archived: boolean
  createdAt: string
  updatedAt: string
  lastAccessedAt: string
  accessCount: number
} {
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
    createdAt: "2026-04-08T14:30:00Z",
    updatedAt: "2026-04-08T14:30:00Z",
    lastAccessedAt: "2026-04-08T14:30:00Z",
    accessCount: 0,
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
    createdAt: "2026-04-08T14:30:00Z",
    lastAccessedAt: "2026-04-10T09:15:00Z",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock client factory
// ---------------------------------------------------------------------------

function createMockClient(): {
  client: MonetaClient
  mocks: {
    remember: ReturnType<typeof mock>
    recall: ReturnType<typeof mock>
    correct: ReturnType<typeof mock>
    getMemory: ReturnType<typeof mock>
    listMemories: ReturnType<typeof mock>
    deleteMemory: ReturnType<typeof mock>
    pin: ReturnType<typeof mock>
    unpin: ReturnType<typeof mock>
    archive: ReturnType<typeof mock>
    restore: ReturnType<typeof mock>
    importMemories: ReturnType<typeof mock>
    exportMemories: ReturnType<typeof mock>
    getStats: ReturnType<typeof mock>
    getCounts: ReturnType<typeof mock>
    resolvePrefix: ReturnType<typeof mock>
    touchMemories: ReturnType<typeof mock>
    archiveStale: ReturnType<typeof mock>
    health: ReturnType<typeof mock>
  }
} {
  const mocks = {
    remember: mock(
      (): Promise<RememberResult> =>
        Promise.resolve({ id: FAKE_UUID, content: "Test fact", deduplicated: false }),
    ),
    recall: mock((): Promise<RecallResult[]> => Promise.resolve([])),
    correct: mock(
      (): Promise<CorrectResult> =>
        Promise.resolve({
          id: FAKE_UUID,
          oldContent: "Auth service uses JWT with RS256",
          newContent: "Updated fact",
        }),
    ),
    getMemory: mock(() => Promise.resolve(fakeMemory())),
    listMemories: mock(() => Promise.resolve({ memories: [], total: 0 })),
    deleteMemory: mock(() => Promise.resolve(true)),
    pin: mock(() => Promise.resolve({ ...fakeMemory(), pinned: true })),
    unpin: mock(() => Promise.resolve({ ...fakeMemory(), pinned: false })),
    archive: mock(() => Promise.resolve({ ...fakeMemory(), archived: true })),
    restore: mock(() => Promise.resolve({ ...fakeMemory(), archived: false })),
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
    resolvePrefix: mock(() => Promise.resolve([])),
    touchMemories: mock(() => Promise.resolve(0)),
    archiveStale: mock(() => Promise.resolve(0)),
    health: mock(() => Promise.resolve({ status: "ok" as const, project: "test", version: "1" })),
  }

  const client: MonetaClient = {
    remember: mocks.remember as MonetaClient["remember"],
    recall: mocks.recall as MonetaClient["recall"],
    correct: mocks.correct as MonetaClient["correct"],
    getMemory: mocks.getMemory as MonetaClient["getMemory"],
    listMemories: mocks.listMemories as MonetaClient["listMemories"],
    deleteMemory: mocks.deleteMemory as MonetaClient["deleteMemory"],
    pin: mocks.pin as MonetaClient["pin"],
    unpin: mocks.unpin as MonetaClient["unpin"],
    archive: mocks.archive as MonetaClient["archive"],
    restore: mocks.restore as MonetaClient["restore"],
    importMemories: mocks.importMemories as MonetaClient["importMemories"],
    exportMemories: mocks.exportMemories as MonetaClient["exportMemories"],
    getStats: mocks.getStats as MonetaClient["getStats"],
    getCounts: mocks.getCounts as MonetaClient["getCounts"],
    resolvePrefix: mocks.resolvePrefix as MonetaClient["resolvePrefix"],
    touchMemories: mocks.touchMemories as MonetaClient["touchMemories"],
    archiveStale: mocks.archiveStale as MonetaClient["archiveStale"],
    health: mocks.health as MonetaClient["health"],
  }

  return { client, mocks }
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let client: MonetaClient
let mocks: ReturnType<typeof createMockClient>["mocks"]

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  const mockClient = createMockClient()
  client = mockClient.client
  mocks = mockClient.mocks
})

// ---------------------------------------------------------------------------
// remember
// ---------------------------------------------------------------------------

describe("handleRemember", () => {
  it("calls client.remember and returns the result", async () => {
    const result = await handleRemember({ client }, { content: "Test fact" })

    expect(result.deduplicated).toBe(false)
    expect(result.content).toBe("Test fact")
    expect(result.id).toBe(FAKE_UUID)
    expect(mocks.remember).toHaveBeenCalledTimes(1)
    expect(mocks.remember).toHaveBeenCalledWith({
      content: "Test fact",
      tags: undefined,
      repo: undefined,
      importance: undefined,
    })
  })

  it("passes tags, repo, and importance to the client", async () => {
    await handleRemember(
      { client },
      {
        content: "Critical fact",
        tags: ["security"],
        repo: "auth-service",
        importance: "critical",
      },
    )

    expect(mocks.remember).toHaveBeenCalledWith({
      content: "Critical fact",
      tags: ["security"],
      repo: "auth-service",
      importance: "critical",
    })
  })

  it("returns deduplicated result when client reports dedup", async () => {
    mocks.remember.mockImplementation(() =>
      Promise.resolve({ id: FAKE_UUID, content: "Updated fact", deduplicated: true }),
    )

    const result = await handleRemember({ client }, { content: "Updated fact" })

    expect(result.deduplicated).toBe(true)
    expect(result.id).toBe(FAKE_UUID)
  })

  it("propagates client errors", async () => {
    mocks.remember.mockImplementation(() => Promise.reject(new Error("API error")))

    expect(handleRemember({ client }, { content: "Test" })).rejects.toThrow("API error")
  })
})

// ---------------------------------------------------------------------------
// recall
// ---------------------------------------------------------------------------

describe("handleRecall", () => {
  it("returns empty array when no results found", async () => {
    const config = fakeConfig()
    const results = await handleRecall({ client, config }, { question: "How does auth work?" })

    expect(results).toHaveLength(0)
    expect(mocks.recall).toHaveBeenCalledTimes(1)
  })

  it("returns results from client", async () => {
    const recallResult = fakeRecallResult()
    mocks.recall.mockImplementation(() => Promise.resolve([recallResult]))

    const config = fakeConfig()
    const results = await handleRecall({ client, config }, { question: "How does auth work?" })

    expect(results).toHaveLength(1)
    expect(results[0]?.content).toBe("Auth service uses JWT with RS256")
  })

  it("uses config.searchLimit as default limit", async () => {
    const config = fakeConfig({ searchLimit: 25 })
    await handleRecall({ client, config }, { question: "Test" })

    expect(mocks.recall).toHaveBeenCalledWith({
      question: "Test",
      scope: undefined,
      limit: 25,
      includeArchived: undefined,
    })
  })

  it("passes explicit limit over config default", async () => {
    const config = fakeConfig({ searchLimit: 25 })
    await handleRecall({ client, config }, { question: "Test", limit: 5 })

    expect(mocks.recall).toHaveBeenCalledWith({
      question: "Test",
      scope: undefined,
      limit: 5,
      includeArchived: undefined,
    })
  })

  it("passes scope filters to client.recall", async () => {
    const config = fakeConfig()
    await handleRecall(
      { client, config },
      {
        question: "Test",
        scope: { agent: "bob/architect", repo: "auth-service", tags: ["security"] },
        limit: 5,
      },
    )

    expect(mocks.recall).toHaveBeenCalledWith({
      question: "Test",
      scope: { agent: "bob/architect", repo: "auth-service", tags: ["security"] },
      limit: 5,
      includeArchived: undefined,
    })
  })

  it("passes include_archived as includeArchived to client", async () => {
    const config = fakeConfig()
    await handleRecall({ client, config }, { question: "Old question", include_archived: true })

    expect(mocks.recall).toHaveBeenCalledWith({
      question: "Old question",
      scope: undefined,
      limit: 10,
      includeArchived: true,
    })
  })

  it("propagates client errors", async () => {
    mocks.recall.mockImplementation(() => Promise.reject(new Error("network error")))

    const config = fakeConfig()
    expect(handleRecall({ client, config }, { question: "Test" })).rejects.toThrow("network error")
  })
})

// ---------------------------------------------------------------------------
// pin
// ---------------------------------------------------------------------------

describe("handlePin", () => {
  it("calls client.pin and returns result", async () => {
    const result = await handlePin({ client }, { memory_id: FAKE_UUID })

    expect(result.id).toBe(FAKE_UUID)
    expect(result.pinned).toBe(true)
    expect(mocks.pin).toHaveBeenCalledWith(FAKE_UUID)
  })

  it("propagates client errors for not found", async () => {
    mocks.pin.mockImplementation(() => Promise.reject(new Error(`Memory not found: ${FAKE_UUID}`)))

    expect(handlePin({ client }, { memory_id: FAKE_UUID })).rejects.toThrow(
      `Memory not found: ${FAKE_UUID}`,
    )
  })
})

// ---------------------------------------------------------------------------
// unpin
// ---------------------------------------------------------------------------

describe("handleUnpin", () => {
  it("calls client.unpin and returns result", async () => {
    const result = await handleUnpin({ client }, { memory_id: FAKE_UUID })

    expect(result.id).toBe(FAKE_UUID)
    expect(result.pinned).toBe(false)
    expect(mocks.unpin).toHaveBeenCalledWith(FAKE_UUID)
  })

  it("propagates client errors for not found", async () => {
    mocks.unpin.mockImplementation(() =>
      Promise.reject(new Error(`Memory not found: ${FAKE_UUID}`)),
    )

    expect(handleUnpin({ client }, { memory_id: FAKE_UUID })).rejects.toThrow(
      `Memory not found: ${FAKE_UUID}`,
    )
  })
})

// ---------------------------------------------------------------------------
// forget
// ---------------------------------------------------------------------------

describe("handleForget", () => {
  it("calls client.deleteMemory and returns result", async () => {
    const result = await handleForget({ client }, { memory_id: FAKE_UUID })

    expect(result.id).toBe(FAKE_UUID)
    expect(result.deleted).toBe(true)
    expect(mocks.deleteMemory).toHaveBeenCalledWith(FAKE_UUID)
  })

  it("propagates client errors for not found", async () => {
    mocks.deleteMemory.mockImplementation(() =>
      Promise.reject(new Error(`Memory not found: ${FAKE_UUID}`)),
    )

    expect(handleForget({ client }, { memory_id: FAKE_UUID })).rejects.toThrow(
      `Memory not found: ${FAKE_UUID}`,
    )
  })
})

// ---------------------------------------------------------------------------
// correct
// ---------------------------------------------------------------------------

describe("handleCorrect", () => {
  it("calls client.correct and returns result", async () => {
    mocks.correct.mockImplementation(() =>
      Promise.resolve({
        id: FAKE_UUID,
        oldContent: "Auth service uses JWT with RS256",
        newContent: "Updated fact about auth",
      }),
    )

    const result = await handleCorrect(
      { client },
      { memory_id: FAKE_UUID, new_content: "Updated fact about auth" },
    )

    expect(result.id).toBe(FAKE_UUID)
    expect(result.oldContent).toBe("Auth service uses JWT with RS256")
    expect(result.newContent).toBe("Updated fact about auth")
    expect(mocks.correct).toHaveBeenCalledWith(FAKE_UUID, "Updated fact about auth")
  })

  it("propagates client errors for not found", async () => {
    mocks.correct.mockImplementation(() =>
      Promise.reject(new Error(`Memory not found: ${FAKE_UUID}`)),
    )

    expect(
      handleCorrect({ client }, { memory_id: FAKE_UUID, new_content: "New fact" }),
    ).rejects.toThrow(`Memory not found: ${FAKE_UUID}`)
  })

  it("propagates client errors for empty content", async () => {
    mocks.correct.mockImplementation(() => Promise.reject(new Error("Content must not be empty")))

    expect(handleCorrect({ client }, { memory_id: FAKE_UUID, new_content: "" })).rejects.toThrow(
      "Content must not be empty",
    )
  })

  it("propagates client errors for embedding failures", async () => {
    mocks.correct.mockImplementation(() =>
      Promise.reject(new Error("Failed to generate embedding: rate limited")),
    )

    expect(
      handleCorrect({ client }, { memory_id: FAKE_UUID, new_content: "New fact" }),
    ).rejects.toThrow("Failed to generate embedding")
  })
})

// ---------------------------------------------------------------------------
// Full lifecycle: create → search → pin → correct → unpin → forget
// ---------------------------------------------------------------------------

describe("full lifecycle", () => {
  it("completes the entire memory lifecycle", async () => {
    const config = fakeConfig()

    // 1. Remember a fact
    mocks.remember.mockImplementation(() =>
      Promise.resolve({
        id: FAKE_UUID,
        content: "API uses REST with JSON",
        deduplicated: false,
      }),
    )
    const rememberResult = await handleRemember(
      { client },
      { content: "API uses REST with JSON", tags: ["architecture"] },
    )
    expect(rememberResult.id).toBe(FAKE_UUID)
    expect(rememberResult.deduplicated).toBe(false)

    // 2. Recall it
    const recallResults = [fakeRecallResult({ content: "API uses REST with JSON" })]
    mocks.recall.mockImplementation(() => Promise.resolve(recallResults))

    const searchResults = await handleRecall(
      { client, config },
      { question: "What API format do we use?" },
    )
    expect(searchResults).toHaveLength(1)

    // 3. Pin it
    const pinResult = await handlePin({ client }, { memory_id: FAKE_UUID })
    expect(pinResult.pinned).toBe(true)

    // 4. Correct it
    mocks.correct.mockImplementation(() =>
      Promise.resolve({
        id: FAKE_UUID,
        oldContent: "API uses REST with JSON",
        newContent: "API uses REST with JSON and supports GraphQL",
      }),
    )
    const correctResult = await handleCorrect(
      { client },
      { memory_id: FAKE_UUID, new_content: "API uses REST with JSON and supports GraphQL" },
    )
    expect(correctResult.oldContent).toBe("API uses REST with JSON")
    expect(correctResult.newContent).toBe("API uses REST with JSON and supports GraphQL")

    // 5. Unpin it
    const unpinResult = await handleUnpin({ client }, { memory_id: FAKE_UUID })
    expect(unpinResult.pinned).toBe(false)

    // 6. Forget it
    const forgetResult = await handleForget({ client }, { memory_id: FAKE_UUID })
    expect(forgetResult.deleted).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Cross-agent attribution
// ---------------------------------------------------------------------------

describe("cross-agent attribution", () => {
  it("delegates to client which preserves original author on correct", async () => {
    const config = fakeConfig()

    // Agent A remembers a fact
    mocks.remember.mockImplementation(() =>
      Promise.resolve({
        id: FAKE_UUID,
        content: "Database uses PostgreSQL 16",
        deduplicated: false,
      }),
    )
    await handleRemember({ client }, { content: "Database uses PostgreSQL 16" })
    expect(mocks.remember).toHaveBeenCalledTimes(1)

    // Agent B recalls it
    const recallResults = [
      fakeRecallResult({ createdBy: "alice/reviewer", content: "Database uses PostgreSQL 16" }),
    ]
    mocks.recall.mockImplementation(() => Promise.resolve(recallResults))

    const results = await handleRecall({ client, config }, { question: "What database do we use?" })
    expect(results[0]?.createdBy).toBe("alice/reviewer")

    // Agent B corrects it — the API server preserves original author
    mocks.correct.mockImplementation(() =>
      Promise.resolve({
        id: FAKE_UUID,
        oldContent: "Database uses PostgreSQL 16",
        newContent: "Database uses PostgreSQL 17",
      }),
    )

    const correctResult = await handleCorrect(
      { client },
      { memory_id: FAKE_UUID, new_content: "Database uses PostgreSQL 17" },
    )

    // Verify client.correct was called with ID and new content only
    expect(mocks.correct).toHaveBeenCalledWith(FAKE_UUID, "Database uses PostgreSQL 17")
    expect(correctResult.newContent).toBe("Database uses PostgreSQL 17")
  })
})
