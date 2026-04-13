import { afterEach, describe, expect, it, mock } from "bun:test"
import { embed, resetClient } from "../embeddings.ts"

// Mock the OpenAI module
const mockCreate = mock(() =>
  Promise.resolve({
    data: [{ embedding: new Array(1536).fill(0.1) }],
  }),
)

mock.module("openai", () => ({
  default: class MockOpenAI {
    embeddings = { create: mockCreate }
  },
}))

describe("embed", () => {
  afterEach(() => {
    resetClient()
    mockCreate.mockClear()
  })

  it("returns a 1536-dimensional vector", async () => {
    const result = await embed("test text", "sk-test")
    expect(result).toHaveLength(1536)
    expect(result[0]).toBe(0.1)
  })

  it("calls OpenAI with correct parameters", async () => {
    await embed("some fact", "sk-test", "text-embedding-3-small")
    expect(mockCreate).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: "some fact",
    })
  })

  it("uses default model when not specified", async () => {
    await embed("some fact", "sk-test")
    expect(mockCreate).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: "some fact",
    })
  })

  it("throws on empty text", async () => {
    expect(embed("", "sk-test")).rejects.toThrow("empty text")
  })

  it("throws on whitespace-only text", async () => {
    expect(embed("   ", "sk-test")).rejects.toThrow("empty text")
  })
})
