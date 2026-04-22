import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadConfig, parseDotEnv, validateConfig } from "../config.ts"

describe("loadConfig", () => {
  let originalCwd: string
  let tmpDir: string
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Isolate from any .env or .moneta/config.json in the real working tree
    originalCwd = process.cwd()
    tmpDir = mkdtempSync(join(tmpdir(), "moneta-test-"))
    process.chdir(tmpDir)

    // Clear all MONETA_ env vars before each test
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("MONETA_") || key === "OPENAI_API_KEY") {
        delete process.env[key]
      }
    }
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tmpDir, { recursive: true, force: true })

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
  let originalCwd: string
  let tmpDir: string
  const originalEnv = { ...process.env }

  beforeEach(() => {
    originalCwd = process.cwd()
    tmpDir = mkdtempSync(join(tmpdir(), "moneta-test-"))
    process.chdir(tmpDir)

    // Clear all MONETA_ env vars before each test so loadConfig() starts clean
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("MONETA_") || key === "OPENAI_API_KEY") {
        delete process.env[key]
      }
    }
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tmpDir, { recursive: true, force: true })

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

  it("does not require projectId when requireProjectId is false", () => {
    const config = loadConfig({
      databaseUrl: "postgresql://localhost:5432/test",
      openaiApiKey: "sk-test",
    })
    const errors = validateConfig(config, { requireProjectId: false })
    expect(errors).toEqual([])
  })

  it("still requires projectId by default", () => {
    const config = loadConfig({
      databaseUrl: "postgresql://localhost:5432/test",
      openaiApiKey: "sk-test",
    })
    const errors = validateConfig(config)
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain("projectId")
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

  it("skips databaseUrl and openaiApiKey when requireDatabase is false", () => {
    const config = loadConfig({ projectId: "test" })
    const errors = validateConfig(config, { requireDatabase: false })
    expect(errors).toEqual([])
  })

  it("requires apiUrl when requireApiUrl is true", () => {
    const config = loadConfig({
      projectId: "test",
      databaseUrl: "postgresql://localhost:5432/test",
      openaiApiKey: "sk-test",
    })
    const errors = validateConfig(config, { requireApiUrl: true })
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain("apiUrl")
  })

  it("passes when requireApiUrl is true and apiUrl is present", () => {
    const config = loadConfig({
      projectId: "test",
      databaseUrl: "postgresql://localhost:5432/test",
      openaiApiKey: "sk-test",
      apiUrl: "http://localhost:3000/api/v1",
    })
    const errors = validateConfig(config, { requireApiUrl: true })
    expect(errors).toEqual([])
  })

  it("combines requireProjectId: false and requireDatabase: false for client-only validation", () => {
    const config = loadConfig({
      apiUrl: "http://localhost:3000/api/v1",
    })
    const errors = validateConfig(config, {
      requireProjectId: false,
      requireDatabase: false,
      requireApiUrl: true,
    })
    expect(errors).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// parseDotEnv
// ---------------------------------------------------------------------------

describe("parseDotEnv", () => {
  it("parses KEY=VALUE lines", () => {
    const result = parseDotEnv("FOO=bar\nBAZ=qux")
    expect(result).toEqual({ FOO: "bar", BAZ: "qux" })
  })

  it("strips double quotes from values", () => {
    const result = parseDotEnv('FOO="bar baz"')
    expect(result).toEqual({ FOO: "bar baz" })
  })

  it("strips single quotes from values", () => {
    const result = parseDotEnv("FOO='bar baz'")
    expect(result).toEqual({ FOO: "bar baz" })
  })

  it("handles export prefix", () => {
    const result = parseDotEnv("export FOO=bar")
    expect(result).toEqual({ FOO: "bar" })
  })

  it("ignores comments", () => {
    const result = parseDotEnv("# comment\nFOO=bar\n# another")
    expect(result).toEqual({ FOO: "bar" })
  })

  it("ignores empty lines", () => {
    const result = parseDotEnv("\nFOO=bar\n\nBAZ=qux\n")
    expect(result).toEqual({ FOO: "bar", BAZ: "qux" })
  })

  it("handles values containing =", () => {
    const result = parseDotEnv("URL=postgresql://user:pass@host:5432/db?opt=val")
    expect(result).toEqual({ URL: "postgresql://user:pass@host:5432/db?opt=val" })
  })

  it("handles empty values", () => {
    const result = parseDotEnv("FOO=")
    expect(result).toEqual({ FOO: "" })
  })

  it("ignores lines without =", () => {
    const result = parseDotEnv("INVALID_LINE\nFOO=bar")
    expect(result).toEqual({ FOO: "bar" })
  })

  it("handles a realistic .env file", () => {
    const content = [
      "# Moneta client config",
      "MONETA_PROJECT_ID=acme-platform",
      'MONETA_API_URL="http://localhost:3000/api/v1"',
      "export MONETA_API_KEY=secret-key",
      "",
      "# Agent identity",
      "MONETA_AGENT_ID='alice/reviewer'",
    ].join("\n")

    const result = parseDotEnv(content)
    expect(result).toEqual({
      MONETA_PROJECT_ID: "acme-platform",
      MONETA_API_URL: "http://localhost:3000/api/v1",
      MONETA_API_KEY: "secret-key",
      MONETA_AGENT_ID: "alice/reviewer",
    })
  })
})

// ---------------------------------------------------------------------------
// loadConfig — .env file support
// ---------------------------------------------------------------------------

describe("loadConfig with .env file", () => {
  let originalCwd: string
  let tmpDir: string
  const originalEnv = { ...process.env }

  beforeEach(() => {
    originalCwd = process.cwd()
    tmpDir = mkdtempSync(join(tmpdir(), "moneta-test-"))
    process.chdir(tmpDir)
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("MONETA_") || key === "OPENAI_API_KEY") {
        delete process.env[key]
      }
    }
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tmpDir, { recursive: true, force: true })
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

  it("loads MONETA_ vars from .env in CWD", () => {
    writeFileSync(
      join(tmpDir, ".env"),
      "MONETA_PROJECT_ID=from-dotenv\nMONETA_API_URL=http://dotenv-api/v1",
    )
    const config = loadConfig()
    expect(config.projectId).toBe("from-dotenv")
    expect(config.apiUrl).toBe("http://dotenv-api/v1")
  })

  it("does not override existing env vars with .env values", () => {
    writeFileSync(join(tmpDir, ".env"), "MONETA_PROJECT_ID=from-dotenv")
    process.env.MONETA_PROJECT_ID = "from-real-env"
    const config = loadConfig()
    expect(config.projectId).toBe("from-real-env")
  })

  it("handles quoted values in .env", () => {
    writeFileSync(join(tmpDir, ".env"), 'MONETA_PROJECT_ID="my-quoted-project"')
    const config = loadConfig()
    expect(config.projectId).toBe("my-quoted-project")
  })

  it("returns defaults when no .env file exists", () => {
    const config = loadConfig()
    expect(config.projectId).toBe("")
    expect(config.searchLimit).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// loadConfig — project-level config file
// ---------------------------------------------------------------------------

describe("loadConfig with project config", () => {
  let originalCwd: string
  let tmpDir: string
  const originalEnv = { ...process.env }

  beforeEach(() => {
    originalCwd = process.cwd()
    tmpDir = mkdtempSync(join(tmpdir(), "moneta-test-"))
    process.chdir(tmpDir)
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("MONETA_") || key === "OPENAI_API_KEY") {
        delete process.env[key]
      }
    }
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tmpDir, { recursive: true, force: true })
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

  it("reads .moneta/config.json from CWD", () => {
    mkdirSync(join(tmpDir, ".moneta"), { recursive: true })
    writeFileSync(
      join(tmpDir, ".moneta", "config.json"),
      JSON.stringify({ project_id: "from-project-config", api_url: "http://project-api/v1" }),
    )
    const config = loadConfig()
    expect(config.projectId).toBe("from-project-config")
    expect(config.apiUrl).toBe("http://project-api/v1")
  })

  it("walks up to find .moneta/config.json in parent directory", () => {
    mkdirSync(join(tmpDir, ".moneta"), { recursive: true })
    writeFileSync(
      join(tmpDir, ".moneta", "config.json"),
      JSON.stringify({ project_id: "from-parent" }),
    )
    const childDir = join(tmpDir, "subdir")
    mkdirSync(childDir)
    process.chdir(childDir)

    const config = loadConfig()
    expect(config.projectId).toBe("from-parent")
  })

  it("uses nearest .moneta/config.json when multiple exist", () => {
    // Parent config
    mkdirSync(join(tmpDir, ".moneta"), { recursive: true })
    writeFileSync(
      join(tmpDir, ".moneta", "config.json"),
      JSON.stringify({ project_id: "from-parent", search_limit: 99 }),
    )
    // Child config (closer)
    const childDir = join(tmpDir, "subdir")
    mkdirSync(join(childDir, ".moneta"), { recursive: true })
    writeFileSync(
      join(childDir, ".moneta", "config.json"),
      JSON.stringify({ project_id: "from-child" }),
    )
    process.chdir(childDir)

    const config = loadConfig()
    expect(config.projectId).toBe("from-child")
    // search_limit from parent is NOT used — only the nearest config is loaded
    expect(config.searchLimit).toBe(10) // default
  })

  it("project config overrides built-in defaults", () => {
    mkdirSync(join(tmpDir, ".moneta"), { recursive: true })
    writeFileSync(join(tmpDir, ".moneta", "config.json"), JSON.stringify({ search_limit: 42 }))
    const config = loadConfig()
    expect(config.searchLimit).toBe(42)
  })
})

// ---------------------------------------------------------------------------
// loadConfig — full precedence chain
// ---------------------------------------------------------------------------

describe("loadConfig precedence", () => {
  let originalCwd: string
  let tmpDir: string
  const originalEnv = { ...process.env }

  beforeEach(() => {
    originalCwd = process.cwd()
    tmpDir = mkdtempSync(join(tmpdir(), "moneta-test-"))
    process.chdir(tmpDir)
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("MONETA_") || key === "OPENAI_API_KEY") {
        delete process.env[key]
      }
    }
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tmpDir, { recursive: true, force: true })
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

  it(".env values take precedence over project config", () => {
    mkdirSync(join(tmpDir, ".moneta"), { recursive: true })
    writeFileSync(
      join(tmpDir, ".moneta", "config.json"),
      JSON.stringify({ project_id: "from-project-config" }),
    )
    writeFileSync(join(tmpDir, ".env"), "MONETA_PROJECT_ID=from-dotenv")

    const config = loadConfig()
    expect(config.projectId).toBe("from-dotenv")
  })

  it("real env vars take precedence over .env values", () => {
    writeFileSync(join(tmpDir, ".env"), "MONETA_PROJECT_ID=from-dotenv")
    process.env.MONETA_PROJECT_ID = "from-real-env"

    const config = loadConfig()
    expect(config.projectId).toBe("from-real-env")
  })

  it("overrides take precedence over everything", () => {
    mkdirSync(join(tmpDir, ".moneta"), { recursive: true })
    writeFileSync(
      join(tmpDir, ".moneta", "config.json"),
      JSON.stringify({ project_id: "from-project-config" }),
    )
    writeFileSync(join(tmpDir, ".env"), "MONETA_PROJECT_ID=from-dotenv")
    process.env.MONETA_PROJECT_ID = "from-real-env"

    const config = loadConfig({ projectId: "from-override" })
    expect(config.projectId).toBe("from-override")
  })

  it("falls through the full chain: override > env > .env > project config > default", () => {
    // Set up all sources for different fields to verify each priority level
    mkdirSync(join(tmpDir, ".moneta"), { recursive: true })
    writeFileSync(
      join(tmpDir, ".moneta", "config.json"),
      JSON.stringify({
        project_id: "cfg-project",
        api_url: "http://cfg-api/v1",
        search_limit: 42,
        dedup_threshold: 0.88,
      }),
    )
    writeFileSync(
      join(tmpDir, ".env"),
      "MONETA_PROJECT_ID=dotenv-project\nMONETA_API_URL=http://dotenv-api/v1",
    )
    process.env.MONETA_PROJECT_ID = "env-project"

    const config = loadConfig({ projectId: "override-project" })

    // override wins for projectId
    expect(config.projectId).toBe("override-project")
    // .env wins over project config for apiUrl (no real env var set)
    expect(config.apiUrl).toBe("http://dotenv-api/v1")
    // project config wins over default for searchLimit (no env or .env)
    expect(config.searchLimit).toBe(42)
    // project config wins over default for dedupThreshold
    expect(config.dedupThreshold).toBe(0.88)
    // built-in default for fields not set anywhere
    expect(config.embeddingModel).toBe("text-embedding-3-small")
  })
})
