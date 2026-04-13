import { beforeEach, describe, expect, it, mock } from "bun:test"
import type { AgentIdentity, Config, DedupMatch, MemoryRow, RecallResult } from "@moneta/shared"
import { handleCorrect } from "../tools/correct.ts"
import { handleForget } from "../tools/forget.ts"
import { handlePin } from "../tools/pin.ts"
import { handleRecall } from "../tools/recall.ts"
import { handleRemember } from "../tools/remember.ts"
import { handleUnpin } from "../tools/unpin.ts"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const FAKE_EMBEDDING = new Array(1536).fill(0.1)
const FAKE_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

const mockEmbed = mock(() => Promise.resolve(FAKE_EMBEDDING))
const mockInsertMemory = mock(() => Promise.resolve(fakeMemoryRow()))
const mockGetMemoryById = mock((): Promise<MemoryRow | null> => Promise.resolve(fakeMemoryRow()))
const mockUpdateMemory = mock(() => Promise.resolve(fakeMemoryRow()))
const mockDeleteMemory = mock(() => Promise.resolve(true))
const mockCallRecall = mock(() => Promise.resolve([] as RecallResult[]))
const mockCallTouchMemories = mock(() => Promise.resolve())
const mockCallDedupCheck = mock(() => Promise.resolve([] as DedupMatch[]))

mock.module("@moneta/shared", () => ({
  embed: mockEmbed,
  insertMemory: mockInsertMemory,
  getMemoryById: mockGetMemoryById,
  updateMemory: mockUpdateMemory,
  deleteMemory: mockDeleteMemory,
  callRecall: mockCallRecall,
  callTouchMemories: mockCallTouchMemories,
  callDedupCheck: mockCallDedupCheck,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

function fakeIdentity(overrides?: Partial<AgentIdentity>): AgentIdentity {
  return {
    createdBy: "alice/code-reviewer",
    engineer: "alice",
    agentType: "code-reviewer",
    ...overrides,
  }
}

function fakeMemoryRow(overrides?: Partial<MemoryRow>): MemoryRow {
  return {
    id: FAKE_UUID,
    project_id: "test-project",
    content: "Auth service uses JWT with RS256",
    embedding: null,
    created_by: "alice/code-reviewer",
    engineer: "alice",
    agent_type: "code-reviewer",
    repo: null,
    tags: [],
    importance: "normal",
    pinned: false,
    archived: false,
    created_at: new Date("2026-04-08T14:30:00Z"),
    updated_at: new Date("2026-04-08T14:30:00Z"),
    last_accessed_at: new Date("2026-04-08T14:30:00Z"),
    access_count: 0,
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
    createdAt: new Date("2026-04-08T14:30:00Z"),
    lastAccessedAt: new Date("2026-04-10T09:15:00Z"),
    ...overrides,
  }
}

// biome-ignore lint/suspicious/noExplicitAny: mock db for testing
const fakeDb = {} as any

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockEmbed.mockClear()
  mockInsertMemory.mockClear()
  mockGetMemoryById.mockClear()
  mockUpdateMemory.mockClear()
  mockDeleteMemory.mockClear()
  mockCallRecall.mockClear()
  mockCallTouchMemories.mockClear()
  mockCallDedupCheck.mockClear()

  // Reset to default implementations
  mockEmbed.mockImplementation(() => Promise.resolve(FAKE_EMBEDDING))
  mockInsertMemory.mockImplementation(() => Promise.resolve(fakeMemoryRow()))
  mockGetMemoryById.mockImplementation(
    (): Promise<MemoryRow | null> => Promise.resolve(fakeMemoryRow()),
  )
  mockUpdateMemory.mockImplementation(() => Promise.resolve(fakeMemoryRow()))
  mockDeleteMemory.mockImplementation(() => Promise.resolve(true))
  mockCallRecall.mockImplementation(() => Promise.resolve([]))
  mockCallTouchMemories.mockImplementation(() => Promise.resolve())
  mockCallDedupCheck.mockImplementation(() => Promise.resolve([] as DedupMatch[]))
})

// ---------------------------------------------------------------------------
// remember
// ---------------------------------------------------------------------------

describe("handleRemember", () => {
  it("inserts a new memory when no duplicates exist", async () => {
    const config = fakeConfig()
    const identity = fakeIdentity()
    const result = await handleRemember({ config, db: fakeDb, identity }, { content: "Test fact" })

    expect(result.deduplicated).toBe(false)
    expect(result.content).toBe("Test fact")
    expect(result.id).toBe(FAKE_UUID)
    expect(mockEmbed).toHaveBeenCalledWith("Test fact", "sk-test", "text-embedding-3-small")
    expect(mockCallDedupCheck).toHaveBeenCalledTimes(1)
    expect(mockInsertMemory).toHaveBeenCalledTimes(1)
  })

  it("updates in place when same agent has a near-duplicate", async () => {
    mockCallDedupCheck.mockImplementation(() =>
      Promise.resolve([
        { id: FAKE_UUID, content: "Old fact", similarity: 0.97, createdBy: "alice/code-reviewer" },
      ]),
    )

    const config = fakeConfig()
    const identity = fakeIdentity()
    const result = await handleRemember(
      { config, db: fakeDb, identity },
      { content: "Updated fact" },
    )

    expect(result.deduplicated).toBe(true)
    expect(result.id).toBe(FAKE_UUID)
    expect(mockUpdateMemory).toHaveBeenCalledTimes(1)
    expect(mockInsertMemory).toHaveBeenCalledTimes(0)
  })

  it("inserts with corroborated tag when different agent has a near-duplicate", async () => {
    mockCallDedupCheck.mockImplementation(() =>
      Promise.resolve([
        { id: FAKE_UUID, content: "Same fact", similarity: 0.97, createdBy: "bob/architect" },
      ]),
    )

    const config = fakeConfig()
    const identity = fakeIdentity()
    const result = await handleRemember(
      { config, db: fakeDb, identity },
      { content: "Same fact from different agent" },
    )

    expect(result.deduplicated).toBe(false)
    expect(mockInsertMemory).toHaveBeenCalledTimes(1)
    const insertCall = mockInsertMemory.mock.calls[0] as unknown[]
    const insertArgs = insertCall[1] as Record<string, unknown>
    expect(insertArgs.tags).toContain("corroborated")
  })

  it("auto-pins critical memories", async () => {
    const config = fakeConfig()
    const identity = fakeIdentity()
    await handleRemember(
      { config, db: fakeDb, identity },
      { content: "Critical fact", importance: "critical" },
    )

    const insertCall = mockInsertMemory.mock.calls[0] as unknown[]
    const insertArgs = insertCall[1] as Record<string, unknown>
    expect(insertArgs.pinned).toBe(true)
    expect(insertArgs.importance).toBe("critical")
  })

  it("wraps embedding failures with actionable message", async () => {
    mockEmbed.mockImplementation(() => Promise.reject(new Error("401 Unauthorized")))

    const config = fakeConfig()
    const identity = fakeIdentity()

    expect(handleRemember({ config, db: fakeDb, identity }, { content: "Test" })).rejects.toThrow(
      "Failed to generate embedding",
    )
  })
})

// ---------------------------------------------------------------------------
// recall
// ---------------------------------------------------------------------------

describe("handleRecall", () => {
  it("returns empty array when no results found", async () => {
    const config = fakeConfig()
    const results = await handleRecall({ config, db: fakeDb }, { question: "How does auth work?" })

    expect(results).toHaveLength(0)
    expect(mockEmbed).toHaveBeenCalledTimes(1)
    expect(mockCallTouchMemories).not.toHaveBeenCalled()
  })

  it("returns results and touches memories", async () => {
    const recallResult = fakeRecallResult()
    mockCallRecall.mockImplementation(() => Promise.resolve([recallResult]))

    const config = fakeConfig()
    const results = await handleRecall({ config, db: fakeDb }, { question: "How does auth work?" })

    expect(results).toHaveLength(1)
    expect(results[0]?.content).toBe("Auth service uses JWT with RS256")
    expect(mockCallTouchMemories).toHaveBeenCalledWith(fakeDb, [FAKE_UUID])
  })

  it("promotes archived memories when include_archived is true", async () => {
    const archivedResult = fakeRecallResult({ archived: true })
    mockCallRecall.mockImplementation(() => Promise.resolve([archivedResult]))

    const config = fakeConfig()
    const results = await handleRecall(
      { config, db: fakeDb },
      { question: "Old question", include_archived: true },
    )

    expect(results[0]?.archived).toBe(false)
    expect(mockUpdateMemory).toHaveBeenCalledWith(fakeDb, FAKE_UUID, { archived: false })
  })

  it("passes scope filters to callRecall", async () => {
    const config = fakeConfig()
    await handleRecall(
      { config, db: fakeDb },
      {
        question: "Test",
        scope: { agent: "bob/architect", repo: "auth-service", tags: ["security"] },
        limit: 5,
      },
    )

    const recallCall = mockCallRecall.mock.calls[0] as unknown[]
    const recallArgs = recallCall[1] as Record<string, unknown>
    expect(recallArgs.agent).toBe("bob/architect")
    expect(recallArgs.repo).toBe("auth-service")
    expect(recallArgs.tags).toEqual(["security"])
    expect(recallArgs.limit).toBe(5)
  })

  it("wraps embedding failures with actionable message", async () => {
    mockEmbed.mockImplementation(() => Promise.reject(new Error("network error")))

    const config = fakeConfig()
    expect(handleRecall({ config, db: fakeDb }, { question: "Test" })).rejects.toThrow(
      "Failed to generate embedding",
    )
  })
})

// ---------------------------------------------------------------------------
// pin
// ---------------------------------------------------------------------------

describe("handlePin", () => {
  it("pins an existing memory", async () => {
    const result = await handlePin({ db: fakeDb }, { memory_id: FAKE_UUID })

    expect(result.id).toBe(FAKE_UUID)
    expect(result.pinned).toBe(true)
    expect(mockGetMemoryById).toHaveBeenCalledWith(fakeDb, FAKE_UUID)
    expect(mockUpdateMemory).toHaveBeenCalledWith(fakeDb, FAKE_UUID, { pinned: true })
  })

  it("throws when memory is not found", async () => {
    mockGetMemoryById.mockImplementation(() => Promise.resolve(null))

    expect(handlePin({ db: fakeDb }, { memory_id: FAKE_UUID })).rejects.toThrow(
      `Memory not found: ${FAKE_UUID}`,
    )
  })
})

// ---------------------------------------------------------------------------
// unpin
// ---------------------------------------------------------------------------

describe("handleUnpin", () => {
  it("unpins an existing memory", async () => {
    const result = await handleUnpin({ db: fakeDb }, { memory_id: FAKE_UUID })

    expect(result.id).toBe(FAKE_UUID)
    expect(result.pinned).toBe(false)
    expect(mockUpdateMemory).toHaveBeenCalledWith(fakeDb, FAKE_UUID, { pinned: false })
  })

  it("throws when memory is not found", async () => {
    mockGetMemoryById.mockImplementation(() => Promise.resolve(null))

    expect(handleUnpin({ db: fakeDb }, { memory_id: FAKE_UUID })).rejects.toThrow(
      `Memory not found: ${FAKE_UUID}`,
    )
  })
})

// ---------------------------------------------------------------------------
// forget
// ---------------------------------------------------------------------------

describe("handleForget", () => {
  it("deletes an existing memory", async () => {
    const result = await handleForget({ db: fakeDb }, { memory_id: FAKE_UUID })

    expect(result.id).toBe(FAKE_UUID)
    expect(result.deleted).toBe(true)
    expect(mockGetMemoryById).toHaveBeenCalledWith(fakeDb, FAKE_UUID)
    expect(mockDeleteMemory).toHaveBeenCalledWith(fakeDb, FAKE_UUID)
  })

  it("throws when memory is not found", async () => {
    mockGetMemoryById.mockImplementation(() => Promise.resolve(null))

    expect(handleForget({ db: fakeDb }, { memory_id: FAKE_UUID })).rejects.toThrow(
      `Memory not found: ${FAKE_UUID}`,
    )
  })
})

// ---------------------------------------------------------------------------
// correct
// ---------------------------------------------------------------------------

describe("handleCorrect", () => {
  it("updates content and re-embeds", async () => {
    const config = fakeConfig()
    const result = await handleCorrect(
      { config, db: fakeDb },
      { memory_id: FAKE_UUID, new_content: "Updated fact about auth" },
    )

    expect(result.id).toBe(FAKE_UUID)
    expect(result.oldContent).toBe("Auth service uses JWT with RS256")
    expect(result.newContent).toBe("Updated fact about auth")
    expect(mockEmbed).toHaveBeenCalledWith(
      "Updated fact about auth",
      "sk-test",
      "text-embedding-3-small",
    )
    expect(mockUpdateMemory).toHaveBeenCalledWith(fakeDb, FAKE_UUID, {
      content: "Updated fact about auth",
      newEmbedding: FAKE_EMBEDDING,
    })
  })

  it("throws when memory is not found", async () => {
    mockGetMemoryById.mockImplementation(() => Promise.resolve(null))

    const config = fakeConfig()
    expect(
      handleCorrect({ config, db: fakeDb }, { memory_id: FAKE_UUID, new_content: "New fact" }),
    ).rejects.toThrow(`Memory not found: ${FAKE_UUID}`)
  })

  it("throws on empty content", async () => {
    const config = fakeConfig()
    expect(
      handleCorrect({ config, db: fakeDb }, { memory_id: FAKE_UUID, new_content: "" }),
    ).rejects.toThrow("Content must not be empty")
  })

  it("throws on whitespace-only content", async () => {
    const config = fakeConfig()
    expect(
      handleCorrect({ config, db: fakeDb }, { memory_id: FAKE_UUID, new_content: "   " }),
    ).rejects.toThrow("Content must not be empty")
  })

  it("throws on content exceeding max length", async () => {
    const config = fakeConfig({ maxContentLength: 10 })
    expect(
      handleCorrect(
        { config, db: fakeDb },
        { memory_id: FAKE_UUID, new_content: "This is too long for the limit" },
      ),
    ).rejects.toThrow("Content exceeds maximum length")
  })

  it("preserves original author attribution", async () => {
    mockGetMemoryById.mockImplementation(() =>
      Promise.resolve(fakeMemoryRow({ created_by: "bob/architect" })),
    )

    const config = fakeConfig()
    await handleCorrect(
      { config, db: fakeDb },
      { memory_id: FAKE_UUID, new_content: "Corrected fact" },
    )

    const updateCall = mockUpdateMemory.mock.calls[0] as unknown[]
    const updateArgs = updateCall[2] as Record<string, unknown>
    // created_by should NOT be in the update payload
    expect(updateArgs).not.toHaveProperty("created_by")
  })

  it("wraps embedding failures with actionable message", async () => {
    mockEmbed.mockImplementation(() => Promise.reject(new Error("rate limited")))

    const config = fakeConfig()
    expect(
      handleCorrect({ config, db: fakeDb }, { memory_id: FAKE_UUID, new_content: "New fact" }),
    ).rejects.toThrow("Failed to generate embedding")
  })
})

// ---------------------------------------------------------------------------
// Full lifecycle: create → search → pin → correct → unpin → forget
// ---------------------------------------------------------------------------

describe("full lifecycle", () => {
  it("completes the entire memory lifecycle", async () => {
    const config = fakeConfig()
    const identity = fakeIdentity()

    // 1. Remember a fact
    const rememberResult = await handleRemember(
      { config, db: fakeDb, identity },
      { content: "API uses REST with JSON", tags: ["architecture"] },
    )
    expect(rememberResult.id).toBe(FAKE_UUID)
    expect(rememberResult.deduplicated).toBe(false)

    // 2. Recall it
    const recallResults = [fakeRecallResult({ content: "API uses REST with JSON" })]
    mockCallRecall.mockImplementation(() => Promise.resolve(recallResults))

    const searchResults = await handleRecall(
      { config, db: fakeDb },
      { question: "What API format do we use?" },
    )
    expect(searchResults).toHaveLength(1)
    expect(mockCallTouchMemories).toHaveBeenCalled()

    // 3. Pin it
    const pinResult = await handlePin({ db: fakeDb }, { memory_id: FAKE_UUID })
    expect(pinResult.pinned).toBe(true)

    // 4. Correct it
    const correctResult = await handleCorrect(
      { config, db: fakeDb },
      { memory_id: FAKE_UUID, new_content: "API uses REST with JSON and supports GraphQL" },
    )
    expect(correctResult.oldContent).toBe("Auth service uses JWT with RS256")
    expect(correctResult.newContent).toBe("API uses REST with JSON and supports GraphQL")

    // 5. Unpin it
    const unpinResult = await handleUnpin({ db: fakeDb }, { memory_id: FAKE_UUID })
    expect(unpinResult.pinned).toBe(false)

    // 6. Forget it
    const forgetResult = await handleForget({ db: fakeDb }, { memory_id: FAKE_UUID })
    expect(forgetResult.deleted).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Cross-agent attribution
// ---------------------------------------------------------------------------

describe("cross-agent attribution", () => {
  it("preserves original author when a different agent corrects a memory", async () => {
    const config = fakeConfig()
    const agentA = fakeIdentity({
      createdBy: "alice/reviewer",
      engineer: "alice",
      agentType: "reviewer",
    })

    // Agent A remembers a fact
    await handleRemember(
      { config, db: fakeDb, identity: agentA },
      { content: "Database uses PostgreSQL 16" },
    )

    const insertCall = mockInsertMemory.mock.calls[0] as unknown[]
    const insertArgs = insertCall[1] as Record<string, unknown>
    expect(insertArgs.created_by).toBe("alice/reviewer")

    // Agent B recalls it
    const recallResults = [
      fakeRecallResult({ createdBy: "alice/reviewer", content: "Database uses PostgreSQL 16" }),
    ]
    mockCallRecall.mockImplementation(() => Promise.resolve(recallResults))

    const results = await handleRecall(
      { config, db: fakeDb },
      { question: "What database do we use?" },
    )
    expect(results[0]?.createdBy).toBe("alice/reviewer")

    // Agent B corrects it — original author should be preserved
    mockGetMemoryById.mockImplementation(() =>
      Promise.resolve(fakeMemoryRow({ created_by: "alice/reviewer" })),
    )

    await handleCorrect(
      { config, db: fakeDb },
      { memory_id: FAKE_UUID, new_content: "Database uses PostgreSQL 17" },
    )

    // The updateMemory call should NOT include created_by
    const updateCall = mockUpdateMemory.mock.calls[0] as unknown[]
    const updateArgs = updateCall[2] as Record<string, unknown>
    expect(updateArgs).not.toHaveProperty("created_by")
    expect(updateArgs.content).toBe("Database uses PostgreSQL 17")
  })
})
