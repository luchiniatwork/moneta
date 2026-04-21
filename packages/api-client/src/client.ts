import { ApiError } from "./errors.ts"
import type {
  ClientOptions,
  CorrectResult,
  HealthStatus,
  ImportEntry,
  ImportResult,
  ListParams,
  Memory,
  MemoryCounts,
  MemoryStats,
  MonetaClient,
  RecallParams,
  RecallResult,
  RememberParams,
  RememberResult,
} from "./types.ts"

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

/**
 * Create a Moneta API client.
 *
 * The client communicates with the Moneta REST API server over HTTP
 * using `fetch`. It requires no external dependencies.
 *
 * @param options - Connection options (baseUrl, optional apiKey, optional agentId)
 * @returns A configured MonetaClient instance
 */
export function createClient(options: ClientOptions): MonetaClient {
  const { baseUrl, projectId, apiKey, agentId } = options

  // Strip trailing slash from base URL
  const base = baseUrl.replace(/\/+$/, "")

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  function headers(opts?: { withAgent?: boolean }): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Project-Id": projectId,
    }
    if (apiKey) {
      h.Authorization = `Bearer ${apiKey}`
    }
    if (opts?.withAgent && agentId) {
      h["X-Agent-Id"] = agentId
    }
    return h
  }

  async function handleError(res: Response): Promise<never> {
    let code = "UNKNOWN_ERROR"
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } }
      if (body.error) {
        code = body.error.code ?? code
        message = body.error.message ?? message
      }
    } catch {
      // Response body not JSON — use defaults
    }
    throw new ApiError(res.status, code, message)
  }

  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${base}${path}`, { headers: headers() })
    if (!res.ok) return handleError(res)
    return (await res.json()) as T
  }

  async function post<T>(path: string, body: unknown, opts?: { withAgent?: boolean }): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: headers(opts),
      body: JSON.stringify(body),
    })
    if (!res.ok) return handleError(res)
    return (await res.json()) as T
  }

  async function del(path: string): Promise<boolean> {
    const res = await fetch(`${base}${path}`, { method: "DELETE", headers: headers() })
    if (res.status === 204) return true
    if (!res.ok) return handleError(res)
    return true
  }

  // ---------------------------------------------------------------------------
  // Query string builder
  // ---------------------------------------------------------------------------

  function toQueryString(params: Record<string, unknown>): string {
    const parts: string[] = []
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue
      if (Array.isArray(value)) {
        if (value.length > 0) {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value.join(","))}`)
        }
      } else {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      }
    }
    return parts.length > 0 ? `?${parts.join("&")}` : ""
  }

  // ---------------------------------------------------------------------------
  // Client methods
  // ---------------------------------------------------------------------------

  return {
    // High-level operations

    async remember(params: RememberParams): Promise<RememberResult> {
      return post<RememberResult>("/memories/remember", params, { withAgent: true })
    },

    async recall(params: RecallParams): Promise<RecallResult[]> {
      const res = await post<{ memories: RecallResult[] }>("/memories/recall", params)
      return res.memories
    },

    async correct(id: string, newContent: string): Promise<CorrectResult> {
      return post<CorrectResult>(
        `/memories/${encodeURIComponent(id)}/correct`,
        { newContent },
        {
          withAgent: true,
        },
      )
    },

    // CRUD

    async getMemory(id: string): Promise<Memory | null> {
      const res = await fetch(`${base}/memories/${encodeURIComponent(id)}`, { headers: headers() })
      if (res.status === 404) return null
      if (!res.ok) return handleError(res)
      const body = (await res.json()) as { memory: Memory }
      return body.memory
    },

    async listMemories(params?: ListParams): Promise<{ memories: Memory[]; total: number }> {
      const qs = params
        ? toQueryString({
            limit: params.limit,
            offset: params.offset,
            agent: params.agent,
            engineer: params.engineer,
            repo: params.repo,
            tags: params.tags,
            pinned: params.pinned,
            archived: params.archived,
            stale: params.stale,
            orderBy: params.orderBy,
            orderDirection: params.orderDirection,
          })
        : ""
      return get<{ memories: Memory[]; total: number }>(`/memories${qs}`)
    },

    async deleteMemory(id: string): Promise<boolean> {
      return del(`/memories/${encodeURIComponent(id)}`)
    },

    // Lifecycle

    async pin(id: string): Promise<Memory> {
      const res = await post<{ memory: Memory }>(`/memories/${encodeURIComponent(id)}/pin`, {})
      return res.memory
    },

    async unpin(id: string): Promise<Memory> {
      const res = await post<{ memory: Memory }>(`/memories/${encodeURIComponent(id)}/unpin`, {})
      return res.memory
    },

    async archive(id: string): Promise<Memory> {
      const res = await post<{ memory: Memory }>(`/memories/${encodeURIComponent(id)}/archive`, {})
      return res.memory
    },

    async restore(id: string): Promise<Memory> {
      const res = await post<{ memory: Memory }>(`/memories/${encodeURIComponent(id)}/restore`, {})
      return res.memory
    },

    // Bulk

    async importMemories(memories: ImportEntry[]): Promise<ImportResult> {
      return post<ImportResult>("/memories/import", { memories }, { withAgent: true })
    },

    async exportMemories(filter?: { archived?: boolean | "all" }): Promise<Memory[]> {
      const qs =
        filter?.archived !== undefined ? toQueryString({ archived: String(filter.archived) }) : ""
      return get<Memory[]>(`/memories/export${qs}`)
    },

    // Analytics

    async getStats(): Promise<MemoryStats> {
      return get<MemoryStats>("/stats")
    },

    async getCounts(): Promise<MemoryCounts> {
      const stats = await get<MemoryStats>("/stats")
      return { active: stats.active, archived: stats.archived, pinned: stats.pinned }
    },

    // Utility

    async resolvePrefix(prefix: string): Promise<Memory[]> {
      const res = await get<{ memories: Memory[] }>(
        `/memories/resolve/${encodeURIComponent(prefix)}`,
      )
      return res.memories
    },

    async touchMemories(ids: string[]): Promise<number> {
      const res = await post<{ touched: number }>("/memories/touch", { ids })
      return res.touched
    },

    // Admin

    async archiveStale(): Promise<number> {
      const res = await post<{ archived: number }>("/admin/archive-stale", {})
      return res.archived
    },

    async health(): Promise<HealthStatus> {
      return get<HealthStatus>("/health")
    },
  }
}
