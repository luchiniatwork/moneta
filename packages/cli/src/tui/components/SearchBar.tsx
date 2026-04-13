import { Box, Text } from "ink"
import TextInput from "ink-text-input"

// ---------------------------------------------------------------------------
// SearchBar
// ---------------------------------------------------------------------------

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  isFocused: boolean
  loading: boolean
}

/**
 * Search input bar at the top of search mode.
 *
 * Uses `ink-text-input` for text editing. When `isFocused` is false,
 * the input is displayed but does not capture keystrokes.
 */
export function SearchBar({
  value,
  onChange,
  onSubmit,
  isFocused,
  loading,
}: SearchBarProps): React.JSX.Element {
  return (
    <Box paddingX={1}>
      <Text bold color={isFocused ? "cyan" : undefined}>
        Search:{" "}
      </Text>
      {isFocused ? (
        <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
      ) : (
        <Text>{value || <Text dimColor>Type / to search</Text>}</Text>
      )}
      {loading && <Text dimColor> (searching...)</Text>}
    </Box>
  )
}
