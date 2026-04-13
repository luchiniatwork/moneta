import { sql } from "kysely"
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
  const { config, db } = useTuiContext()
  const [counts, setCounts] = useState<MemoryCounts>({ active: 0, archived: 0, pinned: 0 })

  const refresh = useCallback(async () => {
    try {
      const result = await sql<{
        active: string
        archived: string
        pinned: string
      }>`
        SELECT
          COUNT(*) FILTER (WHERE NOT archived) AS active,
          COUNT(*) FILTER (WHERE archived)     AS archived,
          COUNT(*) FILTER (WHERE pinned)       AS pinned
        FROM project_memory
        WHERE project_id = ${config.projectId}
      `.execute(db)

      const row = result.rows[0]
      setCounts({
        active: Number(row?.active ?? 0),
        archived: Number(row?.archived ?? 0),
        pinned: Number(row?.pinned ?? 0),
      })
    } catch {
      // Silently ignore — counts are non-critical
    }
  }, [config.projectId, db])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { counts, refresh }
}
