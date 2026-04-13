import { Box, Text, useInput } from "ink"
import TextInput from "ink-text-input"
import { useRef, useState } from "react"

// ---------------------------------------------------------------------------
// TagEditor
// ---------------------------------------------------------------------------

interface TagEditorProps {
  currentTags: string[]
  onSave: (tags: string[]) => void
  onCancel: () => void
}

/**
 * Inline tag editor overlay.
 *
 * Shows current tags and a text input for adding new tags.
 * Enter adds a tag, Backspace on empty input removes the last tag,
 * Ctrl+S saves changes, Esc cancels without saving.
 */
export function TagEditor({ currentTags, onSave, onCancel }: TagEditorProps): React.JSX.Element {
  const [tags, setTags] = useState<string[]>([...currentTags])
  const [input, setInput] = useState("")
  // Use a ref to read current input value synchronously in useInput
  const inputRef = useRef(input)
  inputRef.current = input

  useInput((_char, key) => {
    if (key.escape) {
      onCancel()
      return
    }
    if (key.ctrl && _char === "s") {
      onSave(tags)
      return
    }
    if (key.backspace && inputRef.current === "" && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1))
    }
  })

  function handleSubmit(value: string): void {
    const trimmed = value.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed])
    }
    setInput("")
  }

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1} width={50}>
      <Text bold>Edit Tags</Text>
      <Text> </Text>

      {tags.length > 0 ? (
        <Box>
          <Text>Current: </Text>
          {tags.map((tag, i) => (
            <Text key={tag}>
              <Text color="cyan">{tag}</Text>
              {i < tags.length - 1 ? <Text>, </Text> : null}
            </Text>
          ))}
        </Box>
      ) : (
        <Text dimColor>No tags</Text>
      )}

      <Text> </Text>
      <Box>
        <Text bold>Add tag: </Text>
        <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
      </Box>

      <Text> </Text>
      <Text dimColor>Enter to add, Backspace to remove last, Ctrl+S to save, Esc to cancel</Text>
    </Box>
  )
}
