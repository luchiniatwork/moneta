import { Box, Text, useInput } from "ink"
import TextInput from "ink-text-input"
import { useState } from "react"
import type { FilterState } from "../types.ts"

// ---------------------------------------------------------------------------
// FilterPanel
// ---------------------------------------------------------------------------

interface FilterPanelProps {
  filters: FilterState
  onApply: (filters: FilterState) => void
  onCancel: () => void
}

type FilterField = "agent" | "engineer" | "repo" | "tags"

const FIELDS: FilterField[] = ["agent", "engineer", "repo", "tags"]
const TEXT_FIELD_COUNT = FIELDS.length
const ARCHIVED_INDEX = TEXT_FIELD_COUNT
const PINNED_INDEX = TEXT_FIELD_COUNT + 1
const APPLY_INDEX = TEXT_FIELD_COUNT + 2
const TOTAL_FIELDS = TEXT_FIELD_COUNT + 3

const FIELD_LABELS: Record<FilterField, string> = {
  agent: "Agent",
  engineer: "Engineer",
  repo: "Repository",
  tags: "Tags (comma-separated)",
}

/**
 * Filter overlay for list mode.
 *
 * Renders text inputs for agent, engineer, repo, and tags filters,
 * plus toggle checkboxes for archived and pinned. Tab cycles through
 * fields, Enter applies when on the Apply button, Esc cancels.
 */
export function FilterPanel({ filters, onApply, onCancel }: FilterPanelProps): React.JSX.Element {
  const [draft, setDraft] = useState<FilterState>({ ...filters })
  const [focusedField, setFocusedField] = useState(0)

  useInput((input, key) => {
    if (key.escape) {
      onCancel()
      return
    }
    if (key.tab) {
      setFocusedField((prev) => (prev + 1) % TOTAL_FIELDS)
      return
    }

    // Toggle checkboxes with Space or Enter
    if (focusedField === ARCHIVED_INDEX && (input === " " || key.return)) {
      setDraft((d) => ({ ...d, archived: !d.archived }))
      return
    }
    if (focusedField === PINNED_INDEX && (input === " " || key.return)) {
      setDraft((d) => ({ ...d, pinned: !d.pinned }))
      return
    }

    // Apply button
    if (focusedField === APPLY_INDEX && key.return) {
      onApply(draft)
      return
    }
  })

  const updateField = (field: FilterField) => (value: string) => {
    setDraft((d) => ({ ...d, [field]: value }))
  }

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1} width={50}>
      <Text bold>Filters</Text>
      <Text> </Text>

      {FIELDS.map((field, i) => (
        <Box key={field} marginBottom={0}>
          <Text bold={focusedField === i}>
            {focusedField === i ? "> " : "  "}
            {FIELD_LABELS[field]}:{" "}
          </Text>
          {focusedField === i ? (
            <TextInput
              value={draft[field]}
              onChange={updateField(field)}
              onSubmit={() => setFocusedField((prev) => prev + 1)}
            />
          ) : (
            <Text dimColor>{draft[field] || "(any)"}</Text>
          )}
        </Box>
      ))}

      <Text> </Text>
      <Box>
        <Text bold={focusedField === ARCHIVED_INDEX}>
          {focusedField === ARCHIVED_INDEX ? "> " : "  "}[{draft.archived ? "x" : " "}] Archived
          only
        </Text>
      </Box>
      <Box>
        <Text bold={focusedField === PINNED_INDEX}>
          {focusedField === PINNED_INDEX ? "> " : "  "}[{draft.pinned ? "x" : " "}] Pinned only
        </Text>
      </Box>

      <Text> </Text>
      <Box>
        <Text
          bold={focusedField === APPLY_INDEX}
          color={focusedField === APPLY_INDEX ? "green" : undefined}
        >
          {focusedField === APPLY_INDEX ? "> " : "  "}
          [Apply]
        </Text>
      </Box>
    </Box>
  )
}
