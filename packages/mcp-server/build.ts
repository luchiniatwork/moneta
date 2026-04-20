import { chmod, rm } from "node:fs/promises"
import { dirname, join } from "node:path"

// ---------------------------------------------------------------------------
// Build configuration
// ---------------------------------------------------------------------------

const ROOT = dirname(import.meta.filename)
const ENTRY = join(ROOT, "src/index.ts")
const OUT_DIR = join(ROOT, "dist")
const OUT_FILE = "index.js"
const SHEBANG = "#!/usr/bin/env node\n"

/**
 * npm packages to keep as external imports (installed at runtime via
 * `dependencies` in package.json). Everything else — including the
 * workspace packages `@moneta/shared` and `@moneta/api-client` — is
 * bundled inline.
 */
const EXTERNAL = [
  "@modelcontextprotocol/sdk",
  "@modelcontextprotocol/sdk/server/mcp",
  "@modelcontextprotocol/sdk/server/stdio",
  "@modelcontextprotocol/sdk/types",
  "zod",
]

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

// Clean previous output
await rm(OUT_DIR, { recursive: true, force: true })

const result = await Bun.build({
  entrypoints: [ENTRY],
  outdir: OUT_DIR,
  target: "node",
  format: "esm",
  external: EXTERNAL,
})

if (!result.success) {
  console.error("Build failed:")
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

// Prepend Node.js shebang so the binary works with `npx @luchiniatwork22/moneta-mcp-server`.
// Strip any shebang that may have survived from the source entry point first.
const outPath = join(OUT_DIR, OUT_FILE)
const raw = await Bun.file(outPath).text()
const stripped = raw.replace(/^#!.*\n/g, "")
await Bun.write(outPath, SHEBANG + stripped)
await chmod(outPath, 0o755)

console.log(`✓ MCP server built → ${outPath}`)
