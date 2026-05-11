import { beforeEach, describe, expect, it, mock } from "bun:test"
import type {
  AgentIdentity,
  Config,
  DedupMatch,
  MemoryRow,
  MonetaDb,
  RecallResult,
} from "@moneta/shared"

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const mockEmbed = mock(() => Promise.resolve(new Array(1536).fill(0.1) as number[]))
const mockEmbedBatch = mock(() =>
  Promise.resolve([new Array(1536).fill(0.1) as number[], new Array(1536).fill(0.2) as number[]]),
)
const mockCallDedupCheck = mock((): Promise<DedupMatch[]> => Promise.resolve([]))
const mockCallArchiveStale = mock(() => Promise.resolve(0))
const mockInsertMemory = mock(() =>
  Promise.resolve({
    id: "mem-001",
    project_id: "test-project",
    content: "test content",
    embedding: null,
    created_by: "alice/coder",
    engineer: "alice",
    agent_type: "coder",
    repo: null,
    tags: [],
    importance: "normal" as const,
    pinned: false,
    archived: false,
    created_at: new Date("2025-01-01"),
    updated_at: new Date("2025-01-01"),
    last_accessed_at: new Date("2025-01-01"),
    access_count: 0,
  } satisfies MemoryRow),
)
const mockUpdateMemory = mock(() =>
  Promise.resolve({
    id: "mem-001",
    project_id: "test-project",
    content: "updated content",
    embedding: null,
    created_by: "alice/coder",
    engineer: "alice",
    agent_type: "coder",
    repo: null,
    tags: [],
    importance: "normal" as const,
    pinned: false,
    archived: false,
    created_at: new Date("2025-01-01"),
    updated_at: new Date("2025-01-02"),
    last_accessed_at: new Date("2025-01-01"),
    access_count: 0,
  } satisfies MemoryRow),
)
const mockGetMemoryById = mock(
  (): Promise<MemoryRow | null> =>
    Promise.resolve({
      id: "mem-001",
      project_id: "test-project",
      content: "old content",
      embedding: null,
      created_by: "alice/coder",
      engineer: "alice",
      agent_type: "coder",
      repo: null,
      tags: [],
      importance: "normal" as const,
      pinned: false,
      archived: false,
      created_at: new Date("2025-01-01"),
      updated_at: new Date("2025-01-01"),
      last_accessed_at: new Date("2025-01-01"),
      access_count: 0,
    } satisfies MemoryRow),
)
const mockDeleteMemory = mock(() => Promise.resolve(false))
const mockListMemories = mock(() => Promise.resolve([]))
const mockFindMemoryByIdPrefix = mock(() => Promise.resolve([]))
const mockCallRecall = mock((): Promise<RecallResult[]> => Promise.resolve([]))
const mockCallTouchMemories = mock(() => Promise.resolve())
const mockGetStats = mock(() =>
  Promise.resolve({
    total: 10,
    active: 8,
    archived: 2,
    pinned: 3,
    byEngineer: [{ engineer: "alice", count: 5, pinned: 2 }],
    byRepo: [{ repo: "moneta", count: 4 }],
    topTags: [{ tag: "important", count: 3 }],
    approachingStale: 1,
    archivedLast7Days: 0,
    createdToday: 2,
    mostAccessed: [{ id: "mem-001", content: "test", accessCount: 10 }],
  }),
)

mock.module("@moneta/shared", () => ({
  embed: mockEmbed,
  embedBatch: mockEmbedBatch,
  callArchiveStale: mockCallArchiveStale,
  callDedupCheck: mockCallDedupCheck,
  deleteMemory: mockDeleteMemory,
  findMemoryByIdPrefix: mockFindMemoryByIdPrefix,
  insertMemory: mockInsertMemory,
  listMemories: mockListMemories,
  updateMemory: mockUpdateMemory,
  getMemoryById: mockGetMemoryById,
  callRecall: mockCallRecall,
  callTouchMemories: mockCallTouchMemories,
  getStats: mockGetStats,
  parseAgentId: (id: string) => {
    const parts = id.split("/")
    return {
      createdBy: id,
      engineer: parts[0] === "auto" ? null : (parts[0] ?? null),
      agentType: parts[1] ?? "",
    }
  },
}))

// Import handlers AFTER mocking
const { handleRemember } = await import("../handlers/remember.ts")
const { handleRecall } = await import("../handlers/recall.ts")
const { handleCorrect } = await import("../handlers/correct.ts")
const { handleImport } = await import("../handlers/import.ts")
const { handleStats } = await import("../handlers/stats.ts")

// ---------------------------------------------------------------------------
// Test fixtures
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

const TEST_IDENTITY: AgentIdentity = {
  createdBy: "alice/coder",
  engineer: "alice",
  agentType: "coder",
}

const TEST_DB = {} as MonetaDb

// ---------------------------------------------------------------------------
// handleRemember
// ---------------------------------------------------------------------------

describe("handleRemember", () => {
  beforeEach(() => {
    mockEmbed.mockClear()
    mockCallDedupCheck.mockClear()
    mockInsertMemory.mockClear()
    mockUpdateMemory.mockClear()
  })

  it("inserts a new memory when no duplicates found", async () => {
    mockCallDedupCheck.mockResolvedValueOnce([])

    const result = await handleRemember(
      { config: TEST_CONFIG, db: TEST_DB, identity: TEST_IDENTITY, projectId: "test-project" },
      { content: "Bun is fast" },
    )

    expect(result.id).toBe("mem-001")
    expect(result.content).toBe("Bun is fast")
    expect(result.deduplicated).toBe(false)
    expect(mockEmbed).toHaveBeenCalledTimes(1)
    expect(mockInsertMemory).toHaveBeenCalledTimes(1)
  })

  it("updates in place when same agent has a duplicate", async () => {
    mockCallDedupCheck.mockResolvedValueOnce([
      { id: "existing-id", content: "old", similarity: 0.98, createdBy: "alice/coder" },
    ])

    const result = await handleRemember(
      { config: TEST_CONFIG, db: TEST_DB, identity: TEST_IDENTITY, projectId: "test-project" },
      { content: "Bun is very fast" },
    )

    expect(result.id).toBe("existing-id")
    expect(result.deduplicated).toBe(true)
    expect(mockUpdateMemory).toHaveBeenCalledTimes(1)
    expect(mockInsertMemory).not.toHaveBeenCalled()
  })

  it("inserts with corroborated tag when different agent has a duplicate", async () => {
    mockCallDedupCheck.mockResolvedValueOnce([
      { id: "existing-id", content: "old", similarity: 0.98, createdBy: "bob/reviewer" },
    ])

    const result = await handleRemember(
      { config: TEST_CONFIG, db: TEST_DB, identity: TEST_IDENTITY, projectId: "test-project" },
      { content: "Bun is fast", tags: ["runtime"] },
    )

    expect(result.deduplicated).toBe(false)
    expect(mockInsertMemory).toHaveBeenCalledTimes(1)

    const insertCall = mockInsertMemory.mock.calls[0] as unknown[]
    const insertArgs = insertCall?.[1] as Record<string, unknown> | undefined
    expect(insertArgs?.tags).toEqual(["runtime", "corroborated"])
  })

  it("auto-pins critical memories", async () => {
    mockCallDedupCheck.mockResolvedValueOnce([])

    await handleRemember(
      { config: TEST_CONFIG, db: TEST_DB, identity: TEST_IDENTITY, projectId: "test-project" },
      { content: "Never delete prod DB", importance: "critical" },
    )

    const insertCall = mockInsertMemory.mock.calls[0] as unknown[]
    const insertArgs = insertCall?.[1] as Record<string, unknown> | undefined
    expect(insertArgs?.pinned).toBe(true)
    expect(insertArgs?.importance).toBe("critical")
  })

  it("throws on content exceeding max length", async () => {
    const longContent = "a".repeat(2001)

    await expect(
      handleRemember(
        { config: TEST_CONFIG, db: TEST_DB, identity: TEST_IDENTITY, projectId: "test-project" },
        { content: longContent },
      ),
    ).rejects.toThrow("exceeds maximum length")
  })
})

// ---------------------------------------------------------------------------
// handleRecall
// ---------------------------------------------------------------------------

describe("handleRecall", () => {
  beforeEach(() => {
    mockEmbed.mockClear()
    mockCallRecall.mockClear()
    mockCallTouchMemories.mockClear()
    mockUpdateMemory.mockClear()
  })

  it("returns empty array when no results", async () => {
    mockCallRecall.mockResolvedValueOnce([])

    const results = await handleRecall(
      { config: TEST_CONFIG, db: TEST_DB, projectId: "test-project" },
      { question: "How does X work?" },
    )

    expect(results).toEqual([])
    expect(mockCallTouchMemories).not.toHaveBeenCalled()
  })

  it("passes queryText to callRecall for hybrid search", async () => {
    mockCallRecall.mockResolvedValueOnce([])

    await handleRecall(
      { config: TEST_CONFIG, db: TEST_DB, projectId: "test-project" },
      { question: "Patrick" },
    )

    const callArgs = mockCallRecall.mock.calls[0] as unknown[]
    const recallParams = callArgs?.[1] as Record<string, unknown> | undefined
    expect(recallParams?.queryText).toBe("Patrick")
  })

  it("uses config threshold when no per-request threshold provided", async () => {
    mockCallRecall.mockResolvedValueOnce([])

    await handleRecall(
      { config: TEST_CONFIG, db: TEST_DB, projectId: "test-project" },
      { question: "test query" },
    )

    const callArgs = mockCallRecall.mock.calls[0] as unknown[]
    const recallParams = callArgs?.[1] as Record<string, unknown> | undefined
    expect(recallParams?.threshold).toBe(0.3)
  })

  it("uses per-request threshold when provided", async () => {
    mockCallRecall.mockResolvedValueOnce([])

    await handleRecall(
      { config: TEST_CONFIG, db: TEST_DB, projectId: "test-project" },
      { question: "test query", threshold: 0.15 },
    )

    const callArgs = mockCallRecall.mock.calls[0] as unknown[]
    const recallParams = callArgs?.[1] as Record<string, unknown> | undefined
    expect(recallParams?.threshold).toBe(0.15)
  })

  it("touches returned memories", async () => {
    const mockResults: RecallResult[] = [
      {
        id: "mem-001",
        content: "X works like this",
        similarity: 0.85,
        createdBy: "alice/coder",
        engineer: "alice",
        repo: null,
        tags: [],
        importance: "normal",
        pinned: false,
        archived: false,
        accessCount: 5,
        createdAt: new Date("2025-01-01"),
        lastAccessedAt: new Date("2025-01-01"),
      },
    ]
    mockCallRecall.mockResolvedValueOnce(mockResults)

    const results = await handleRecall(
      { config: TEST_CONFIG, db: TEST_DB, projectId: "test-project" },
      { question: "How does X work?" },
    )

    expect(results).toHaveLength(1)
    expect(mockCallTouchMemories).toHaveBeenCalledWith(TEST_DB, ["mem-001"])
  })

  it("promotes archived memories when includeArchived is true", async () => {
    const mockResults: RecallResult[] = [
      {
        id: "mem-002",
        content: "Archived fact",
        similarity: 0.8,
        createdBy: "alice/coder",
        engineer: "alice",
        repo: null,
        tags: [],
        importance: "normal",
        pinned: false,
        archived: true,
        accessCount: 1,
        createdAt: new Date("2025-01-01"),
        lastAccessedAt: new Date("2024-12-01"),
      },
    ]
    mockCallRecall.mockResolvedValueOnce(mockResults)

    const results = await handleRecall(
      { config: TEST_CONFIG, db: TEST_DB, projectId: "test-project" },
      { question: "Tell me about archived", includeArchived: true },
    )

    expect(results[0]?.archived).toBe(false)
    expect(mockUpdateMemory).toHaveBeenCalledWith(TEST_DB, "mem-002", { archived: false })
  })
})

// ---------------------------------------------------------------------------
// handleCorrect
// ---------------------------------------------------------------------------

describe("handleCorrect", () => {
  beforeEach(() => {
    mockEmbed.mockClear()
    mockGetMemoryById.mockClear()
    mockUpdateMemory.mockClear()
  })

  it("updates memory content and generates new embedding", async () => {
    mockGetMemoryById.mockResolvedValueOnce({
      id: "mem-001",
      project_id: "test-project",
      content: "old content",
      embedding: null,
      created_by: "alice/coder",
      engineer: "alice",
      agent_type: "coder",
      repo: null,
      tags: [],
      importance: "normal" as const,
      pinned: false,
      archived: false,
      created_at: new Date("2025-01-01"),
      updated_at: new Date("2025-01-01"),
      last_accessed_at: new Date("2025-01-01"),
      access_count: 0,
    })

    const result = await handleCorrect(
      { config: TEST_CONFIG, db: TEST_DB },
      { memoryId: "mem-001", newContent: "corrected content" },
    )

    expect(result.id).toBe("mem-001")
    expect(result.oldContent).toBe("old content")
    expect(result.newContent).toBe("corrected content")
    expect(mockEmbed).toHaveBeenCalledTimes(1)
    expect(mockUpdateMemory).toHaveBeenCalledTimes(1)
  })

  it("throws when memory not found", async () => {
    mockGetMemoryById.mockResolvedValueOnce(null)

    await expect(
      handleCorrect(
        { config: TEST_CONFIG, db: TEST_DB },
        { memoryId: "nonexistent", newContent: "new" },
      ),
    ).rejects.toThrow("Memory not found")
  })

  it("throws on empty content", async () => {
    await expect(
      handleCorrect({ config: TEST_CONFIG, db: TEST_DB }, { memoryId: "mem-001", newContent: "" }),
    ).rejects.toThrow("Content must not be empty")
  })

  it("throws on content exceeding max length", async () => {
    const longContent = "a".repeat(2001)

    await expect(
      handleCorrect(
        { config: TEST_CONFIG, db: TEST_DB },
        { memoryId: "mem-001", newContent: longContent },
      ),
    ).rejects.toThrow("exceeds maximum length")
  })
})

// ---------------------------------------------------------------------------
// handleImport
// ---------------------------------------------------------------------------

describe("handleImport", () => {
  beforeEach(() => {
    mockEmbedBatch.mockClear()
    mockCallDedupCheck.mockClear()
    mockInsertMemory.mockClear()
  })

  it("imports multiple memories using batch embedding", async () => {
    mockCallDedupCheck.mockResolvedValue([])
    mockEmbedBatch.mockResolvedValueOnce([new Array(1536).fill(0.1), new Array(1536).fill(0.2)])

    const result = await handleImport(
      { config: TEST_CONFIG, db: TEST_DB, identity: TEST_IDENTITY, projectId: "test-project" },
      {
        memories: [{ content: "Fact one" }, { content: "Fact two" }],
      },
    )

    expect(result.imported).toBe(2)
    expect(result.skipped).toBe(0)
    expect(result.errors).toBeUndefined()
    expect(mockEmbedBatch).toHaveBeenCalledTimes(1)
    expect(mockInsertMemory).toHaveBeenCalledTimes(2)
  })

  it("skips same-agent duplicates during import", async () => {
    mockCallDedupCheck
      .mockResolvedValueOnce([
        { id: "dup-1", content: "old", similarity: 0.98, createdBy: "alice/coder" },
      ])
      .mockResolvedValueOnce([])
    mockEmbedBatch.mockResolvedValueOnce([new Array(1536).fill(0.1), new Array(1536).fill(0.2)])

    const result = await handleImport(
      { config: TEST_CONFIG, db: TEST_DB, identity: TEST_IDENTITY, projectId: "test-project" },
      {
        memories: [{ content: "Duplicate fact" }, { content: "New fact" }],
      },
    )

    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(1)
  })

  it("returns empty result for empty input", async () => {
    const result = await handleImport(
      { config: TEST_CONFIG, db: TEST_DB, identity: TEST_IDENTITY, projectId: "test-project" },
      { memories: [] },
    )

    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(0)
  })

  it("validates content length before embedding", async () => {
    const result = await handleImport(
      { config: TEST_CONFIG, db: TEST_DB, identity: TEST_IDENTITY, projectId: "test-project" },
      {
        memories: [{ content: "a".repeat(2001) }],
      },
    )

    expect(result.imported).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors?.[0]).toContain("exceeds maximum length")
    expect(mockEmbedBatch).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// handleStats
// ---------------------------------------------------------------------------

describe("handleStats", () => {
  beforeEach(() => {
    mockGetStats.mockClear()
  })

  it("returns stats from shared getStats", async () => {
    const result = await handleStats({ db: TEST_DB, projectId: "test-project" })

    expect(result.total).toBe(10)
    expect(result.active).toBe(8)
    expect(result.archived).toBe(2)
    expect(result.pinned).toBe(3)
    expect(result.byEngineer).toHaveLength(1)
    expect(result.topTags).toHaveLength(1)
    expect(mockGetStats).toHaveBeenCalledWith(TEST_DB, "test-project")
  })
})
