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
    <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1} width={60}>
      <Text bold>Keybindings</Text>
      <Text dimColor>{"─".repeat(50)}</Text>
      <Text> </Text>

      <Text bold>Navigation</Text>
      <Binding keys="j / Down" action="Move selection down" />
      <Binding keys="k / Up" action="Move selection up" />
      <Binding keys="Enter" action="Toggle detail panel" />
      <Binding keys="/" action="Focus recall bar" />
      <Binding keys="Esc" action="Unfocus recall bar / close overlay" />
      <Text> </Text>

      <Text bold>Modes</Text>
      <Binding keys="Tab" action="Switch between Recall and List mode" />
      <Binding keys="Ctrl+S" action="Stats dashboard" />
      <Text> </Text>

      <Text bold>Actions</Text>
      <Binding keys="p" action="Pin / unpin (selected memory)" />
      <Binding keys="a" action="Archive / restore (selected memory)" />
      <Binding keys="d" action="Delete with confirmation (selected memory)" />
      <Binding keys="t" action="Edit tags (selected memory)" />
      <Binding keys="n" action="Create a new memory" />
      <Binding keys="r" action="Refresh list from server" />
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
