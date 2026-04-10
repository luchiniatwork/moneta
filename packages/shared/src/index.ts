// Types
export type {
  AgentIdentity,
  Config,
  CorrectResult,
  Database,
  DedupMatch,
  Importance,
  MemoryRow,
  MemoryUpdate,
  NewMemory,
  ProjectMemoryTable,
  RecallResult,
  RememberResult,
  SearchScope,
} from "./types.ts"

// Config
export { loadConfig, validateConfig } from "./config.ts"

// Identity
export { parseAgentId } from "./identity.ts"

// Embeddings
export { embed, resetClient } from "./embeddings.ts"

// Database
export {
  createDb,
  insertMemory,
  getMemoryById,
  updateMemory,
  deleteMemory,
  callRecall,
  callTouchMemories,
  callDedupCheck,
  callArchiveStale,
} from "./db.ts"
