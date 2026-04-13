import { callRecall, callTouchMemories, embed, updateMemory } from "@moneta/shared"
import { useCallback, useState } from "react"
import { useTuiContext } from "../context.tsx"
import { fromRecallResult } from "../convert.ts"
import type { MemoryItem } from "../types.ts"

// ---------------------------------------------------------------------------
// useSearch — semantic search
// ---------------------------------------------------------------------------

interface UseSearchReturn {
  query: string
  setQuery: (q: string) => void
  results: MemoryItem[]
  loading: boolean
  error: string | null
  search: (q: string) => Promise<void>
  selectedIndex: number
  setSelectedIndex: (i: number) => void
  clearError: () => void
}

/**
 * Manage semantic search state: query, embedding, recall, touch, and results.
 *
 * @returns Search state and actions
 */
export function useSearch(): UseSearchReturn {
  const { config, db } = useTuiContext()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<MemoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const search = useCallback(
    async (q: string) => {
      if (!q.trim()) return
      setLoading(true)
      setError(null)
      try {
        const embedding = await embed(q, config.openaiApiKey, config.embeddingModel)

        const recallResults = await callRecall(db, {
          projectId: config.projectId,
          embedding,
          limit: config.searchLimit,
          threshold: config.searchThreshold,
        })

        // Bump access timestamps
        if (recallResults.length > 0) {
          const ids = recallResults.map((r) => r.id)
          await callTouchMemories(db, ids)

          // Promote archived memories
          const archived = recallResults.filter((r) => r.archived)
          for (const r of archived) {
            await updateMemory(db, r.id, { archived: false })
            r.archived = false
          }
        }

        setResults(recallResults.map(fromRecallResult))
        setSelectedIndex(0)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [config, db],
  )

  const clearError = useCallback(() => setError(null), [])

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    search,
    selectedIndex,
    setSelectedIndex,
    clearError,
  }
}
