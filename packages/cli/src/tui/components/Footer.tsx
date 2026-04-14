import { Box, Text } from "ink"
import type { Mode, Overlay } from "../types.ts"

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

interface FooterProps {
  mode: Mode
  overlay: Overlay
  inputFocused: boolean
}

/**
 * Bottom bar with context-sensitive keybinding hints.
 *
 * The displayed keys change based on the current mode and whether
 * an overlay is active.
 */
export function Footer({ mode, overlay, inputFocused }: FooterProps): React.JSX.Element {
  return (
    <Box
      borderStyle="single"
      borderTop={true}
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
    >
      <Text>{getHints(mode, overlay, inputFocused)}</Text>
    </Box>
  )
}

function getHints(mode: Mode, overlay: Overlay, inputFocused: boolean): string {
  if (overlay === "help") return "[Esc] Close help"
  if (overlay === "confirm") return "[y] Confirm  [n/Esc] Cancel"
  if (overlay === "filters") return "[Enter] Apply  [Esc] Cancel  [Tab] Next field"
  if (overlay === "tags") return "[Enter] Add tag  [Backspace] Remove  [Esc] Close"
  if (overlay === "add") return "[Tab] Next field  [Enter] Submit  [Esc] Cancel"

  if (mode === "stats") return "[Tab] Back  [?] Help  [q] Quit"

  const nav = inputFocused
    ? "[Enter] Recall  [Esc] Navigate"
    : "[/] Recall  [j/k] Navigate  [Enter] Detail"

  const actions = "[p] Pin  [a] Archive  [d] Delete  [t] Tags  [n] New"
  const listKeys = mode === "list" ? "  [f] Filters  [s] Sort" : ""
  const modes = "[Tab] Mode  [Ctrl+S] Stats  [?] Help  [q] Quit"

  return `${nav}  ${actions}${listKeys}  ${modes}`
}
