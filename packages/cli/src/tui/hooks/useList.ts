import { useCallback, useEffect, useState } from "react"
import { useTuiContext } from "../context.tsx"
import { fromMemory } from "../convert.ts"
import type { FilterState, MemoryItem } from "../types.ts"
import { EMPTY_FILTERS } from "../types.ts"

// ---------------------------------------------------------------------------
// useList — chronological memory listing
// ---------------------------------------------------------------------------

type SortColumn = "created_at" | "last_accessed_at"

interface UseListReturn {
  memories: MemoryItem[]
  loading: boolean
  error: string | null
  filters: FilterState
  setFilters: (f: FilterState) => void
  sortBy: SortColumn
  toggleSort: () => void
  selectedIndex: number
  setSelectedIndex: (i: number) => void
  refresh: () => Promise<void>
  clearError: () => void
}

/**
 * Manage the list mode: chronological listing with filters and sorting.
 *
 * Fetches memories on mount and whenever filters or sort order change.
 *
 * @returns List state and actions
 */
export function useList(): UseListReturn {
  const { client } = useTuiContext()
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [sortBy, setSortBy] = useState<SortColumn>("created_at")
  const [selectedIndex, setSelectedIndex] = useState(0)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const tags = filters.tags
        ? filters.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined

      const { memories: rows } = await client.listMemories({
        limit: 100,
        agent: filters.agent || undefined,
        engineer: filters.engineer || undefined,
        repo: filters.repo || undefined,
        tags: tags && tags.length > 0 ? tags : undefined,
        pinned: filters.pinned || undefined,
        archived: filters.archived || undefined,
        orderBy: sortBy,
        orderDirection: "desc",
      })

      setMemories(rows.map(fromMemory))
      setSelectedIndex(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [client, filters, sortBy])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const toggleSort = useCallback(() => {
    setSortBy((prev) => (prev === "created_at" ? "last_accessed_at" : "created_at"))
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return {
    memories,
    loading,
    error,
    filters,
    setFilters,
    sortBy,
    toggleSort,
    selectedIndex,
    setSelectedIndex,
    refresh,
    clearError,
  }
}
