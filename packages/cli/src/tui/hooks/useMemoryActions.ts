import { deleteMemory, embed, updateMemory } from "@moneta/shared"
import { useCallback, useState } from "react"
import { useTuiContext } from "../context.tsx"

// ---------------------------------------------------------------------------
// useMemoryActions — mutations on individual memories
// ---------------------------------------------------------------------------

interface UseMemoryActionsReturn {
  /** Toggle pin state on a memory. */
  togglePin: (id: string, currentlyPinned: boolean) => Promise<void>
  /** Toggle archived state on a memory. */
  toggleArchive: (id: string, currentlyArchived: boolean) => Promise<void>
  /** Permanently delete a memory. */
  forget: (id: string) => Promise<void>
  /** Update tags on a memory. */
  updateTags: (id: string, tags: string[]) => Promise<void>
  /** Update content on a memory (re-embeds). */
  correct: (id: string, newContent: string) => Promise<void>
  /** Whether a mutation is in progress. */
  busy: boolean
  /** Last error from a mutation (cleared on next action). */
  error: string | null
}

/**
 * Provides mutation actions for individual memories.
 *
 * Each action updates the database and signals completion so the
 * caller can refresh the list or counts.
 *
 * @returns Mutation actions, busy state, and last error
 */
export function useMemoryActions(): UseMemoryActionsReturn {
  const { config, db } = useTuiContext()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const togglePin = useCallback(
    async (id: string, currentlyPinned: boolean) => {
      await run(async () => {
        await updateMemory(db, id, { pinned: !currentlyPinned, updated_at: new Date() })
      })
    },
    [db, run],
  )

  const toggleArchive = useCallback(
    async (id: string, currentlyArchived: boolean) => {
      await run(async () => {
        await updateMemory(db, id, {
          archived: !currentlyArchived,
          updated_at: new Date(),
          ...(currentlyArchived ? { last_accessed_at: new Date() } : {}),
        })
      })
    },
    [db, run],
  )

  const forget = useCallback(
    async (id: string) => {
      await run(async () => {
        await deleteMemory(db, id)
      })
    },
    [db, run],
  )

  const updateTags = useCallback(
    async (id: string, tags: string[]) => {
      await run(async () => {
        await updateMemory(db, id, { tags, updated_at: new Date() })
      })
    },
    [db, run],
  )

  const correct = useCallback(
    async (id: string, newContent: string) => {
      await run(async () => {
        const embedding = await embed(newContent, config.openaiApiKey, config.embeddingModel)
        await updateMemory(db, id, {
          content: newContent,
          updated_at: new Date(),
          newEmbedding: embedding,
        })
      })
    },
    [config, db, run],
  )

  return { togglePin, toggleArchive, forget, updateTags, correct, busy, error }
}
