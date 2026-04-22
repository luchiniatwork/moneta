import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { Config } from "./types.ts"

/** Shape of a Moneta JSON config file on disk (project-level or global). */
interface ConfigFile {
  project_id?: string
  database_url?: string
  openai_api_key?: string
  agent_id?: string
  embedding_model?: string
  archive_after_days?: number
  dedup_threshold?: number
  search_threshold?: number
  search_limit?: number
  max_content_length?: number
  api_url?: string
  api_key?: string
}

const DEFAULTS = {
  embeddingModel: "text-embedding-3-small",
  archiveAfterDays: 30,
  dedupThreshold: 0.95,
  searchThreshold: 0.3,
  searchLimit: 10,
  maxContentLength: 2000,
} as const

// ---------------------------------------------------------------------------
// .env file parser
// ---------------------------------------------------------------------------

/**
 * Parse the contents of a `.env` file into a key-value map.
 *
 * Handles `KEY=VALUE` lines, quoted values (single and double quotes are
 * stripped), `export KEY=VALUE` prefix, `#` comments, and empty lines.
 *
 * @param content - Raw `.env` file content
 * @returns Parsed key-value pairs
 */
export function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {}

  for (const line of content.split("\n")) {
    const trimmed = line.trim()

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue

    // Strip optional "export " prefix
    const stripped = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed

    // Find the first "=" to split key from value
    const eqIndex = stripped.indexOf("=")
    if (eqIndex === -1) continue

    const key = stripped.slice(0, eqIndex).trim()
    let value = stripped.slice(eqIndex + 1).trim()

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (key) {
      result[key] = value
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// File loaders
// ---------------------------------------------------------------------------

/**
 * Load a JSON config file from disk. Returns an empty object if the file
 * does not exist or is not valid JSON.
 */
function loadConfigFile(path: string): ConfigFile {
  try {
    const raw = readFileSync(path, "utf-8")
    return JSON.parse(raw) as ConfigFile
  } catch {
    return {}
  }
}

/**
 * Read and parse a `.env` file from the given directory.
 * Returns the parsed key-value pairs, or an empty object if the file
 * does not exist or is not readable.
 *
 * @param dir - Directory to look for `.env` in
 * @returns Parsed key-value pairs
 */
function readDotEnvFile(dir: string): Record<string, string> {
  try {
    const content = readFileSync(join(dir, ".env"), "utf-8")
    return parseDotEnv(content)
  } catch {
    return {}
  }
}

/**
 * Walk up from `startDir` looking for `.moneta/config.json`.
 * Returns the parsed config from the first match, or an empty object.
 *
 * @param startDir - Directory to start searching from
 * @returns Parsed project config or empty object
 */
function findProjectConfigFile(startDir: string): ConfigFile {
  let dir = startDir
  while (true) {
    const configPath = join(dir, ".moneta", "config.json")
    const config = loadConfigFile(configPath)
    if (Object.keys(config).length > 0) {
      return config
    }
    const parent = dirname(dir)
    if (parent === dir) break // reached filesystem root
    dir = parent
  }
  return {}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load configuration by merging sources (highest to lowest priority):
 *
 * 1. `overrides` parameter (CLI flags, test values)
 * 2. Environment variables — real env vars take precedence, then values
 *    from a `.env` file in the current working directory
 * 3. Project config — `.moneta/config.json` found by walking up from the
 *    current working directory
 * 4. Global config — `~/.moneta/config.json`
 * 5. Built-in defaults
 *
 * The `.env` file is **not** injected into `process.env`; its values are
 * only used for config resolution within this function.
 *
 * @param overrides - Optional overrides (useful for testing or CLI flags)
 */
export function loadConfig(overrides?: Partial<Config>): Config {
  const cwd = process.cwd()

  // .env from CWD (values only — does not modify process.env)
  const dotEnv = readDotEnvFile(cwd)

  // Project-level config (.moneta/config.json, walking up from CWD)
  const projectFile = findProjectConfigFile(cwd)

  // Global config (~/.moneta/config.json)
  const globalPath = join(homedir(), ".moneta", "config.json")
  const globalFile = loadConfigFile(globalPath)

  // Merge JSON configs: project takes precedence over global
  const file: ConfigFile = { ...globalFile, ...projectFile }

  // Merge env sources: real env vars win over .env values
  const env: Record<string, string | undefined> = { ...dotEnv, ...process.env }

  const config: Config = {
    projectId: overrides?.projectId ?? env.MONETA_PROJECT_ID ?? file.project_id ?? "",
    databaseUrl: overrides?.databaseUrl ?? env.MONETA_DATABASE_URL ?? file.database_url ?? "",
    openaiApiKey: overrides?.openaiApiKey ?? env.OPENAI_API_KEY ?? file.openai_api_key ?? "",
    agentId: overrides?.agentId ?? env.MONETA_AGENT_ID ?? file.agent_id ?? undefined,
    embeddingModel:
      overrides?.embeddingModel ??
      env.MONETA_EMBEDDING_MODEL ??
      file.embedding_model ??
      DEFAULTS.embeddingModel,
    archiveAfterDays:
      overrides?.archiveAfterDays ??
      toInt(env.MONETA_ARCHIVE_AFTER_DAYS) ??
      file.archive_after_days ??
      DEFAULTS.archiveAfterDays,
    dedupThreshold:
      overrides?.dedupThreshold ??
      toFloat(env.MONETA_DEDUP_THRESHOLD) ??
      file.dedup_threshold ??
      DEFAULTS.dedupThreshold,
    searchThreshold:
      overrides?.searchThreshold ??
      toFloat(env.MONETA_SEARCH_THRESHOLD) ??
      file.search_threshold ??
      DEFAULTS.searchThreshold,
    searchLimit:
      overrides?.searchLimit ??
      toInt(env.MONETA_SEARCH_LIMIT) ??
      file.search_limit ??
      DEFAULTS.searchLimit,
    maxContentLength:
      overrides?.maxContentLength ??
      toInt(env.MONETA_MAX_CONTENT_LENGTH) ??
      file.max_content_length ??
      DEFAULTS.maxContentLength,
    apiUrl: overrides?.apiUrl ?? env.MONETA_API_URL ?? file.api_url ?? undefined,
    apiKey: overrides?.apiKey ?? env.MONETA_API_KEY ?? file.api_key ?? undefined,
  }

  return config
}

/**
 * Validation options controlling which fields are required.
 *
 * - `requireProjectId` — requires MONETA_PROJECT_ID (clients need it; the API
 *   server does not since clients send it per-request via the X-Project-Id header).
 *   Defaults to `true` for backwards compatibility.
 * - `requireAgentId` — requires MONETA_AGENT_ID (MCP server)
 * - `requireDatabase` — requires databaseUrl + openaiApiKey (api-server).
 *   When `false`, databaseUrl and openaiApiKey are not validated, allowing
 *   clients (CLI, MCP server) that talk to the REST API to skip them.
 * - `requireApiUrl` — requires apiUrl (clients that talk to the REST API)
 */
export interface ValidateConfigOpts {
  requireProjectId?: boolean
  requireAgentId?: boolean
  requireDatabase?: boolean
  requireApiUrl?: boolean
}

/**
 * Validate that all required config fields are present.
 * Returns an array of error messages (empty = valid).
 *
 * By default, `requireDatabase` is `true` for backwards compatibility.
 */
export function validateConfig(config: Config, opts: ValidateConfigOpts = {}): string[] {
  const errors: string[] = []
  const requireProjectId = opts.requireProjectId ?? true
  const requireDatabase = opts.requireDatabase ?? true

  if (requireProjectId && !config.projectId) {
    errors.push(
      "Missing required config: projectId (set MONETA_PROJECT_ID or project_id in config file)",
    )
  }
  if (requireDatabase && !config.databaseUrl) {
    errors.push(
      "Missing required config: databaseUrl (set MONETA_DATABASE_URL or database_url in config file)",
    )
  }
  if (requireDatabase && !config.openaiApiKey) {
    errors.push(
      "Missing required config: openaiApiKey (set OPENAI_API_KEY or openai_api_key in config file)",
    )
  }
  if (opts.requireAgentId && !config.agentId) {
    errors.push("Missing required config: agentId (set MONETA_AGENT_ID or agent_id in config file)")
  }
  if (opts.requireApiUrl && !config.apiUrl) {
    errors.push("Missing required config: apiUrl (set MONETA_API_URL or api_url in config file)")
  }

  return errors
}

function toInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = parseInt(value, 10)
  return Number.isNaN(n) ? undefined : n
}

function toFloat(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = parseFloat(value)
  return Number.isNaN(n) ? undefined : n
}
