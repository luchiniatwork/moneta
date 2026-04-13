import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import type { Config, DedupMatch, MemoryRow } from "@moneta/shared"
import type { CliContext } from "../context.ts"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const FAKE_EMBEDDING = new Array(1536).fill(0.1)
const FAKE_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

const mockEmbed = mock(() => Promise.resolve(FAKE_EMBEDDING))
const mockUpdateMemory = mock(() => Promise.resolve(fakeMemoryRow()))
const mockDeleteMemory = mock(() => Promise.resolve(true))
const mockGetMemoryById = mock((): Promise<MemoryRow | null> => Promise.resolve(fakeMemoryRow()))
const mockFindMemoryByIdPrefix = mock(() => Promise.resolve([] as MemoryRow[]))
const mockInsertMemory = mock(() => Promise.resolve(fakeMemoryRow()))
const mockCallDedupCheck = mock(() => Promise.resolve([] as DedupMatch[]))
const mockEmbedBatch = mock(() => Promise.resolve([FAKE_EMBEDDING]))
const mockParseAgentId = mock((id: string) => ({
  createdBy: id,
  engineer: id.split("/")[0] === "auto" ? null : (id.split("/")[0] ?? null),
  agentType: id.split("/")[1] ?? id,
}))

mock.module("@moneta/shared", () => ({
  embed: mockEmbed,
  embedBatch: mockEmbedBatch,
  updateMemory: mockUpdateMemory,
  deleteMemory: mockDeleteMemory,
  getMemoryById: mockGetMemoryById,
  findMemoryByIdPrefix: mockFindMemoryByIdPrefix,
  insertMemory: mockInsertMemory,
  callDedupCheck: mockCallDedupCheck,
  parseAgentId: mockParseAgentId,
}))

// Import handlers after mocking
const { handlePin } = await import("../commands/pin.ts")
const { handleUnpin } = await import("../commands/unpin.ts")
const { handleArchive } = await import("../commands/archive.ts")
const { handleRestore } = await import("../commands/restore.ts")
const { handleForget } = await import("../commands/forget.ts")
const { handleCorrect } = await import("../commands/correct.ts")

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

let logOutput: string[]
const originalLog = console.log

beforeEach(() => {
  mockEmbed.mockClear()
  mockUpdateMemory.mockClear()
  mockDeleteMemory.mockClear()
  mockGetMemoryById.mockClear()
  mockFindMemoryByIdPrefix.mockClear()
  mockInsertMemory.mockClear()
  mockCallDedupCheck.mockClear()
  mockEmbedBatch.mockClear()

  // Reset default implementations
  mockEmbed.mockImplementation(() => Promise.resolve(FAKE_EMBEDDING))
  mockUpdateMemory.mockImplementation(() => Promise.resolve(fakeMemoryRow()))
  mockDeleteMemory.mockImplementation(() => Promise.resolve(true))
  mockGetMemoryById.mockImplementation(() => Promise.resolve(fakeMemoryRow()))
  mockFindMemoryByIdPrefix.mockImplementation(() => Promise.resolve([]))
  mockInsertMemory.mockImplementation(() => Promise.resolve(fakeMemoryRow()))
  mockCallDedupCheck.mockImplementation(() => Promise.resolve([]))
  mockEmbedBatch.mockImplementation(() => Promise.resolve([FAKE_EMBEDDING]))

  logOutput = []
  console.log = (...args: unknown[]) => {
    logOutput.push(args.map(String).join(" "))
  }
})

afterEach(() => {
  console.log = originalLog
})

// ---------------------------------------------------------------------------
// pin
// ---------------------------------------------------------------------------

describe("handlePin", () => {
  it("resolves the memory and sets pinned to true", async () => {
    const ctx = fakeContext()
    await handlePin(FAKE_UUID, ctx)

    expect(mockGetMemoryById).toHaveBeenCalledWith(fakeDb, FAKE_UUID)
    expect(mockUpdateMemory).toHaveBeenCalledWith(fakeDb, FAKE_UUID, { pinned: true })
  })

  it("prints confirmation message with short ID", async () => {
    const ctx = fakeContext()
    await handlePin(FAKE_UUID, ctx)

    const output = logOutput.join("\n")
    expect(output).toContain("Pinned a1b2c3")
    expect(output).toContain("will not be archived")
  })

  it("works with short prefix", async () => {
    mockGetMemoryById.mockImplementation(() => Promise.resolve(null))
    mockFindMemoryByIdPrefix.mockImplementation(() => Promise.resolve([fakeMemoryRow()]))

    const ctx = fakeContext()
    await handlePin("a1b2c3", ctx)

    expect(mockUpdateMemory).toHaveBeenCalledWith(fakeDb, FAKE_UUID, { pinned: true })
  })

  it("throws when memory not found", async () => {
    mockGetMemoryById.mockImplementation(() => Promise.resolve(null))
    mockFindMemoryByIdPrefix.mockImplementation(() => Promise.resolve([]))

    const ctx = fakeContext()
    await expect(handlePin("nonexistent", ctx)).rejects.toThrow("Memory not found")
  })
})

// ---------------------------------------------------------------------------
// unpin
// ---------------------------------------------------------------------------

describe("handleUnpin", () => {
  it("resolves the memory and sets pinned to false", async () => {
    const ctx = fakeContext()
    await handleUnpin(FAKE_UUID, ctx)

    expect(mockUpdateMemory).toHaveBeenCalledWith(fakeDb, FAKE_UUID, { pinned: false })
  })

  it("prints confirmation message", async () => {
    const ctx = fakeContext()
    await handleUnpin(FAKE_UUID, ctx)

    const output = logOutput.join("\n")
    expect(output).toContain("Unpinned a1b2c3")
    expect(output).toContain("eligible for archival")
  })
})

// ---------------------------------------------------------------------------
// archive
// ---------------------------------------------------------------------------

describe("handleArchive", () => {
  it("resolves the memory and sets archived to true", async () => {
    const ctx = fakeContext()
    await handleArchive(FAKE_UUID, ctx)

    expect(mockUpdateMemory).toHaveBeenCalledWith(fakeDb, FAKE_UUID, { archived: true })
  })

  it("prints confirmation message", async () => {
    const ctx = fakeContext()
    await handleArchive(FAKE_UUID, ctx)

    const output = logOutput.join("\n")
    expect(output).toContain("Archived a1b2c3")
  })
})

// ---------------------------------------------------------------------------
// restore
// ---------------------------------------------------------------------------

describe("handleRestore", () => {
  it("sets archived to false and resets access clock", async () => {
    const ctx = fakeContext()
    await handleRestore(FAKE_UUID, ctx)

    expect(mockUpdateMemory).toHaveBeenCalledTimes(1)
    const args = mockUpdateMemory.mock.calls[0] as unknown[]
    expect(args[1]).toBe(FAKE_UUID)
    const updates = args[2] as Record<string, unknown>
    expect(updates.archived).toBe(false)
    expect(updates.last_accessed_at).toBeInstanceOf(Date)
  })

  it("prints confirmation message with access clock reset note", async () => {
    const ctx = fakeContext()
    await handleRestore(FAKE_UUID, ctx)

    const output = logOutput.join("\n")
    expect(output).toContain("Restored a1b2c3")
    expect(output).toContain("Access clock reset")
  })
})

// ---------------------------------------------------------------------------
// forget
// ---------------------------------------------------------------------------

describe("handleForget", () => {
  it("deletes the memory when --yes is passed", async () => {
    const ctx = fakeContext()
    await handleForget(FAKE_UUID, { yes: true }, ctx)

    expect(mockDeleteMemory).toHaveBeenCalledWith(fakeDb, FAKE_UUID)
  })

  it("prints deletion confirmation", async () => {
    const ctx = fakeContext()
    await handleForget(FAKE_UUID, { yes: true }, ctx)

    const output = logOutput.join("\n")
    expect(output).toContain("Deleted a1b2c3")
  })

  it("shows memory content before deletion", async () => {
    const memory = fakeMemoryRow({ content: "Important JWT fact" })
    mockGetMemoryById.mockImplementation(() => Promise.resolve(memory))

    const ctx = fakeContext()
    await handleForget(FAKE_UUID, { yes: true }, ctx)

    const output = logOutput.join("\n")
    expect(output).toContain("Important JWT fact")
  })

  it("throws when memory not found", async () => {
    mockGetMemoryById.mockImplementation(() => Promise.resolve(null))
    mockFindMemoryByIdPrefix.mockImplementation(() => Promise.resolve([]))

    const ctx = fakeContext()
    await expect(handleForget("nonexistent", { yes: true }, ctx)).rejects.toThrow(
      "Memory not found",
    )
  })
})

// ---------------------------------------------------------------------------
// correct
// ---------------------------------------------------------------------------

describe("handleCorrect", () => {
  it("generates new embedding and updates content", async () => {
    const ctx = fakeContext()
    await handleCorrect(FAKE_UUID, "Updated JWT fact", ctx)

    expect(mockEmbed).toHaveBeenCalledWith("Updated JWT fact", "sk-test", "text-embedding-3-small")
    expect(mockUpdateMemory).toHaveBeenCalledWith(fakeDb, FAKE_UUID, {
      content: "Updated JWT fact",
      newEmbedding: FAKE_EMBEDDING,
    })
  })

  it("shows old and new content", async () => {
    const memory = fakeMemoryRow({ content: "Old fact" })
    mockGetMemoryById.mockImplementation(() => Promise.resolve(memory))

    const ctx = fakeContext()
    await handleCorrect(FAKE_UUID, "New fact", ctx)

    const output = logOutput.join("\n")
    expect(output).toContain("Corrected a1b2c3")
    expect(output).toContain("Old fact")
    expect(output).toContain("New fact")
  })

  it("throws on empty content", async () => {
    const ctx = fakeContext()
    await expect(handleCorrect(FAKE_UUID, "", ctx)).rejects.toThrow("must not be empty")
  })

  it("throws on whitespace-only content", async () => {
    const ctx = fakeContext()
    await expect(handleCorrect(FAKE_UUID, "   ", ctx)).rejects.toThrow("must not be empty")
  })

  it("throws when content exceeds max length", async () => {
    const ctx = fakeContext({ maxContentLength: 10 })
    await expect(handleCorrect(FAKE_UUID, "This is way too long", ctx)).rejects.toThrow(
      "exceeds maximum length",
    )
  })

  it("throws when memory not found", async () => {
    mockGetMemoryById.mockImplementation(() => Promise.resolve(null))
    mockFindMemoryByIdPrefix.mockImplementation(() => Promise.resolve([]))

    const ctx = fakeContext()
    await expect(handleCorrect("nonexistent", "new content", ctx)).rejects.toThrow(
      "Memory not found",
    )
  })
})
