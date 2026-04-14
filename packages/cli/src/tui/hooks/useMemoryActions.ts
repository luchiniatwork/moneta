import type { Importance } from "@moneta/shared"
import {
  callDedupCheck,
  deleteMemory,
  embed,
  insertMemory,
  parseAgentId,
  updateMemory,
} from "@moneta/shared"
import { useCallback, useState } from "react"
import { useTuiContext } from "../context.tsx"

// ---------------------------------------------------------------------------
// useMemoryActions — mutations on individual memories
// ---------------------------------------------------------------------------

/** Parameters for creating a new memory via the TUI. */
export interface RememberParams {
  content: string
  tags?: string[]
  repo?: string
  importance?: Importance
}

interface UseMemoryActionsReturn {
  /** Toggle pin state on a memory. Returns `true` on success. */
  togglePin: (id: string, currentlyPinned: boolean) => Promise<boolean>
  /** Toggle archived state on a memory. Returns `true` on success. */
  toggleArchive: (id: string, currentlyArchived: boolean) => Promise<boolean>
  /** Permanently delete a memory. Returns `true` on success. */
  forget: (id: string) => Promise<boolean>
  /** Update tags on a memory. Returns `true` on success. */
  updateTags: (id: string, tags: string[]) => Promise<boolean>
  /** Update content on a memory (re-embeds). Returns `true` on success. */
  correct: (id: string, newContent: string) => Promise<boolean>
  /** Create a new memory (embeds, dedup-checks, and inserts). Returns `true` on success. */
  remember: (params: RememberParams) => Promise<boolean>
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

  const run = useCallback(async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const togglePin = useCallback(
    async (id: string, currentlyPinned: boolean): Promise<boolean> => {
      return run(async () => {
        await updateMemory(db, id, { pinned: !currentlyPinned, updated_at: new Date() })
      })
    },
    [db, run],
  )

  const toggleArchive = useCallback(
    async (id: string, currentlyArchived: boolean): Promise<boolean> => {
      return run(async () => {
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
    async (id: string): Promise<boolean> => {
      return run(async () => {
        await deleteMemory(db, id)
      })
    },
    [db, run],
  )

  const updateTags = useCallback(
    async (id: string, tags: string[]): Promise<boolean> => {
      return run(async () => {
        await updateMemory(db, id, { tags, updated_at: new Date() })
      })
    },
    [db, run],
  )

  const correct = useCallback(
    async (id: string, newContent: string): Promise<boolean> => {
      return run(async () => {
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

  const remember = useCallback(
    async (params: RememberParams): Promise<boolean> => {
      return run(async () => {
        const agentIdRaw = config.agentId
        if (!agentIdRaw) {
          throw new Error(
            "Agent identity required. Set MONETA_AGENT_ID or configure agent_id in moneta.json.",
          )
        }

        const trimmed = params.content.trim()
        if (trimmed.length === 0) {
          throw new Error("Content must not be empty.")
        }
        if (trimmed.length > config.maxContentLength) {
          throw new Error(
            `Content exceeds maximum length of ${config.maxContentLength} characters.`,
          )
        }

        const identity = parseAgentId(agentIdRaw)
        const importance = params.importance ?? "normal"
        const embedding = await embed(trimmed, config.openaiApiKey, config.embeddingModel)

        const duplicates = await callDedupCheck(db, {
          projectId: config.projectId,
          embedding,
          threshold: config.dedupThreshold,
        })

        const firstDupe = duplicates[0]

        if (firstDupe && firstDupe.createdBy === identity.createdBy) {
          await updateMemory(db, firstDupe.id, {
            content: trimmed,
            newEmbedding: embedding,
            tags: params.tags,
            repo: params.repo,
            importance,
          })
          return
        }

        const effectiveTags = firstDupe
          ? [...(params.tags ?? []), "corroborated"]
          : (params.tags ?? undefined)

        await insertMemory(db, {
          project_id: config.projectId,
          content: trimmed,
          embedding,
          created_by: identity.createdBy,
          engineer: identity.engineer,
          agent_type: identity.agentType,
          repo: params.repo ?? null,
          tags: effectiveTags,
          importance,
          pinned: importance === "critical",
        })
      })
    },
    [config, db, run],
  )

  return { togglePin, toggleArchive, forget, updateTags, correct, remember, busy, error }
}
