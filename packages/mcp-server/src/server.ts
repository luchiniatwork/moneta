import { McpServer } from "@modelcontextprotocol/sdk/server/mcp"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types"
import type { MonetaClient } from "@moneta/api-client"
import type { AgentIdentity, Config } from "@moneta/shared"
import { z } from "zod"
import type { CorrectParams } from "./tools/correct.ts"
import { handleCorrect } from "./tools/correct.ts"
import type { ForgetParams } from "./tools/forget.ts"
import { handleForget } from "./tools/forget.ts"
import type { PinParams } from "./tools/pin.ts"
import { handlePin } from "./tools/pin.ts"
import type { RecallParams } from "./tools/recall.ts"
import { handleRecall } from "./tools/recall.ts"
import type { RememberParams } from "./tools/remember.ts"
import { handleRemember } from "./tools/remember.ts"
import type { UnpinParams } from "./tools/unpin.ts"
import { handleUnpin } from "./tools/unpin.ts"

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

/** Dependencies required to create the Moneta MCP server. */
export interface ServerDeps {
  config: Config
  client: MonetaClient
  identity: AgentIdentity
}

/**
 * Create a configured MCP server with all memory tools registered.
 *
 * The returned server is not yet connected to a transport — the caller is
 * responsible for creating a transport and calling `server.connect(transport)`.
 *
 * @param deps - Config, API client, and agent identity
 * @returns A configured McpServer instance
 */
export function createMonetaServer(deps: ServerDeps): McpServer {
  const { config, identity } = deps

  const server = new McpServer(
    { name: "moneta", version: "0.0.8" },
    {
      instructions: [
        "Moneta is a shared memory system for AI coding agents.",
        `You are operating as agent "${identity.createdBy}" on project "${config.projectId}".`,
        "Use `remember` to store short, factual memories that other agents may find useful.",
        "Use `recall` to search all active memories in this project by default.",
        "Only pass recall `scope` fields when you want to narrow results.",
        "Use `pin` to mark important memories as never-archive.",
        "Use `unpin` to allow a pinned memory to be archived again.",
        "Use `correct` to update a memory when you discover it is stale or wrong.",
        "Use `forget` to permanently delete a memory that is incorrect or no longer relevant.",
        "Memories are short facts (under 2000 chars), not conversations or documents.",
      ].join(" "),
    },
  )

  registerRememberTool(server, deps)
  registerRecallTool(server, deps)
  registerPinTool(server, deps)
  registerUnpinTool(server, deps)
  registerForgetTool(server, deps)
  registerCorrectTool(server, deps)

  return server
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] }
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true }
}

// ---------------------------------------------------------------------------
// Structured logging
// ---------------------------------------------------------------------------

interface LogEntry {
  timestamp: string
  tool: string
  agent_id: string
  project_id: string
  duration_ms: number
  success: boolean
  error?: string
}

/**
 * Write a structured JSON log entry to stderr.
 *
 * MCP servers must not write to stdout (reserved for protocol messages),
 * so all observability output goes to stderr.
 */
function logToolInvocation(entry: LogEntry): void {
  console.error(JSON.stringify(entry))
}

// ---------------------------------------------------------------------------
// Tool registration
//
// NOTE: We cast `server.tool` to bypass TS2589 (excessively deep type
// instantiation). The MCP SDK's `.tool()` generics recurse beyond the
// TypeScript compiler limit when combined with zod v3 schemas. The runtime
// behavior is correct — the SDK validates inputs via zod at runtime.
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: cast to avoid TS2589 deep generic recursion
type ToolRegisterFn = (...args: any[]) => unknown

function registerRememberTool(server: McpServer, deps: ServerDeps): void {
  const { config, client, identity } = deps

  const schema = {
    content: z
      .string()
      .min(1)
      .max(config.maxContentLength)
      .describe("The fact to remember. Should be a clear, self-contained statement."),
    tags: z.array(z.string()).optional().describe("Free-form tags for organization."),
    repo: z.string().optional().describe("Repository this memory relates to."),
    importance: z
      .enum(["normal", "high", "critical"])
      .optional()
      .describe('Importance level. "critical" memories are auto-pinned and never archived.'),
  }

  ;(server.tool as unknown as ToolRegisterFn)(
    "remember",
    "Store a new memory in the project. The content should be a clear, " +
      "self-contained factual statement. Near-duplicate memories from the " +
      "same agent are updated in place.",
    schema,
    async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
      const start = Date.now()
      try {
        const args = rawArgs as unknown as RememberParams
        const result = await handleRemember({ client }, args)
        const summary = result.deduplicated
          ? `Updated existing memory ${result.id} (near-duplicate detected).`
          : `Stored new memory ${result.id}.`

        logToolInvocation({
          timestamp: new Date().toISOString(),
          tool: "remember",
          agent_id: identity.createdBy,
          project_id: config.projectId,
          duration_ms: Date.now() - start,
          success: true,
        })

        return textResult(JSON.stringify({ ...result, summary }, null, 2))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logToolInvocation({
          timestamp: new Date().toISOString(),
          tool: "remember",
          agent_id: identity.createdBy,
          project_id: config.projectId,
          duration_ms: Date.now() - start,
          success: false,
          error: message,
        })
        return errorResult(`Failed to store memory: ${message}`)
      }
    },
  )
}

function registerRecallTool(server: McpServer, deps: ServerDeps): void {
  const { config, client, identity } = deps

  const schema = {
    question: z.string().min(1).describe("Natural language question or topic to search for."),
    scope: z
      .object({
        agent: z
          .string()
          .optional()
          .describe("Only this exact agent's memories. Omit to search all agents."),
        engineer: z
          .string()
          .optional()
          .describe("Only this engineer's agents. Omit to search all engineers."),
        repo: z.string().optional().describe("Only this repository. Omit to search all repos."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Must have all of these tags. Omit to search all tags."),
      })
      .optional()
      .describe("Optional filters to narrow search results. Omit scope to search all memories."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe(`Max results (default ${config.searchLimit}).`),
    threshold: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe(
        `Minimum similarity threshold (default ${config.searchThreshold}). ` +
          "Lower values return more results.",
      ),
    include_archived: z
      .boolean()
      .optional()
      .describe(
        "Search archived memories too. Found archived memories are promoted back to active.",
      ),
  }

  ;(server.tool as unknown as ToolRegisterFn)(
    "recall",
    "Search all active project memories by asking a natural language question. " +
      "Optional scope fields narrow results by agent, engineer, repo, or tags.",
    schema,
    async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
      const start = Date.now()
      try {
        const args = rawArgs as unknown as RecallParams
        const results = await handleRecall({ client, config }, args)

        logToolInvocation({
          timestamp: new Date().toISOString(),
          tool: "recall",
          agent_id: identity.createdBy,
          project_id: config.projectId,
          duration_ms: Date.now() - start,
          success: true,
        })

        if (results.length === 0) {
          return textResult("No memories found matching your question.")
        }

        return textResult(JSON.stringify(results, null, 2))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logToolInvocation({
          timestamp: new Date().toISOString(),
          tool: "recall",
          agent_id: identity.createdBy,
          project_id: config.projectId,
          duration_ms: Date.now() - start,
          success: false,
          error: message,
        })
        return errorResult(`Failed to search memories: ${message}`)
      }
    },
  )
}

function registerPinTool(server: McpServer, deps: ServerDeps): void {
  const { client, identity, config } = deps

  const schema = {
    memory_id: z.string().uuid().describe("UUID of the memory to pin."),
  }

  ;(server.tool as unknown as ToolRegisterFn)(
    "pin",
    "Mark a memory as never-archive. Pinned memories are protected " +
      "from the automatic archival reaper.",
    schema,
    async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
      const start = Date.now()
      try {
        const args = rawArgs as unknown as PinParams
        const result = await handlePin({ client }, args)

        logToolInvocation({
          timestamp: new Date().toISOString(),
          tool: "pin",
          agent_id: identity.createdBy,
          project_id: config.projectId,
          duration_ms: Date.now() - start,
          success: true,
        })

        return textResult(`Pinned memory ${result.id}. This memory will not be archived.`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logToolInvocation({
          timestamp: new Date().toISOString(),
          tool: "pin",
          agent_id: identity.createdBy,
          project_id: config.projectId,
          duration_ms: Date.now() - start,
          success: false,
          error: message,
        })
        return errorResult(`Failed to pin memory: ${message}`)
      }
    },
  )
}

function registerUnpinTool(server: McpServer, deps: ServerDeps): void {
  const { client, identity, config } = deps

  const schema = {
    memory_id: z.string().uuid().describe("UUID of the memory to unpin."),
  }

  ;(server.tool as unknown as ToolRegisterFn)(
    "unpin",
    "Remove the never-archive mark from a memory. The memory becomes " +
      "eligible for automatic archival but is not immediately archived.",
    schema,
    async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
      const start = Date.now()
      try {
        const args = rawArgs as unknown as UnpinParams
        const result = await handleUnpin({ client }, args)

        logToolInvocation({
          timestamp: new Date().toISOString(),
          tool: "unpin",
          agent_id: identity.createdBy,
          project_id: config.projectId,
          duration_ms: Date.now() - start,
          success: true,
        })

        return textResult(`Unpinned memory ${result.id}. This memory is now eligible for archival.`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logToolInvocation({
          timestamp: new Date().toISOString(),
          tool: "unpin",
          agent_id: identity.createdBy,
          project_id: config.projectId,
          duration_ms: Date.now() - start,
          success: false,
          error: message,
        })
        return errorResult(`Failed to unpin memory: ${message}`)
      }
    },
  )
}

function registerForgetTool(server: McpServer, deps: ServerDeps): void {
  const { client, identity, config } = deps

  const schema = {
    memory_id: z.string().uuid().describe("UUID of the memory to permanently delete."),
  }

  ;(server.tool as unknown as ToolRegisterFn)(
    "forget",
    "Permanently delete a memory. This cannot be undone. " +
      "Use this when a memory is incorrect or no longer relevant.",
    schema,
    async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
      const start = Date.now()
      try {
        const args = rawArgs as unknown as ForgetParams
        const result = await handleForget({ client }, args)

        logToolInvocation({
          timestamp: new Date().toISOString(),
          tool: "forget",
          agent_id: identity.createdBy,
          project_id: config.projectId,
          duration_ms: Date.now() - start,
          success: true,
        })

        return textResult(`Permanently deleted memory ${result.id}.`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logToolInvocation({
          timestamp: new Date().toISOString(),
          tool: "forget",
          agent_id: identity.createdBy,
          project_id: config.projectId,
          duration_ms: Date.now() - start,
          success: false,
          error: message,
        })
        return errorResult(`Failed to delete memory: ${message}`)
      }
    },
  )
}

function registerCorrectTool(server: McpServer, deps: ServerDeps): void {
  const { config, client, identity } = deps

  const schema = {
    memory_id: z.string().uuid().describe("UUID of the memory to correct."),
    new_content: z
      .string()
      .min(1)
      .max(config.maxContentLength)
      .describe("The corrected fact. Replaces the existing content entirely."),
  }

  ;(server.tool as unknown as ToolRegisterFn)(
    "correct",
    "Update a memory's content when you discover it is stale or wrong. " +
      "A new embedding is generated for the corrected content. " +
      "The original author attribution is preserved.",
    schema,
    async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
      const start = Date.now()
      try {
        const args = rawArgs as unknown as CorrectParams
        const result = await handleCorrect({ client }, args)

        logToolInvocation({
          timestamp: new Date().toISOString(),
          tool: "correct",
          agent_id: identity.createdBy,
          project_id: config.projectId,
          duration_ms: Date.now() - start,
          success: true,
        })

        return textResult(JSON.stringify(result, null, 2))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logToolInvocation({
          timestamp: new Date().toISOString(),
          tool: "correct",
          agent_id: identity.createdBy,
          project_id: config.projectId,
          duration_ms: Date.now() - start,
          success: false,
          error: message,
        })
        return errorResult(`Failed to correct memory: ${message}`)
      }
    },
  )
}
