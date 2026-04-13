// Types

// Config
export { loadConfig, validateConfig } from "./config.ts"
// Database
export {
  callArchiveStale,
  callDedupCheck,
  callRecall,
  callTouchMemories,
  createDb,
  deleteMemory,
  getMemoryById,
  insertMemory,
  updateMemory,
} from "./db.ts"
// Embeddings
export { embed, resetClient } from "./embeddings.ts"
// Identity
export { parseAgentId } from "./identity.ts"
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
