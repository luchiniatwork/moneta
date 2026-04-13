import { Box, Text } from "ink"
import { formatTags, relativeTime, shortId } from "../../format.ts"
import type { MemoryItem } from "../types.ts"

// ---------------------------------------------------------------------------
// DetailPanel
// ---------------------------------------------------------------------------

interface DetailPanelProps {
  item: MemoryItem
  width: number
}

/**
 * Right panel showing full details of the selected memory.
 *
 * Displays all metadata: content, attribution, tags, importance,
 * pin/archive status, access stats, and timestamps.
 */
export function DetailPanel({ item, width }: DetailPanelProps): React.JSX.Element {
  const contentWidth = Math.max(10, width - 4) // Padding

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="single"
      borderLeft={true}
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      paddingX={1}
    >
      <Text bold>Detail</Text>
      <Text> </Text>

      <Field label="Content" value={wrapText(item.content, contentWidth - 12)} />
      <Text> </Text>

      <Field label="Created by" value={item.createdBy} />
      {item.engineer && <Field label="Engineer" value={item.engineer} />}
      {item.agentType && <Field label="Agent type" value={item.agentType} />}
      {item.repo && <Field label="Repo" value={item.repo} />}
      <Field label="Tags" value={formatTags(item.tags) || "(none)"} />
      <Field label="Importance" value={item.importance} />
      <Field label="Pinned" value={item.pinned ? "yes" : "no"} />
      <Field label="Archived" value={item.archived ? "yes" : "no"} />
      <Text> </Text>

      <Field label="ID" value={shortId(item.id)} />
      <Field label="Hits" value={String(item.accessCount)} />
      <Field label="Created" value={relativeTime(item.createdAt)} />
      <Field label="Updated" value={relativeTime(item.updatedAt)} />
      <Field label="Accessed" value={relativeTime(item.lastAccessedAt)} />

      {item.similarity !== undefined && (
        <>
          <Text> </Text>
          <Field label="Similarity" value={item.similarity.toFixed(4)} />
        </>
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Field({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <Box>
      <Text bold>{label.padEnd(12)}</Text>
      <Text>{value}</Text>
    </Box>
  )
}

function wrapText(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return text
  const words = text.replace(/\n/g, " ").split(" ")
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth && current.length > 0) {
      lines.push(current)
      current = word
    } else {
      current = current ? `${current} ${word}` : word
    }
  }
  if (current) lines.push(current)

  return lines.join("\n")
}
