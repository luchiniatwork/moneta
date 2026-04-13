import { Box, Text } from "ink"
import TextInput from "ink-text-input"

// ---------------------------------------------------------------------------
// RecallBar
// ---------------------------------------------------------------------------

interface RecallBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  isFocused: boolean
  loading: boolean
}

/**
 * Recall input bar at the top of recall mode.
 *
 * Uses `ink-text-input` for text editing. When `isFocused` is false,
 * the input is displayed but does not capture keystrokes.
 */
export function RecallBar({
  value,
  onChange,
  onSubmit,
  isFocused,
  loading,
}: RecallBarProps): React.JSX.Element {
  return (
    <Box paddingX={1}>
      <Text bold color={isFocused ? "cyan" : undefined}>
        Recall:{" "}
      </Text>
      {isFocused ? (
        <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
      ) : (
        <Text>{value || <Text dimColor>Type / to recall</Text>}</Text>
      )}
      {loading && <Text dimColor> (recalling...)</Text>}
    </Box>
  )
}
