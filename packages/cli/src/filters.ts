import type { SearchScope } from "@moneta/api-client"

/** Normalize an optional CLI filter value. */
export function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

/** Parse comma-separated tags from a CLI flag. */
export function parseTags(value: string | undefined): string[] | undefined {
  const tags = value
    ?.split(",")
    .map(normalizeOptionalString)
    .filter((tag): tag is string => tag !== undefined)

  return tags && tags.length > 0 ? tags : undefined
}

/** Build recall scope, omitting empty filters so recall searches all memories by default. */
export function buildSearchScope(params: {
  agent?: string
  engineer?: string
  repo?: string
  tags?: string
}): SearchScope | undefined {
  const scope: SearchScope = {
    agent: normalizeOptionalString(params.agent),
    engineer: normalizeOptionalString(params.engineer),
    repo: normalizeOptionalString(params.repo),
    tags: parseTags(params.tags),
  }

  if (
    scope.agent === undefined &&
    scope.engineer === undefined &&
    scope.repo === undefined &&
    scope.tags === undefined
  ) {
    return undefined
  }

  return scope
}
