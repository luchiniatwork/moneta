import { Box, Text } from "ink"

// ---------------------------------------------------------------------------
// HelpOverlay
// ---------------------------------------------------------------------------

/**
 * Full-screen help overlay listing all keybindings by category.
 *
 * Displayed when the user presses `?` or `F1`.
 */
export function HelpOverlay(): React.JSX.Element {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>Keybindings</Text>
      <Text dimColor>{"─".repeat(50)}</Text>
      <Text> </Text>

      <Text bold>Navigation</Text>
      <Binding keys="j / Down" action="Move selection down" />
      <Binding keys="k / Up" action="Move selection up" />
      <Binding keys="Enter" action="Toggle detail panel" />
      <Binding keys="/" action="Focus search bar" />
      <Binding keys="Esc" action="Unfocus search / close overlay" />
      <Text> </Text>

      <Text bold>Modes</Text>
      <Binding keys="Tab" action="Switch between Search and List mode" />
      <Binding keys="Ctrl+S" action="Stats dashboard" />
      <Text> </Text>

      <Text bold>Actions (on selected memory)</Text>
      <Binding keys="p" action="Pin / unpin" />
      <Binding keys="a" action="Archive / restore" />
      <Binding keys="d" action="Delete (with confirmation)" />
      <Binding keys="t" action="Edit tags" />
      <Text> </Text>

      <Text bold>List Mode</Text>
      <Binding keys="f" action="Open filter panel" />
      <Binding keys="s" action="Toggle sort (date / last accessed)" />
      <Text> </Text>

      <Text bold>General</Text>
      <Binding keys="? / F1" action="Toggle this help" />
      <Binding keys="q / Ctrl+C" action="Quit" />

      <Text> </Text>
      <Text dimColor>Press Esc or ? to close</Text>
    </Box>
  )
}

function Binding({ keys, action }: { keys: string; action: string }): React.JSX.Element {
  return (
    <Box>
      <Text> </Text>
      <Text bold>{keys.padEnd(16)}</Text>
      <Text>{action}</Text>
    </Box>
  )
}
