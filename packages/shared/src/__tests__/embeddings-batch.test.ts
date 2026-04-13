import { afterEach, describe, expect, it, mock } from "bun:test"
import { embedBatch, resetClient } from "../embeddings.ts"

// Mock the OpenAI module
const mockCreate = mock(() =>
  Promise.resolve({
    data: [
      { index: 0, embedding: new Array(1536).fill(0.1) },
      { index: 1, embedding: new Array(1536).fill(0.2) },
    ],
  }),
)

mock.module("openai", () => ({
  default: class MockOpenAI {
    embeddings = { create: mockCreate }
  },
}))

describe("embedBatch", () => {
  afterEach(() => {
    resetClient()
    mockCreate.mockClear()
  })

  it("returns an empty array for empty input", async () => {
    const result = await embedBatch([], "sk-test")
    expect(result).toEqual([])
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("embeds multiple texts in a single API call", async () => {
    const result = await embedBatch(["fact one", "fact two"], "sk-test")

    expect(result).toHaveLength(2)
    expect(result[0]).toHaveLength(1536)
    expect(result[1]).toHaveLength(1536)

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: ["fact one", "fact two"],
    })
  })

  it("preserves order based on response index", async () => {
    // Return items out of order to test sorting
    mockCreate.mockImplementation(() =>
      Promise.resolve({
        data: [
          { index: 1, embedding: new Array(1536).fill(0.9) },
          { index: 0, embedding: new Array(1536).fill(0.1) },
        ],
      }),
    )

    const result = await embedBatch(["first", "second"], "sk-test")

    expect(result[0]?.[0]).toBe(0.1) // first text -> 0.1
    expect(result[1]?.[0]).toBe(0.9) // second text -> 0.9
  })

  it("uses the specified model", async () => {
    mockCreate.mockImplementation(() =>
      Promise.resolve({
        data: [{ index: 0, embedding: new Array(1536).fill(0.1) }],
      }),
    )

    await embedBatch(["test"], "sk-test", "text-embedding-3-large")

    expect(mockCreate).toHaveBeenCalledWith({
      model: "text-embedding-3-large",
      input: ["test"],
    })
  })

  it("throws on empty text at a specific index", async () => {
    await expect(embedBatch(["valid", "", "also valid"], "sk-test")).rejects.toThrow(
      "empty text at index 1",
    )
  })

  it("throws on whitespace-only text", async () => {
    await expect(embedBatch(["valid", "   "], "sk-test")).rejects.toThrow("empty text at index 1")
  })

  it("chunks large inputs into batches of 100", async () => {
    // Create 250 texts
    const texts = Array.from({ length: 250 }, (_, i) => `fact number ${i}`)

    // Mock to return correct number of embeddings per chunk
    let callCount = 0
    mockCreate.mockImplementation(() => {
      callCount++
      // Chunks: 100, 100, 50
      const chunkSize = callCount <= 2 ? 100 : 50
      return Promise.resolve({
        data: Array.from({ length: chunkSize }, (_, i) => ({
          index: i,
          embedding: new Array(1536).fill(0.1),
        })),
      })
    })

    const result = await embedBatch(texts, "sk-test")

    expect(result).toHaveLength(250)
    // Should have made 3 API calls: 100 + 100 + 50
    expect(mockCreate).toHaveBeenCalledTimes(3)
  })
})
