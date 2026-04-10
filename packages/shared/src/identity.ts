import type { AgentIdentity } from "./types.ts"

/**
 * Parse an agent identity string into its components.
 *
 * Format: `{engineer}/{agent-type}` for human-directed agents,
 *         `auto/{agent-type}` for autonomous agents.
 *
 * Examples:
 *   "alice/code-reviewer" → { createdBy: "alice/code-reviewer", engineer: "alice", agentType: "code-reviewer" }
 *   "auto/ci-fixer"       → { createdBy: "auto/ci-fixer", engineer: null, agentType: "ci-fixer" }
 *
 * @throws Error if the format is invalid
 */
export function parseAgentId(agentId: string): AgentIdentity {
  const trimmed = agentId.trim()

  if (trimmed.length === 0) {
    throw new Error("Agent ID must not be empty")
  }

  const slashIndex = trimmed.indexOf("/")

  if (slashIndex === -1) {
    throw new Error(
      `Invalid agent ID "${trimmed}": must contain a "/" separator (e.g. "alice/code-reviewer" or "auto/ci-fixer")`
    )
  }

  const prefix = trimmed.slice(0, slashIndex)
  const suffix = trimmed.slice(slashIndex + 1)

  if (prefix.length === 0) {
    throw new Error(
      `Invalid agent ID "${trimmed}": engineer/prefix before "/" must not be empty`
    )
  }

  if (suffix.length === 0) {
    throw new Error(
      `Invalid agent ID "${trimmed}": agent-type after "/" must not be empty`
    )
  }

  if (suffix.includes("/")) {
    throw new Error(
      `Invalid agent ID "${trimmed}": must contain exactly one "/" separator`
    )
  }

  return {
    createdBy: trimmed,
    engineer: prefix === "auto" ? null : prefix,
    agentType: suffix,
  }
}
