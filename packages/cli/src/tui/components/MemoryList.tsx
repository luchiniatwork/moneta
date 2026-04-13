import { Box, Text } from "ink"
import { age, formatTags, relativeTime, shortId, truncate } from "../../format.ts"
import type { MemoryItem } from "../types.ts"

// ---------------------------------------------------------------------------
// MemoryList
// ---------------------------------------------------------------------------

interface MemoryListProps {
  items: MemoryItem[]
  selectedIndex: number
  /** Whether to show similarity scores (search mode) or age (list mode). */
  showSimilarity: boolean
  /** Available height for the list (in terminal rows). */
  height: number
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
}

function MemoryRow({ item, isSelected, showSimilarity }: MemoryRowProps): React.JSX.Element {
  const pin = item.pinned ? "*" : " "
  const contentWidth = 50

  return (
    <Box paddingX={1}>
      <Text
        backgroundColor={isSelected ? "blue" : undefined}
        color={isSelected ? "white" : undefined}
      >
        {isSelected ? ">" : " "}{" "}
        {showSimilarity ? (
          <Text>{(item.similarity ?? 0).toFixed(2)} </Text>
        ) : (
          <Text dimColor>{shortId(item.id)} </Text>
        )}
        <Text color="yellow">{pin}</Text>{" "}
        {truncate(item.content, contentWidth).padEnd(contentWidth)}
        {"  "}
        <Text dimColor>
          {item.createdBy.padEnd(20)}
          {"  "}
          {showSimilarity
            ? relativeTime(item.lastAccessedAt)
            : `${formatTags(item.tags).padEnd(16)}  ${age(item.createdAt)}`}
        </Text>
      </Text>
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
