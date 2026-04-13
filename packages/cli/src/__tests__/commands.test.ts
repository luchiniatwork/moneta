import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import type { Config, MemoryRow, RecallResult } from "@moneta/shared"
import type { CliContext } from "../context.ts"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const FAKE_EMBEDDING = new Array(1536).fill(0.1)
const FAKE_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
const FAKE_UUID_2 = "b2c3d4e5-f6a7-8901-bcde-f12345678901"

const mockEmbed = mock(() => Promise.resolve(FAKE_EMBEDDING))
const mockCallRecall = mock(() => Promise.resolve([] as RecallResult[]))
const mockCallTouchMemories = mock(() => Promise.resolve())
const mockUpdateMemory = mock(() => Promise.resolve(fakeMemoryRow()))
const mockGetMemoryById = mock((): Promise<MemoryRow | null> => Promise.resolve(fakeMemoryRow()))
const mockFindMemoryByIdPrefix = mock(() => Promise.resolve([] as MemoryRow[]))
const mockListMemories = mock(() => Promise.resolve([] as MemoryRow[]))

mock.module("@moneta/shared", () => ({
  embed: mockEmbed,
  callRecall: mockCallRecall,
  callTouchMemories: mockCallTouchMemories,
  updateMemory: mockUpdateMemory,
  getMemoryById: mockGetMemoryById,
  findMemoryByIdPrefix: mockFindMemoryByIdPrefix,
  listMemories: mockListMemories,
}))

// Import handlers after mocking
const { handleSearch } = await import("../commands/search.ts")
const { handleShow } = await import("../commands/show.ts")

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

function fakeContext(overrides?: Partial<Config>): CliContext {
  return {
    config: fakeConfig(overrides),
    db: fakeDb,
  }
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

// Capture console.log output per test
let logOutput: string[]
const originalLog = console.log

beforeEach(() => {
  mockEmbed.mockClear()
  mockCallRecall.mockClear()
  mockCallTouchMemories.mockClear()
  mockUpdateMemory.mockClear()
  mockGetMemoryById.mockClear()
  mockFindMemoryByIdPrefix.mockClear()
  mockListMemories.mockClear()

  // Reset default implementations
  mockEmbed.mockImplementation(() => Promise.resolve(FAKE_EMBEDDING))
  mockCallRecall.mockImplementation(() => Promise.resolve([]))
  mockCallTouchMemories.mockImplementation(() => Promise.resolve())
  mockUpdateMemory.mockImplementation(() => Promise.resolve(fakeMemoryRow()))
  mockGetMemoryById.mockImplementation(() => Promise.resolve(fakeMemoryRow()))
  mockFindMemoryByIdPrefix.mockImplementation(() => Promise.resolve([]))
  mockListMemories.mockImplementation(() => Promise.resolve([]))

  // Capture console.log output
  logOutput = []
  console.log = (...args: unknown[]) => {
    logOutput.push(args.map(String).join(" "))
  }
})

afterEach(() => {
  console.log = originalLog
})

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

describe("handleSearch", () => {
  it("generates an embedding for the question", async () => {
    const ctx = fakeContext()
    await handleSearch("How does auth work?", {}, ctx)

    expect(mockEmbed).toHaveBeenCalledTimes(1)
    expect(mockEmbed).toHaveBeenCalledWith(
      "How does auth work?",
      "sk-test",
      "text-embedding-3-small",
    )
  })

  it("calls callRecall with the embedding and default config values", async () => {
    const ctx = fakeContext()
    await handleSearch("How does auth work?", {}, ctx)

    expect(mockCallRecall).toHaveBeenCalledTimes(1)
    const args = mockCallRecall.mock.calls[0] as unknown[]
    const params = args[1] as Record<string, unknown>
    expect(params.projectId).toBe("test-project")
    expect(params.embedding).toEqual(FAKE_EMBEDDING)
    expect(params.limit).toBe(10)
    expect(params.threshold).toBe(0.3)
    expect(params.includeArchived).toBe(false)
  })

  it("passes CLI flag values to callRecall", async () => {
    const ctx = fakeContext()
    await handleSearch(
      "auth?",
      {
        limit: "5",
        threshold: "0.5",
        agent: "alice/code-reviewer",
        engineer: "alice",
        repo: "auth-service",
        tags: "security,jwt",
        archived: true,
      },
      ctx,
    )

    const args = mockCallRecall.mock.calls[0] as unknown[]
    const params = args[1] as Record<string, unknown>
    expect(params.limit).toBe(5)
    expect(params.threshold).toBe(0.5)
    expect(params.includeArchived).toBe(true)
    expect(params.agent).toBe("alice/code-reviewer")
    expect(params.engineer).toBe("alice")
    expect(params.repo).toBe("auth-service")
    expect(params.tags).toEqual(["security", "jwt"])
  })

  it("calls touchMemories for returned result IDs", async () => {
    mockCallRecall.mockImplementation(() =>
      Promise.resolve([fakeRecallResult({ id: "id-1" }), fakeRecallResult({ id: "id-2" })]),
    )

    const ctx = fakeContext()
    await handleSearch("auth?", {}, ctx)

    expect(mockCallTouchMemories).toHaveBeenCalledTimes(1)
    const args = mockCallTouchMemories.mock.calls[0] as unknown[]
    expect(args[1]).toEqual(["id-1", "id-2"])
  })

  it("does not call touchMemories when no results", async () => {
    const ctx = fakeContext()
    await handleSearch("nonexistent topic", {}, ctx)

    expect(mockCallTouchMemories).not.toHaveBeenCalled()
  })

  it("promotes archived memories when include_archived is set", async () => {
    mockCallRecall.mockImplementation(() =>
      Promise.resolve([
        fakeRecallResult({ id: "id-active", archived: false }),
        fakeRecallResult({ id: "id-archived", archived: true }),
      ]),
    )

    const ctx = fakeContext()
    await handleSearch("auth?", { archived: true }, ctx)

    // Should only promote the archived one
    expect(mockUpdateMemory).toHaveBeenCalledTimes(1)
    const args = mockUpdateMemory.mock.calls[0] as unknown[]
    expect(args[1]).toBe("id-archived")
    expect(args[2]).toEqual({ archived: false })
  })

  it("does not promote when include_archived is not set", async () => {
    mockCallRecall.mockImplementation(() => Promise.resolve([fakeRecallResult()]))

    const ctx = fakeContext()
    await handleSearch("auth?", {}, ctx)

    expect(mockUpdateMemory).not.toHaveBeenCalled()
  })

  it("outputs JSON when --json flag is set", async () => {
    const results = [fakeRecallResult()]
    mockCallRecall.mockImplementation(() => Promise.resolve(results))

    const ctx = fakeContext()
    await handleSearch("auth?", { json: true }, ctx)

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
    const ctx = fakeContext()
    await handleShow(FAKE_UUID, {}, ctx)

    expect(mockGetMemoryById).toHaveBeenCalledTimes(1)
    expect(mockGetMemoryById).toHaveBeenCalledWith(fakeDb, FAKE_UUID)
    expect(mockFindMemoryByIdPrefix).not.toHaveBeenCalled()
  })

  it("falls back to prefix match when exact match fails", async () => {
    mockGetMemoryById.mockImplementation(() => Promise.resolve(null))
    mockFindMemoryByIdPrefix.mockImplementation(() => Promise.resolve([fakeMemoryRow()]))

    const ctx = fakeContext()
    await handleShow("a1b2c3", {}, ctx)

    expect(mockGetMemoryById).toHaveBeenCalledWith(fakeDb, "a1b2c3")
    expect(mockFindMemoryByIdPrefix).toHaveBeenCalledWith(fakeDb, "test-project", "a1b2c3")
  })

  it("throws when no memory is found by exact or prefix match", async () => {
    mockGetMemoryById.mockImplementation(() => Promise.resolve(null))
    mockFindMemoryByIdPrefix.mockImplementation(() => Promise.resolve([]))

    const ctx = fakeContext()
    await expect(handleShow("nonexistent", {}, ctx)).rejects.toThrow(
      "Memory not found: nonexistent",
    )
  })

  it("throws on ambiguous prefix match", async () => {
    mockGetMemoryById.mockImplementation(() => Promise.resolve(null))
    mockFindMemoryByIdPrefix.mockImplementation(() =>
      Promise.resolve([fakeMemoryRow({ id: FAKE_UUID }), fakeMemoryRow({ id: FAKE_UUID_2 })]),
    )

    const ctx = fakeContext()
    await expect(handleShow("a1b2c3", {}, ctx)).rejects.toThrow("Ambiguous ID prefix")
  })

  it("outputs JSON when --json flag is set", async () => {
    const memory = fakeMemoryRow({ content: "test memory" })
    mockGetMemoryById.mockImplementation(() => Promise.resolve(memory))

    const ctx = fakeContext()
    await handleShow(FAKE_UUID, { json: true }, ctx)

    expect(logOutput).toHaveLength(1)
    const parsed = JSON.parse(logOutput[0] as string)
    expect(parsed.id).toBe(FAKE_UUID)
    expect(parsed.content).toBe("test memory")
  })

  it("displays detail view for a found memory", async () => {
    const memory = fakeMemoryRow({
      content: "Auth service uses JWT",
      created_by: "alice/code-reviewer",
      importance: "high",
      pinned: true,
      tags: ["security", "jwt"],
    })
    mockGetMemoryById.mockImplementation(() => Promise.resolve(memory))

    const ctx = fakeContext()
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
