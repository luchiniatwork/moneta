import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Config } from "./types.ts"

/** Shape of ~/.moneta/config.json on disk. */
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
}

const DEFAULTS = {
  embeddingModel: "text-embedding-3-small",
  archiveAfterDays: 30,
  dedupThreshold: 0.95,
  searchThreshold: 0.3,
  searchLimit: 10,
  maxContentLength: 2000,
} as const

/**
 * Load a config file from disk. Returns an empty object if the file
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
 * Load configuration from environment variables, falling back to
 * `~/.moneta/config.json`, then to built-in defaults.
 *
 * Precedence: env vars > config file > defaults
 *
 * @param overrides - Optional overrides (useful for testing)
 * @throws Error if required fields (projectId, databaseUrl, openaiApiKey) are missing
 */
export function loadConfig(overrides?: Partial<Config>): Config {
  const configPath = join(homedir(), ".moneta", "config.json")
  const file = loadConfigFile(configPath)

  const env = process.env

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
  }

  return config
}

/**
 * Validate that all required config fields are present.
 * Returns an array of error messages (empty = valid).
 */
export function validateConfig(config: Config, opts: { requireAgentId?: boolean } = {}): string[] {
  const errors: string[] = []

  if (!config.projectId) {
    errors.push(
      "Missing required config: projectId (set MONETA_PROJECT_ID or project_id in config file)",
    )
  }
  if (!config.databaseUrl) {
    errors.push(
      "Missing required config: databaseUrl (set MONETA_DATABASE_URL or database_url in config file)",
    )
  }
  if (!config.openaiApiKey) {
    errors.push(
      "Missing required config: openaiApiKey (set OPENAI_API_KEY or openai_api_key in config file)",
    )
  }
  if (opts.requireAgentId && !config.agentId) {
    errors.push("Missing required config: agentId (set MONETA_AGENT_ID or agent_id in config file)")
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
