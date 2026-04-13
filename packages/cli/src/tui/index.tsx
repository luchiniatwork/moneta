import { render } from "ink"
import type { CliContext } from "../context.ts"
import { App } from "./App.tsx"
import { TuiContext } from "./context.tsx"

// ---------------------------------------------------------------------------
// TUI entry point
// ---------------------------------------------------------------------------

/**
 * Launch the interactive TUI.
 *
 * Switches to the alternate screen buffer, renders the Ink app,
 * and waits until the user quits. On exit, restores the original
 * screen buffer.
 *
 * @param ctx - CLI context with config and database connection
 */
export async function launchTui(ctx: CliContext): Promise<void> {
  // Switch to alternate screen buffer (preserves terminal history)
  process.stdout.write("\x1b[?1049h")
  process.stdout.write("\x1b[2J\x1b[H")

  const instance = render(
    <TuiContext.Provider value={ctx}>
      <App />
    </TuiContext.Provider>,
    { exitOnCtrlC: false },
  )

  try {
    await instance.waitUntilExit()
  } finally {
    // Restore main screen buffer
    process.stdout.write("\x1b[?1049l")
  }
}
