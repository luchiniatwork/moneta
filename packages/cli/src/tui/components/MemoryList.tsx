import { Box, Text } from "ink"
import { age, formatTags, relativeTime, shortId, truncate } from "../../format.ts"
import type { MemoryItem } from "../types.ts"

// ---------------------------------------------------------------------------
// MemoryList
// ---------------------------------------------------------------------------

interface MemoryListProps {
  items: MemoryItem[]
  selectedIndex: number
  /** Whether to show similarity scores (recall mode) or age (list mode). */
  showSimilarity: boolean
  /** Available height for the list (in terminal rows). */
  height: number
  /** Available width for the list (in terminal columns). */
  width: number
}

/**
 * Scrollable list of memories with selection highlight.
 *
 * Implements windowed rendering: only items visible within the
 * current viewport are rendered, with scroll indicators when
 * items exist above or below the window.
 */
export function MemoryList({
  items,
  selectedIndex,
  showSimilarity,
  height,
  width,
}: MemoryListProps): React.JSX.Element {
  if (items.length === 0) {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text dimColor>No memories to display.</Text>
      </Box>
    )
  }

  // Calculate visible window — only subtract space for scroll indicators
  // when they will actually be shown.
  const needsScrolling = items.length > height
  const listHeight = Math.max(1, needsScrolling ? height - 2 : height)
  const { start, end } = getWindow(items.length, selectedIndex, listHeight)
  const visible = items.slice(start, end)

  const hasAbove = start > 0
  const hasBelow = end < items.length

  return (
    <Box flexDirection="column" flexGrow={1}>
      {hasAbove && (
        <Box paddingX={1}>
          <Text dimColor> {start} more above</Text>
        </Box>
      )}

      {visible.map((item, i) => {
        const actualIndex = start + i
        const isSelected = actualIndex === selectedIndex
        return (
          <MemoryRow
            key={item.id}
            item={item}
            isSelected={isSelected}
            showSimilarity={showSimilarity}
            width={width}
          />
        )
      })}

      {hasBelow && (
        <Box paddingX={1}>
          <Text dimColor> {items.length - end} more below</Text>
        </Box>
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// MemoryRow
// ---------------------------------------------------------------------------

interface MemoryRowProps {
  item: MemoryItem
  isSelected: boolean
  showSimilarity: boolean
  width: number
}

function MemoryRow({ item, isSelected, showSimilarity, width }: MemoryRowProps): React.JSX.Element {
  const pin = item.pinned ? "*" : " "
  // Available chars inside paddingX={1}: width - 2
  const rowWidth = Math.max(20, width - 2)

  // Build the prefix: "> " or "  ", then id/score, then pin
  const indicator = isSelected ? "> " : "  "
  const idOrScore = showSimilarity
    ? `${(item.similarity ?? 0).toFixed(2)} `
    : `${shortId(item.id)} `
  const prefix = `${indicator}${idOrScore}${pin} `

  // Build the suffix: agent, tags/time
  const agent = item.createdBy.padEnd(16)
  const meta = showSimilarity
    ? relativeTime(item.lastAccessedAt)
    : `${formatTags(item.tags).padEnd(12)}  ${age(item.createdAt)}`
  const suffix = `  ${agent}  ${meta}`

  // Content gets whatever space remains
  const contentWidth = Math.max(8, rowWidth - prefix.length - suffix.length)
  const content = truncate(item.content, contentWidth).padEnd(contentWidth)

  const line = `${prefix}${content}${suffix}`
  // Final safety truncation to fit the row
  const display = line.length > rowWidth ? line.slice(0, rowWidth) : line.padEnd(rowWidth)

  return (
    <Box>
      <Text inverse={isSelected}> {display} </Text>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Windowing
// ---------------------------------------------------------------------------

function getWindow(
  total: number,
  selected: number,
  windowSize: number,
): { start: number; end: number } {
  if (total <= windowSize) return { start: 0, end: total }

  // Keep selected item centered-ish in the window
  const half = Math.floor(windowSize / 2)
  let start = selected - half
  if (start < 0) start = 0
  if (start + windowSize > total) start = total - windowSize

  return { start, end: start + windowSize }
}
