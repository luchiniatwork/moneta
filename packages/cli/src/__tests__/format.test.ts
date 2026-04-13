import { describe, expect, it } from "bun:test"
import { age, formatTags, pad, relativeTime, shortId, truncate } from "../format.ts"

// ---------------------------------------------------------------------------
// shortId
// ---------------------------------------------------------------------------

describe("shortId", () => {
  it("returns the first 6 characters of a UUID", () => {
    expect(shortId("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe("a1b2c3")
  })

  it("handles strings shorter than 6 characters", () => {
    expect(shortId("abc")).toBe("abc")
  })

  it("handles empty string", () => {
    expect(shortId("")).toBe("")
  })
})

// ---------------------------------------------------------------------------
// relativeTime
// ---------------------------------------------------------------------------

describe("relativeTime", () => {
  it("returns 'just now' for times less than a minute ago", () => {
    const now = new Date()
    expect(relativeTime(now)).toBe("just now")
  })

  it("returns 'just now' for 30 seconds ago", () => {
    const date = new Date(Date.now() - 30 * 1000)
    expect(relativeTime(date)).toBe("just now")
  })

  it("returns minutes ago for times between 1-59 minutes", () => {
    const date = new Date(Date.now() - 5 * 60 * 1000)
    expect(relativeTime(date)).toBe("5m ago")
  })

  it("returns hours ago for times between 1-23 hours", () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000)
    expect(relativeTime(date)).toBe("3h ago")
  })

  it("returns days ago for times 24+ hours ago", () => {
    const date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    expect(relativeTime(date)).toBe("7d ago")
  })

  it("returns 1m ago at exactly 60 seconds", () => {
    const date = new Date(Date.now() - 60 * 1000)
    expect(relativeTime(date)).toBe("1m ago")
  })

  it("returns 1h ago at exactly 60 minutes", () => {
    const date = new Date(Date.now() - 60 * 60 * 1000)
    expect(relativeTime(date)).toBe("1h ago")
  })

  it("returns 1d ago at exactly 24 hours", () => {
    const date = new Date(Date.now() - 24 * 60 * 60 * 1000)
    expect(relativeTime(date)).toBe("1d ago")
  })
})

// ---------------------------------------------------------------------------
// age
// ---------------------------------------------------------------------------

describe("age", () => {
  it("returns '<1m' for times less than a minute ago", () => {
    const now = new Date()
    expect(age(now)).toBe("<1m")
  })

  it("returns minutes for times between 1-59 minutes", () => {
    const date = new Date(Date.now() - 15 * 60 * 1000)
    expect(age(date)).toBe("15m")
  })

  it("returns hours for times between 1-23 hours", () => {
    const date = new Date(Date.now() - 12 * 60 * 60 * 1000)
    expect(age(date)).toBe("12h")
  })

  it("returns days for times 24+ hours ago", () => {
    const date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    expect(age(date)).toBe("30d")
  })
})

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

describe("truncate", () => {
  it("returns the original string if within max length", () => {
    expect(truncate("hello world", 20)).toBe("hello world")
  })

  it("returns the original string if exactly at max length", () => {
    expect(truncate("hello", 5)).toBe("hello")
  })

  it("truncates with ellipsis when exceeding max length", () => {
    expect(truncate("hello world", 8)).toBe("hello...")
  })

  it("replaces newlines with spaces", () => {
    expect(truncate("hello\nworld", 20)).toBe("hello world")
  })

  it("replaces newlines and truncates", () => {
    expect(truncate("line one\nline two\nline three", 15)).toBe("line one lin...")
  })

  it("handles empty string", () => {
    expect(truncate("", 10)).toBe("")
  })

  it("handles max length of 3 (just the ellipsis)", () => {
    expect(truncate("hello", 3)).toBe("...")
  })
})

// ---------------------------------------------------------------------------
// pad
// ---------------------------------------------------------------------------

describe("pad", () => {
  it("pads a short string with spaces to the target width", () => {
    expect(pad("hi", 5)).toBe("hi   ")
  })

  it("returns the original string if already at target width", () => {
    expect(pad("hello", 5)).toBe("hello")
  })

  it("returns the original string if longer than target width", () => {
    expect(pad("hello world", 5)).toBe("hello world")
  })

  it("handles empty string", () => {
    expect(pad("", 3)).toBe("   ")
  })

  it("handles zero width", () => {
    expect(pad("hi", 0)).toBe("hi")
  })
})

// ---------------------------------------------------------------------------
// formatTags
// ---------------------------------------------------------------------------

describe("formatTags", () => {
  it("formats a list of tags with brackets", () => {
    expect(formatTags(["arch", "security"])).toBe("[arch, security]")
  })

  it("formats a single tag", () => {
    expect(formatTags(["bug"])).toBe("[bug]")
  })

  it("returns empty string for empty array", () => {
    expect(formatTags([])).toBe("")
  })
})
