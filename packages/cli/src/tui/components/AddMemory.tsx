import type { Importance } from "@moneta/api-client"
import { Box, Text, useInput } from "ink"
import TextInput from "ink-text-input"
import { useState } from "react"
import type { RememberParams } from "../hooks/useMemoryActions.ts"

// ---------------------------------------------------------------------------
// AddMemory
// ---------------------------------------------------------------------------

interface AddMemoryProps {
  onSubmit: (params: RememberParams) => void
  onCancel: () => void
}

type Field = "content" | "tags" | "repo" | "importance"

const FIELDS: Field[] = ["content", "tags", "repo", "importance"]
const SUBMIT_INDEX = FIELDS.length
const TOTAL_FIELDS = FIELDS.length + 1

const FIELD_LABELS: Record<Field, string> = {
  content: "Content",
  tags: "Tags (comma-separated)",
  repo: "Repository",
  importance: "Importance (normal/high/critical)",
}

const VALID_IMPORTANCE = new Set(["normal", "high", "critical"])

/**
 * Modal overlay for creating a new memory.
 *
 * Renders text inputs for content, tags, repo, and importance.
 * Tab cycles through fields, Enter submits when on the Save button,
 * Esc cancels without saving.
 *
 * @param props.onSubmit - Called with the new memory parameters on save
 * @param props.onCancel - Called when the user presses Esc
 */
export function AddMemory({ onSubmit, onCancel }: AddMemoryProps): React.JSX.Element {
  const [content, setContent] = useState("")
  const [tags, setTags] = useState("")
  const [repo, setRepo] = useState("")
  const [importance, setImportance] = useState("")
  const [focusedField, setFocusedField] = useState(0)

  const values: Record<Field, string> = { content, tags, repo, importance }
  const setters: Record<Field, (v: string) => void> = {
    content: setContent,
    tags: setTags,
    repo: setRepo,
    importance: setImportance,
  }

  useInput((_input, key) => {
    if (key.escape) {
      onCancel()
      return
    }
    if (key.tab) {
      setFocusedField((prev) => (prev + 1) % TOTAL_FIELDS)
      return
    }
    if (focusedField === SUBMIT_INDEX && key.return) {
      handleSubmit()
      return
    }
  })

  function handleSubmit(): void {
    const trimmed = content.trim()
    if (trimmed.length === 0) return

    const parsedTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)

    const imp = importance.trim().toLowerCase()
    const validImportance: Importance = VALID_IMPORTANCE.has(imp) ? (imp as Importance) : "normal"

    onSubmit({
      content: trimmed,
      tags: parsedTags.length > 0 ? parsedTags : undefined,
      repo: repo.trim() || undefined,
      importance: validImportance,
    })
  }

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1} width={60}>
      <Text bold>New Memory</Text>
      <Text> </Text>

      {FIELDS.map((field, i) => (
        <Box key={field} marginBottom={field === "content" ? 1 : 0}>
          <Text bold={focusedField === i}>
            {focusedField === i ? "> " : "  "}
            {FIELD_LABELS[field]}:{" "}
          </Text>
          {focusedField === i ? (
            <TextInput
              value={values[field]}
              onChange={setters[field]}
              onSubmit={() => setFocusedField((prev) => prev + 1)}
            />
          ) : (
            <Text dimColor>{values[field] || (field === "content" ? "(required)" : "(none)")}</Text>
          )}
        </Box>
      ))}

      <Text> </Text>
      <Box>
        <Text
          bold={focusedField === SUBMIT_INDEX}
          color={focusedField === SUBMIT_INDEX ? "green" : undefined}
        >
          {focusedField === SUBMIT_INDEX ? "> " : "  "}
          [Save]
        </Text>
      </Box>

      <Text> </Text>
      <Text dimColor>Tab to cycle fields, Enter to submit, Esc to cancel</Text>
    </Box>
  )
}
