import { Box, Text, useInput } from "ink"

// ---------------------------------------------------------------------------
// ConfirmDialog
// ---------------------------------------------------------------------------

interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Inline confirmation prompt rendered at the bottom of the screen.
 *
 * Used for destructive actions like delete. Captures `y` for confirm
 * and `n`/`Esc` for cancel.
 */
export function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element {
  useInput((input, key) => {
    if (input === "y" || input === "Y") {
      onConfirm()
    } else if (input === "n" || input === "N" || key.escape) {
      onCancel()
    }
  })

  return (
    <Box paddingX={1}>
      <Text color="yellow" bold>
        {message} [y/N]{" "}
      </Text>
    </Box>
  )
}
