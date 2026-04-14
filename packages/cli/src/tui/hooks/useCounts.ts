import { useCallback, useEffect, useState } from "react"
import { useTuiContext } from "../context.tsx"
import type { MemoryCounts } from "../types.ts"

// ---------------------------------------------------------------------------
// useCounts — header memory counts
// ---------------------------------------------------------------------------

interface UseCountsReturn {
  counts: MemoryCounts
  refresh: () => Promise<void>
}

/**
 * Fetch and track aggregate memory counts for the header bar.
 *
 * Loads counts on mount and exposes a `refresh` function that
 * components call after mutations (pin, archive, delete, etc.).
 *
 * @returns Current counts and a refresh callback
 */
export function useCounts(): UseCountsReturn {
  const { client } = useTuiContext()
  const [counts, setCounts] = useState<MemoryCounts>({ active: 0, archived: 0, pinned: 0 })

  const refresh = useCallback(async () => {
    try {
      const data = await client.getCounts()
      setCounts(data)
    } catch {
      // Silently ignore — counts are non-critical
    }
  }, [client])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { counts, refresh }
}
