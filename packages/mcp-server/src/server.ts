import { McpServer } from "@modelcontextprotocol/sdk/server/mcp"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types"
import type { AgentIdentity, Config, MonetaDb } from "@moneta/shared"
import { z } from "zod"
import type { RecallParams } from "./tools/recall.ts"
import { handleRecall } from "./tools/recall.ts"
import type { RememberParams } from "./tools/remember.ts"
import { handleRemember } from "./tools/remember.ts"

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

/** Dependencies required to create the Moneta MCP server. */
export interface ServerDeps {
  config: Config
  db: MonetaDb
  identity: AgentIdentity
}

/**
 * Create a configured MCP server with the remember and recall tools registered.
 *
 * The returned server is not yet connected to a transport — the caller is
 * responsible for creating a transport and calling `server.connect(transport)`.
 *
 * @param deps - Config, database, and agent identity
 * @returns A configured McpServer instance
 */
export function createMonetaServer(deps: ServerDeps): McpServer {
  const { config, identity } = deps

  const server = new McpServer(
    { name: "moneta", version: "0.0.1" },
    {
      instructions: [
        "Moneta is a shared memory system for AI coding agents.",
        `You are operating as agent "${identity.createdBy}" on project "${config.projectId}".`,
        "Use `remember` to store short, factual memories that other agents may find useful.",
        "Use `recall` to search existing memories by asking a natural language question.",
        "Memories are short facts (under 2000 chars), not conversations or documents.",
      ].join(" "),
    },
  )

  registerRememberTool(server, deps)
  registerRecallTool(server, deps)

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
  const { config, db, identity } = deps

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
      try {
        const args = rawArgs as unknown as RememberParams
        const result = await handleRemember({ config, db, identity }, args)
        const summary = result.deduplicated
          ? `Updated existing memory ${result.id} (near-duplicate detected).`
          : `Stored new memory ${result.id}.`

        return textResult(JSON.stringify({ ...result, summary }, null, 2))
      } catch (error) {
        return errorResult(
          `Failed to store memory: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    },
  )
}

function registerRecallTool(server: McpServer, deps: ServerDeps): void {
  const { config, db } = deps

  const schema = {
    question: z.string().min(1).describe("Natural language question or topic to search for."),
    scope: z
      .object({
        agent: z.string().optional().describe("Only this agent's memories."),
        engineer: z.string().optional().describe("Only this engineer's agents."),
        repo: z.string().optional().describe("Only this repository."),
        tags: z.array(z.string()).optional().describe("Must have all of these tags."),
      })
      .optional()
      .describe("Optional filters to narrow search results."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe(`Max results (default ${config.searchLimit}).`),
    include_archived: z
      .boolean()
      .optional()
      .describe(
        "Search archived memories too. Found archived memories are promoted back to active.",
      ),
  }

  ;(server.tool as unknown as ToolRegisterFn)(
    "recall",
    "Search memories by asking a natural language question. " +
      "Returns relevant memories ranked by semantic similarity.",
    schema,
    async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const args = rawArgs as unknown as RecallParams
        const results = await handleRecall({ config, db }, args)

        if (results.length === 0) {
          return textResult("No memories found matching your question.")
        }

        return textResult(JSON.stringify(results, null, 2))
      } catch (error) {
        return errorResult(
          `Failed to search memories: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    },
  )
}
