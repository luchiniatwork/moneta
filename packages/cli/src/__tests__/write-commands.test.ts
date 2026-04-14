import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import type { Memory, MonetaClient, RecallResult } from "@moneta/api-client"
import type { Config } from "@moneta/shared"
import type { CliContext } from "../context.ts"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

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

// ---------------------------------------------------------------------------
// Import handlers (no mocking needed — we inject the client directly)
// ---------------------------------------------------------------------------

const { handlePin } = await import("../commands/pin.ts")
const { handleUnpin } = await import("../commands/unpin.ts")
const { handleArchive } = await import("../commands/archive.ts")
const { handleRestore } = await import("../commands/restore.ts")
const { handleForget } = await import("../commands/forget.ts")
const { handleCorrect } = await import("../commands/correct.ts")
const { handleRemember } = await import("../commands/remember.ts")

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
// remember
// ---------------------------------------------------------------------------

describe("handleRemember", () => {
  it("calls client.remember with content", async () => {
    const client = createMockClient({
      remember: mock(() =>
        Promise.resolve({ id: FAKE_UUID, content: "Frontend uses React 19", deduplicated: false }),
      ),
    })
    const ctx: CliContext = { config: fakeConfig({ agentId: "alice/architect" }), client }
    await handleRemember("Frontend uses React 19", {}, ctx)

    expect(client.remember).toHaveBeenCalledTimes(1)
    const args = (client.remember as ReturnType<typeof mock>).mock.calls[0] as unknown[]
    const params = args[0] as Record<string, unknown>
    expect(params.content).toBe("Frontend uses React 19")
  })

  it("throws on empty content", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig({ agentId: "alice/architect" }), client }
    await expect(handleRemember("", {}, ctx)).rejects.toThrow("must not be empty")
  })

  it("throws on whitespace-only content", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig({ agentId: "alice/architect" }), client }
    await expect(handleRemember("   ", {}, ctx)).rejects.toThrow("must not be empty")
  })

  it("throws when content exceeds max length", async () => {
    const client = createMockClient()
    const ctx: CliContext = {
      config: fakeConfig({ agentId: "alice/architect", maxContentLength: 10 }),
      client,
    }
    await expect(handleRemember("This is way too long for the limit", {}, ctx)).rejects.toThrow(
      "exceeds maximum length",
    )
  })

  it("throws on invalid importance value", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig({ agentId: "alice/architect" }), client }
    await expect(handleRemember("A fact", { importance: "urgent" }, ctx)).rejects.toThrow(
      'Invalid importance "urgent"',
    )
  })

  it("passes tags and repo to client.remember", async () => {
    const client = createMockClient({
      remember: mock(() =>
        Promise.resolve({ id: FAKE_UUID, content: "Uses Tailwind v4", deduplicated: false }),
      ),
    })
    const ctx: CliContext = { config: fakeConfig({ agentId: "alice/architect" }), client }
    await handleRemember("Uses Tailwind v4", { tags: "frontend,styling", repo: "web-app" }, ctx)

    const args = (client.remember as ReturnType<typeof mock>).mock.calls[0] as unknown[]
    const params = args[0] as Record<string, unknown>
    expect(params.tags).toEqual(["frontend", "styling"])
    expect(params.repo).toBe("web-app")
  })

  it("prints dedup message when server returns deduplicated=true", async () => {
    const client = createMockClient({
      remember: mock(() =>
        Promise.resolve({ id: FAKE_UUID, content: "Updated fact", deduplicated: true }),
      ),
    })
    const ctx: CliContext = { config: fakeConfig({ agentId: "alice/architect" }), client }
    await handleRemember("Updated fact", {}, ctx)

    const output = logOutput.join("\n")
    expect(output).toContain("Updated existing memory")
    expect(output).toContain("a1b2c3")
  })

  it("outputs JSON when --json flag is set", async () => {
    const client = createMockClient({
      remember: mock(() =>
        Promise.resolve({ id: FAKE_UUID, content: "A fact", deduplicated: false }),
      ),
    })
    const ctx: CliContext = { config: fakeConfig({ agentId: "alice/architect" }), client }
    await handleRemember("A fact", { json: true }, ctx)

    expect(logOutput).toHaveLength(1)
    const parsed = JSON.parse(logOutput[0] as string)
    expect(parsed.id).toBe(FAKE_UUID)
    expect(parsed.deduplicated).toBe(false)
  })

  it("outputs JSON with deduplicated=true on dedup", async () => {
    const client = createMockClient({
      remember: mock(() =>
        Promise.resolve({ id: FAKE_UUID, content: "Updated fact", deduplicated: true }),
      ),
    })
    const ctx: CliContext = { config: fakeConfig({ agentId: "alice/architect" }), client }
    await handleRemember("Updated fact", { json: true }, ctx)

    const parsed = JSON.parse(logOutput[0] as string)
    expect(parsed.deduplicated).toBe(true)
  })

  it("prints confirmation message on successful insert", async () => {
    const client = createMockClient({
      remember: mock(() =>
        Promise.resolve({
          id: FAKE_UUID,
          content: "Frontend uses React 19",
          deduplicated: false,
        }),
      ),
    })
    const ctx: CliContext = { config: fakeConfig({ agentId: "alice/architect" }), client }
    await handleRemember("Frontend uses React 19", {}, ctx)

    const output = logOutput.join("\n")
    expect(output).toContain("Remembered")
    expect(output).toContain("a1b2c3")
    expect(output).toContain("Frontend uses React 19")
  })
})

// ---------------------------------------------------------------------------
// pin
// ---------------------------------------------------------------------------

describe("handlePin", () => {
  it("resolves the memory and calls client.pin", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig(), client }
    await handlePin(FAKE_UUID, ctx)

    expect(client.getMemory).toHaveBeenCalledWith(FAKE_UUID)
    expect(client.pin).toHaveBeenCalledWith(FAKE_UUID)
  })

  it("prints confirmation message with short ID", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig(), client }
    await handlePin(FAKE_UUID, ctx)

    const output = logOutput.join("\n")
    expect(output).toContain("Pinned a1b2c3")
    expect(output).toContain("will not be archived")
  })

  it("works with short prefix", async () => {
    const client = createMockClient({
      getMemory: mock(() => Promise.resolve(null)),
      resolvePrefix: mock(() => Promise.resolve([fakeMemory()])),
    })
    const ctx: CliContext = { config: fakeConfig(), client }
    await handlePin("a1b2c3", ctx)

    expect(client.pin).toHaveBeenCalledWith(FAKE_UUID)
  })

  it("throws when memory not found", async () => {
    const client = createMockClient({
      getMemory: mock(() => Promise.resolve(null)),
      resolvePrefix: mock(() => Promise.resolve([])),
    })
    const ctx: CliContext = { config: fakeConfig(), client }
    await expect(handlePin("nonexistent", ctx)).rejects.toThrow("Memory not found")
  })
})

// ---------------------------------------------------------------------------
// unpin
// ---------------------------------------------------------------------------

describe("handleUnpin", () => {
  it("resolves the memory and calls client.unpin", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig(), client }
    await handleUnpin(FAKE_UUID, ctx)

    expect(client.unpin).toHaveBeenCalledWith(FAKE_UUID)
  })

  it("prints confirmation message", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig(), client }
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
  it("resolves the memory and calls client.archive", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig(), client }
    await handleArchive(FAKE_UUID, ctx)

    expect(client.archive).toHaveBeenCalledWith(FAKE_UUID)
  })

  it("prints confirmation message", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig(), client }
    await handleArchive(FAKE_UUID, ctx)

    const output = logOutput.join("\n")
    expect(output).toContain("Archived a1b2c3")
  })
})

// ---------------------------------------------------------------------------
// restore
// ---------------------------------------------------------------------------

describe("handleRestore", () => {
  it("calls client.restore", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig(), client }
    await handleRestore(FAKE_UUID, ctx)

    expect(client.restore).toHaveBeenCalledWith(FAKE_UUID)
  })

  it("prints confirmation message with access clock reset note", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig(), client }
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
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig(), client }
    await handleForget(FAKE_UUID, { yes: true }, ctx)

    expect(client.deleteMemory).toHaveBeenCalledWith(FAKE_UUID)
  })

  it("prints deletion confirmation", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig(), client }
    await handleForget(FAKE_UUID, { yes: true }, ctx)

    const output = logOutput.join("\n")
    expect(output).toContain("Deleted a1b2c3")
  })

  it("shows memory content before deletion", async () => {
    const memory = fakeMemory({ content: "Important JWT fact" })
    const client = createMockClient({
      getMemory: mock(() => Promise.resolve(memory)),
    })
    const ctx: CliContext = { config: fakeConfig(), client }
    await handleForget(FAKE_UUID, { yes: true }, ctx)

    const output = logOutput.join("\n")
    expect(output).toContain("Important JWT fact")
  })

  it("throws when memory not found", async () => {
    const client = createMockClient({
      getMemory: mock(() => Promise.resolve(null)),
      resolvePrefix: mock(() => Promise.resolve([])),
    })
    const ctx: CliContext = { config: fakeConfig(), client }
    await expect(handleForget("nonexistent", { yes: true }, ctx)).rejects.toThrow(
      "Memory not found",
    )
  })
})

// ---------------------------------------------------------------------------
// correct
// ---------------------------------------------------------------------------

describe("handleCorrect", () => {
  it("calls client.correct with new content", async () => {
    const client = createMockClient({
      correct: mock(() =>
        Promise.resolve({
          id: FAKE_UUID,
          oldContent: "Auth service uses JWT with RS256",
          newContent: "Updated JWT fact",
        }),
      ),
    })
    const ctx: CliContext = { config: fakeConfig(), client }
    await handleCorrect(FAKE_UUID, "Updated JWT fact", ctx)

    expect(client.correct).toHaveBeenCalledWith(FAKE_UUID, "Updated JWT fact")
  })

  it("shows old and new content", async () => {
    const client = createMockClient({
      getMemory: mock(() => Promise.resolve(fakeMemory({ content: "Old fact" }))),
      correct: mock(() =>
        Promise.resolve({
          id: FAKE_UUID,
          oldContent: "Old fact",
          newContent: "New fact",
        }),
      ),
    })
    const ctx: CliContext = { config: fakeConfig(), client }
    await handleCorrect(FAKE_UUID, "New fact", ctx)

    const output = logOutput.join("\n")
    expect(output).toContain("Corrected a1b2c3")
    expect(output).toContain("Old fact")
    expect(output).toContain("New fact")
  })

  it("throws on empty content", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig(), client }
    await expect(handleCorrect(FAKE_UUID, "", ctx)).rejects.toThrow("must not be empty")
  })

  it("throws on whitespace-only content", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig(), client }
    await expect(handleCorrect(FAKE_UUID, "   ", ctx)).rejects.toThrow("must not be empty")
  })

  it("throws when content exceeds max length", async () => {
    const client = createMockClient()
    const ctx: CliContext = { config: fakeConfig({ maxContentLength: 10 }), client }
    await expect(handleCorrect(FAKE_UUID, "This is way too long", ctx)).rejects.toThrow(
      "exceeds maximum length",
    )
  })

  it("throws when memory not found", async () => {
    const client = createMockClient({
      getMemory: mock(() => Promise.resolve(null)),
      resolvePrefix: mock(() => Promise.resolve([])),
    })
    const ctx: CliContext = { config: fakeConfig(), client }
    await expect(handleCorrect("nonexistent", "new content", ctx)).rejects.toThrow(
      "Memory not found",
    )
  })
})
