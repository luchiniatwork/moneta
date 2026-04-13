import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { loadConfig, validateConfig } from "../config.ts"

describe("loadConfig", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Clear all MONETA_ env vars before each test
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("MONETA_") || key === "OPENAI_API_KEY") {
        delete process.env[key]
      }
    }
  })

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("MONETA_") || key === "OPENAI_API_KEY") {
        delete process.env[key]
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (key.startsWith("MONETA_") || key === "OPENAI_API_KEY") {
        process.env[key] = value
      }
    }
  })

  describe("defaults", () => {
    it("uses default values for optional fields", () => {
      const config = loadConfig()
      expect(config.embeddingModel).toBe("text-embedding-3-small")
      expect(config.archiveAfterDays).toBe(30)
      expect(config.dedupThreshold).toBe(0.95)
      expect(config.searchThreshold).toBe(0.3)
      expect(config.searchLimit).toBe(10)
      expect(config.maxContentLength).toBe(2000)
    })

    it("returns empty strings for missing required fields", () => {
      const config = loadConfig()
      expect(config.projectId).toBe("")
      expect(config.databaseUrl).toBe("")
      expect(config.openaiApiKey).toBe("")
    })
  })

  describe("env var loading", () => {
    it("reads MONETA_PROJECT_ID from env", () => {
      process.env.MONETA_PROJECT_ID = "test-project"
      const config = loadConfig()
      expect(config.projectId).toBe("test-project")
    })

    it("reads MONETA_DATABASE_URL from env", () => {
      process.env.MONETA_DATABASE_URL = "postgresql://localhost:5432/test"
      const config = loadConfig()
      expect(config.databaseUrl).toBe("postgresql://localhost:5432/test")
    })

    it("reads OPENAI_API_KEY from env", () => {
      process.env.OPENAI_API_KEY = "sk-test-key"
      const config = loadConfig()
      expect(config.openaiApiKey).toBe("sk-test-key")
    })

    it("reads MONETA_AGENT_ID from env", () => {
      process.env.MONETA_AGENT_ID = "alice/reviewer"
      const config = loadConfig()
      expect(config.agentId).toBe("alice/reviewer")
    })

    it("reads numeric env vars", () => {
      process.env.MONETA_ARCHIVE_AFTER_DAYS = "60"
      process.env.MONETA_DEDUP_THRESHOLD = "0.97"
      process.env.MONETA_SEARCH_THRESHOLD = "0.5"
      process.env.MONETA_SEARCH_LIMIT = "20"
      process.env.MONETA_MAX_CONTENT_LENGTH = "5000"

      const config = loadConfig()
      expect(config.archiveAfterDays).toBe(60)
      expect(config.dedupThreshold).toBe(0.97)
      expect(config.searchThreshold).toBe(0.5)
      expect(config.searchLimit).toBe(20)
      expect(config.maxContentLength).toBe(5000)
    })

    it("ignores invalid numeric env vars and falls through to defaults", () => {
      process.env.MONETA_ARCHIVE_AFTER_DAYS = "not-a-number"
      const config = loadConfig()
      expect(config.archiveAfterDays).toBe(30) // default
    })
  })

  describe("overrides", () => {
    it("overrides take precedence over env vars", () => {
      process.env.MONETA_PROJECT_ID = "from-env"
      const config = loadConfig({ projectId: "from-override" })
      expect(config.projectId).toBe("from-override")
    })

    it("overrides take precedence for optional fields", () => {
      const config = loadConfig({ searchLimit: 42 })
      expect(config.searchLimit).toBe(42)
    })
  })
})

describe("validateConfig", () => {
  it("returns errors for missing required fields", () => {
    const config = loadConfig()
    const errors = validateConfig(config)
    expect(errors.length).toBe(3)
    expect(errors[0]).toContain("projectId")
    expect(errors[1]).toContain("databaseUrl")
    expect(errors[2]).toContain("openaiApiKey")
  })

  it("returns empty array when all required fields are present", () => {
    const config = loadConfig({
      projectId: "test",
      databaseUrl: "postgresql://localhost:5432/test",
      openaiApiKey: "sk-test",
    })
    const errors = validateConfig(config)
    expect(errors).toEqual([])
  })

  it("optionally requires agentId", () => {
    const config = loadConfig({
      projectId: "test",
      databaseUrl: "postgresql://localhost:5432/test",
      openaiApiKey: "sk-test",
    })
    const errors = validateConfig(config, { requireAgentId: true })
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain("agentId")
  })

  it("passes when agentId is required and present", () => {
    const config = loadConfig({
      projectId: "test",
      databaseUrl: "postgresql://localhost:5432/test",
      openaiApiKey: "sk-test",
      agentId: "alice/reviewer",
    })
    const errors = validateConfig(config, { requireAgentId: true })
    expect(errors).toEqual([])
  })
})
