import { describe, expect, it } from "bun:test"
import { parseAgentId } from "../identity.ts"

describe("parseAgentId", () => {
  describe("human agents", () => {
    it("parses alice/code-reviewer", () => {
      const result = parseAgentId("alice/code-reviewer")
      expect(result).toEqual({
        createdBy: "alice/code-reviewer",
        engineer: "alice",
        agentType: "code-reviewer",
      })
    })

    it("parses bob/architect", () => {
      const result = parseAgentId("bob/architect")
      expect(result).toEqual({
        createdBy: "bob/architect",
        engineer: "bob",
        agentType: "architect",
      })
    })
  })

  describe("autonomous agents", () => {
    it("parses auto/ci-fixer with null engineer", () => {
      const result = parseAgentId("auto/ci-fixer")
      expect(result).toEqual({
        createdBy: "auto/ci-fixer",
        engineer: null,
        agentType: "ci-fixer",
      })
    })

    it("parses auto/dependency-updater", () => {
      const result = parseAgentId("auto/dependency-updater")
      expect(result).toEqual({
        createdBy: "auto/dependency-updater",
        engineer: null,
        agentType: "dependency-updater",
      })
    })
  })

  describe("whitespace handling", () => {
    it("trims leading/trailing whitespace", () => {
      const result = parseAgentId("  alice/reviewer  ")
      expect(result).toEqual({
        createdBy: "alice/reviewer",
        engineer: "alice",
        agentType: "reviewer",
      })
    })
  })

  describe("invalid formats", () => {
    it("throws on empty string", () => {
      expect(() => parseAgentId("")).toThrow("must not be empty")
    })

    it("throws on whitespace-only string", () => {
      expect(() => parseAgentId("   ")).toThrow("must not be empty")
    })

    it("throws on string without separator", () => {
      expect(() => parseAgentId("alice")).toThrow('must contain a "/"')
    })

    it("throws on empty prefix", () => {
      expect(() => parseAgentId("/reviewer")).toThrow("engineer/prefix before")
    })

    it("throws on empty suffix", () => {
      expect(() => parseAgentId("alice/")).toThrow("agent-type after")
    })

    it("throws on multiple slashes", () => {
      expect(() => parseAgentId("alice/team/reviewer")).toThrow('exactly one "/"')
    })
  })
})
