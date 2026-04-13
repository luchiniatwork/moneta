import { createInterface } from "node:readline"

// ---------------------------------------------------------------------------
// Confirmation Prompt
// ---------------------------------------------------------------------------

/**
 * Ask the user for yes/no confirmation via stdin.
 *
 * Prints the message followed by ` [y/N] ` and waits for input.
 * Returns `true` only if the user types "y" or "yes" (case-insensitive).
 * Defaults to `false` on Enter or any other input.
 *
 * @param message - The question to display
 * @returns Whether the user confirmed
 */
export async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  })

  return new Promise<boolean>((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close()
      const normalized = answer.trim().toLowerCase()
      resolve(normalized === "y" || normalized === "yes")
    })
  })
}
