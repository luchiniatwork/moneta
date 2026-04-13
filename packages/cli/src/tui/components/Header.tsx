import { Box, Text } from "ink"
import type { MemoryCounts, Mode } from "../types.ts"

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface HeaderProps {
  projectId: string
  mode: Mode
  counts: MemoryCounts
}

const MODE_LABELS: Record<Mode, string> = {
  recall: "Recall",
  list: "List",
  stats: "Stats",
}

/**
 * Top status bar showing the project name, current mode, and memory counts.
 */
export function Header({ projectId, mode, counts }: HeaderProps): React.JSX.Element {
  return (
    <Box
      borderStyle="single"
      borderBottom={true}
      borderTop={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
    >
      <Text bold>Moneta</Text>
      <Text> </Text>
      <Text dimColor>{projectId}</Text>
      <Text> </Text>
      <Text dimColor>|</Text>
      <Text> </Text>
      <Text color="cyan">{MODE_LABELS[mode]}</Text>
      <Box flexGrow={1} />
      <Text>
        {counts.active} active / {counts.archived} archived / {counts.pinned} pinned
      </Text>
    </Box>
  )
}
