import { useCallback, useState } from "react"
import { useTuiContext } from "../context.tsx"
import { fromRecallResult } from "../convert.ts"
import type { MemoryItem } from "../types.ts"

// ---------------------------------------------------------------------------
// useRecall — semantic recall
// ---------------------------------------------------------------------------

interface UseRecallReturn {
  query: string
  setQuery: (q: string) => void
  results: MemoryItem[]
  loading: boolean
  error: string | null
  recall: (q: string) => Promise<void>
  selectedIndex: number
  setSelectedIndex: (i: number) => void
  clearError: () => void
}

/**
 * Manage semantic recall state: query input, API call, and results.
 *
 * The API server handles embedding, querying, touch updates, and
 * archived-memory promotion.
 *
 * @returns Recall state and actions
 */
export function useRecall(): UseRecallReturn {
  const { client } = useTuiContext()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<MemoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const recall = useCallback(
    async (q: string) => {
      if (!q.trim()) return
      setLoading(true)
      setError(null)
      try {
        const recallResults = await client.recall({ question: q })

        setResults(recallResults.map(fromRecallResult))
        setSelectedIndex(0)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [client],
  )

  const clearError = useCallback(() => setError(null), [])

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    recall,
    selectedIndex,
    setSelectedIndex,
    clearError,
  }
}
