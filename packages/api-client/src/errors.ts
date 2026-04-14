// ---------------------------------------------------------------------------
// API Error
// ---------------------------------------------------------------------------

/**
 * Error thrown when the Moneta REST API returns a non-2xx response.
 *
 * Contains the HTTP status code, a machine-readable error code, and
 * a human-readable message parsed from the response body.
 */
export class ApiError extends Error {
  /** HTTP status code from the response. */
  readonly status: number
  /** Machine-readable error code (e.g. "MEMORY_NOT_FOUND"). */
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}
