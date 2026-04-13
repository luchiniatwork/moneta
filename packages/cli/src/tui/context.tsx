import { createContext, useContext } from "react"
import type { CliContext } from "../context.ts"

// ---------------------------------------------------------------------------
// React context for CLI config + database
// ---------------------------------------------------------------------------

/**
 * React context carrying the CLI context (config + db connection).
 *
 * Provided once at the TUI root so every hook and component can
 * access config values and run database queries without prop-drilling.
 */
export const TuiContext = createContext<CliContext>(null as unknown as CliContext)

/**
 * Retrieve the CLI context from the nearest `TuiContext.Provider`.
 *
 * @returns CLI context with config and database connection
 */
export function useTuiContext(): CliContext {
  return useContext(TuiContext)
}
