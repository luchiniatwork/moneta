import { useCallback, useEffect, useState } from "react"
import type { MemoryStats } from "../../commands/stats.ts"
import { gatherStats } from "../../commands/stats.ts"
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
  const { config, db } = useTuiContext()
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await gatherStats(db, config.projectId)
      setStats(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [config.projectId, db])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { stats, loading, error, refresh }
}
