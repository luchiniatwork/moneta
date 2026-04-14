import type { MemoryStats } from "@moneta/api-client"
import { useCallback, useEffect, useState } from "react"
import { useTuiContext } from "../context.tsx"

// ---------------------------------------------------------------------------
// useStats — aggregate statistics
// ---------------------------------------------------------------------------

interface UseStatsReturn {
  stats: MemoryStats | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Fetch aggregate memory statistics for the stats dashboard.
 *
 * Auto-fetches on mount and exposes a refresh callback for
 * re-fetching when the user navigates to stats mode.
 *
 * @returns Stats data, loading state, and refresh callback
 */
export function useStats(): UseStatsReturn {
  const { client } = useTuiContext()
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await client.getStats()
      setStats(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { stats, loading, error, refresh }
}
