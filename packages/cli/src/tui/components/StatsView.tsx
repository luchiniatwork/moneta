import { Box, Text } from "ink"
import type { MemoryStats } from "../../commands/stats.ts"
import { shortId, truncate } from "../../format.ts"

// ---------------------------------------------------------------------------
// StatsView
// ---------------------------------------------------------------------------

interface StatsViewProps {
  stats: MemoryStats | null
  loading: boolean
  error: string | null
  projectId: string
}

/**
 * Full-screen stats dashboard matching the `moneta stats` CLI output.
 *
 * Renders aggregate memory statistics in a formatted dashboard layout.
 */
export function StatsView({ stats, loading, error, projectId }: StatsViewProps): React.JSX.Element {
  if (loading) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text dimColor>Loading statistics...</Text>
      </Box>
    )
  }

  if (error) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color="red">Error: {error}</Text>
      </Box>
    )
  }

  if (!stats) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text dimColor>No data.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>Project: {projectId}</Text>
      <Text dimColor>{"─".repeat(40)}</Text>
      <Text> </Text>

      {/* Totals */}
      <Text bold>Total memories: {stats.total}</Text>
      <Text> Active: {stats.active}</Text>
      <Text> Archived: {stats.archived}</Text>
      <Text> Pinned: {stats.pinned}</Text>

      {/* By engineer */}
      {stats.byEngineer.length > 0 && (
        <>
          <Text> </Text>
          <Text bold>By engineer:</Text>
          {stats.byEngineer.map((e) => (
            <Text key={e.engineer}>
              {"  "}
              {e.engineer.padEnd(18)} {String(e.count).padStart(4)} memories
              {e.pinned > 0 ? ` (${e.pinned} pinned)` : ""}
            </Text>
          ))}
        </>
      )}

      {/* By repo */}
      {stats.byRepo.length > 0 && (
        <>
          <Text> </Text>
          <Text bold>By repo:</Text>
          {stats.byRepo.map((r) => (
            <Text key={r.repo}>
              {"  "}
              {r.repo.padEnd(18)} {String(r.count).padStart(4)}
            </Text>
          ))}
        </>
      )}

      {/* Top tags */}
      {stats.topTags.length > 0 && (
        <>
          <Text> </Text>
          <Text bold>Top tags:</Text>
          {stats.topTags.map((t) => (
            <Text key={t.tag}>
              {"  "}
              {t.tag.padEnd(18)} {String(t.count).padStart(4)}
            </Text>
          ))}
        </>
      )}

      {/* Archival */}
      <Text> </Text>
      <Text bold>Archival:</Text>
      <Text> Approaching stale (&gt;20d): {stats.approachingStale} memories</Text>
      <Text> Archived last 7 days: {stats.archivedLast7Days} memories</Text>

      {/* Access patterns */}
      <Text> </Text>
      <Text bold>Access patterns:</Text>
      <Text> Memories created today: {stats.createdToday}</Text>
      {stats.mostAccessed.length > 0 && stats.mostAccessed[0] && (
        <Text>
          {"  "}Most accessed: {shortId(stats.mostAccessed[0].id)}
          {"  "}
          &quot;{truncate(stats.mostAccessed[0].content, 30)}&quot; (
          {stats.mostAccessed[0].accessCount} hits)
        </Text>
      )}
    </Box>
  )
}
