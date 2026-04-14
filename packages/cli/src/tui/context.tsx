import { createContext, useContext } from "react"
import type { CliContext } from "../context.ts"

// ---------------------------------------------------------------------------
// React context for CLI config + API client
// ---------------------------------------------------------------------------

/**
 * React context carrying the CLI context (config + API client).
 *
 * Provided once at the TUI root so every hook and component can
 * access config values and call API methods without prop-drilling.
 */
export const TuiContext = createContext<CliContext>(null as unknown as CliContext)

/**
 * Retrieve the CLI context from the nearest `TuiContext.Provider`.
 *
 * @returns CLI context with config and API client
 */
export function useTuiContext(): CliContext {
  return useContext(TuiContext)
}
