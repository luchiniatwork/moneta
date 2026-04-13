import { Box, Text, useApp, useInput, useStdout } from "ink"
import { useCallback, useState } from "react"
import { ConfirmDialog } from "./components/ConfirmDialog.tsx"
import { DetailPanel } from "./components/DetailPanel.tsx"
import { FilterPanel } from "./components/FilterPanel.tsx"
import { Footer } from "./components/Footer.tsx"
import { Header } from "./components/Header.tsx"
import { HelpOverlay } from "./components/HelpOverlay.tsx"
import { MemoryList } from "./components/MemoryList.tsx"
import { SearchBar } from "./components/SearchBar.tsx"
import { StatsView } from "./components/StatsView.tsx"
import { TagEditor } from "./components/TagEditor.tsx"
import { useTuiContext } from "./context.tsx"
import { useCounts } from "./hooks/useCounts.ts"
import { useList } from "./hooks/useList.ts"
import { useMemoryActions } from "./hooks/useMemoryActions.ts"
import { useSearch } from "./hooks/useSearch.ts"
import { useStats } from "./hooks/useStats.ts"
import type { MemoryItem, Mode, Overlay } from "./types.ts"

// ---------------------------------------------------------------------------
// App — root TUI component
// ---------------------------------------------------------------------------

/**
 * Root component for the Moneta TUI.
 *
 * Manages mode switching (search/list/stats), overlays (help/confirm/
 * filters/tags), input focus, and global keybindings. Delegates data
 * fetching to custom hooks and rendering to child components.
 */
export function App(): React.JSX.Element {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const { config } = useTuiContext()

  // Layout dimensions
  const termWidth = stdout.columns ?? 80
  const termHeight = stdout.rows ?? 24
  const detailWidth = Math.max(30, Math.floor(termWidth * 0.35))
  const listHeight = termHeight - 4 // header + search/filter bar + footer + padding

  // Mode & overlay state
  const [mode, setMode] = useState<Mode>("search")
  const [overlay, setOverlay] = useState<Overlay>("none")
  const [showDetail, setShowDetail] = useState(false)
  const [inputFocused, setInputFocused] = useState(true)

  // Confirm dialog state
  const [confirmMessage, setConfirmMessage] = useState("")
  const [confirmCallback, setConfirmCallback] = useState<(() => void) | null>(null)

  // Data hooks
  const { counts, refresh: refreshCounts } = useCounts()
  const search = useSearch()
  const list = useList()
  const stats = useStats()
  const actions = useMemoryActions()

  // ---------------------------------------------------------------------------
  // Active items for current mode
  // ---------------------------------------------------------------------------

  const activeItems = mode === "search" ? search.results : list.memories
  const activeIndex = mode === "search" ? search.selectedIndex : list.selectedIndex
  const setActiveIndex = mode === "search" ? search.setSelectedIndex : list.setSelectedIndex
  const selectedItem: MemoryItem | undefined = activeItems[activeIndex]

  // ---------------------------------------------------------------------------
  // Action helpers
  // ---------------------------------------------------------------------------

  const refreshAfterAction = useCallback(async () => {
    await refreshCounts()
    if (mode === "list") {
      await list.refresh()
    }
  }, [mode, refreshCounts, list.refresh])

  const handlePin = useCallback(async () => {
    if (!selectedItem) return
    await actions.togglePin(selectedItem.id, selectedItem.pinned)
    await refreshAfterAction()
  }, [selectedItem, actions, refreshAfterAction])

  const handleArchive = useCallback(async () => {
    if (!selectedItem) return
    await actions.toggleArchive(selectedItem.id, selectedItem.archived)
    await refreshAfterAction()
  }, [selectedItem, actions, refreshAfterAction])

  const handleDelete = useCallback(() => {
    if (!selectedItem) return
    setConfirmMessage(`Delete memory ${selectedItem.id.slice(0, 6)}?`)
    setConfirmCallback(() => async () => {
      await actions.forget(selectedItem.id)
      // Adjust selection if we deleted the last item
      const newLen = activeItems.length - 1
      if (activeIndex >= newLen && newLen > 0) {
        setActiveIndex(newLen - 1)
      }
      await refreshAfterAction()
    })
    setOverlay("confirm")
  }, [selectedItem, actions, activeItems.length, activeIndex, setActiveIndex, refreshAfterAction])

  const handleTagsSave = useCallback(
    async (tags: string[]) => {
      if (!selectedItem) return
      await actions.updateTags(selectedItem.id, tags)
      setOverlay("none")
      await refreshAfterAction()
    },
    [selectedItem, actions, refreshAfterAction],
  )

  // ---------------------------------------------------------------------------
  // Global keyboard handler
  // ---------------------------------------------------------------------------

  useInput(
    (input, key) => {
      // Overlays capture all input — don't process here
      if (overlay !== "none") {
        // Only handle escape for help overlay at this level
        if (overlay === "help" && (key.escape || input === "?")) {
          setOverlay("none")
        }
        return
      }

      // -----------------------------------------------------------------------
      // When the search bar is focused, only handle a small set of
      // control/meta keys. All printable characters must pass through
      // to the TextInput component.
      // -----------------------------------------------------------------------
      if (inputFocused) {
        if (key.escape) {
          setInputFocused(false)
          return
        }
        if (key.tab) {
          setInputFocused(false)
          setMode("list")
          return
        }
        if (key.ctrl && input === "s") {
          setInputFocused(false)
          void stats.refresh()
          setMode("stats")
          return
        }
        if (key.ctrl && input === "c") {
          exit()
          return
        }
        // Everything else (printable chars) is handled by TextInput
        return
      }

      // -----------------------------------------------------------------------
      // Below this point, input is NOT focused (list navigation mode)
      // -----------------------------------------------------------------------

      // Quit
      if (input === "q" || (key.ctrl && input === "c")) {
        exit()
        return
      }

      // Help
      if (input === "?") {
        setOverlay("help")
        return
      }

      // Stats mode toggle
      if (key.ctrl && input === "s") {
        if (mode === "stats") {
          setMode("search")
        } else {
          void stats.refresh()
          setMode("stats")
        }
        return
      }

      // Mode switching with Tab
      if (key.tab) {
        if (mode === "stats") {
          setMode("search")
          setInputFocused(true)
        } else {
          const nextMode = mode === "search" ? "list" : "search"
          setMode(nextMode)
          setInputFocused(nextMode === "search")
        }
        return
      }

      // Stats mode only handles the keys above
      if (mode === "stats") return

      // Search bar focus
      if (input === "/") {
        setInputFocused(true)
        return
      }

      // Escape: hide detail panel
      if (key.escape) {
        if (showDetail) {
          setShowDetail(false)
        }
        return
      }

      // Navigation
      if (key.downArrow || input === "j") {
        if (activeItems.length > 0) {
          setActiveIndex(Math.min(activeIndex + 1, activeItems.length - 1))
        }
        return
      }
      if (key.upArrow || input === "k") {
        if (activeItems.length > 0) {
          setActiveIndex(Math.max(activeIndex - 1, 0))
        }
        return
      }

      // Toggle detail panel
      if (key.return) {
        setShowDetail((prev) => !prev)
        return
      }

      // Actions on selected memory
      if (input === "p") {
        void handlePin()
        return
      }
      if (input === "a") {
        void handleArchive()
        return
      }
      if (input === "d") {
        handleDelete()
        return
      }
      if (input === "t" && selectedItem) {
        setOverlay("tags")
        return
      }

      // List-mode-only keys
      if (mode === "list") {
        if (input === "f") {
          setOverlay("filters")
          return
        }
        if (input === "s") {
          list.toggleSort()
          return
        }
      }
    },
    { isActive: overlay === "none" || overlay === "help" },
  )

  // ---------------------------------------------------------------------------
  // Error display
  // ---------------------------------------------------------------------------

  const errorMessage = actions.error || search.error || list.error

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {/* Header */}
      <Header projectId={config.projectId} mode={mode} counts={counts} />

      {/* Main content area */}
      <Box flexDirection="column" flexGrow={1}>
        {mode === "stats" ? (
          <StatsView
            stats={stats.stats}
            loading={stats.loading}
            error={stats.error}
            projectId={config.projectId}
          />
        ) : (
          <>
            {/* Search bar (search mode only) */}
            {mode === "search" && (
              <SearchBar
                value={search.query}
                onChange={search.setQuery}
                onSubmit={(q) => {
                  void search.search(q)
                  setInputFocused(false)
                }}
                isFocused={inputFocused}
                loading={search.loading}
              />
            )}

            {/* List mode header */}
            {mode === "list" && (
              <Box paddingX={1}>
                <Text bold>Memories</Text>
                <Text dimColor>
                  {" "}
                  (sorted by {list.sortBy === "created_at" ? "date" : "last accessed"})
                </Text>
                {list.loading && <Text dimColor> loading...</Text>}
              </Box>
            )}

            {/* Memory list + detail panel */}
            <Box flexGrow={1}>
              <Box flexGrow={1}>
                <MemoryList
                  items={activeItems}
                  selectedIndex={activeIndex}
                  showSimilarity={mode === "search"}
                  height={listHeight}
                />
              </Box>
              {showDetail && selectedItem && (
                <DetailPanel item={selectedItem} width={detailWidth} />
              )}
            </Box>
          </>
        )}

        {/* Overlays */}
        {overlay === "filters" && (
          <Box position="absolute" marginTop={3} marginLeft={2}>
            <FilterPanel
              filters={list.filters}
              onApply={(f) => {
                list.setFilters(f)
                setOverlay("none")
              }}
              onCancel={() => setOverlay("none")}
            />
          </Box>
        )}

        {overlay === "tags" && selectedItem && (
          <Box position="absolute" marginTop={3} marginLeft={2}>
            <TagEditor
              currentTags={selectedItem.tags}
              onSave={handleTagsSave}
              onCancel={() => setOverlay("none")}
            />
          </Box>
        )}

        {overlay === "help" && (
          <Box position="absolute" marginTop={1} marginLeft={1}>
            <HelpOverlay />
          </Box>
        )}
      </Box>

      {/* Error bar */}
      {errorMessage && (
        <Box paddingX={1}>
          <Text color="red">Error: {errorMessage}</Text>
        </Box>
      )}

      {/* Confirm dialog */}
      {overlay === "confirm" && (
        <ConfirmDialog
          message={confirmMessage}
          onConfirm={() => {
            if (confirmCallback) {
              void Promise.resolve(confirmCallback()).catch(() => {
                // Error is captured by actions.error via the run() wrapper
              })
            }
            setOverlay("none")
            setConfirmCallback(null)
          }}
          onCancel={() => {
            setOverlay("none")
            setConfirmCallback(null)
          }}
        />
      )}

      {/* Footer */}
      <Footer mode={mode} overlay={overlay} inputFocused={inputFocused} />
    </Box>
  )
}
