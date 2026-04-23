import { chmod, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { BunPlugin } from "bun"

// ---------------------------------------------------------------------------
// Build configuration
// ---------------------------------------------------------------------------

const ROOT = dirname(import.meta.filename)
const ENTRY = join(ROOT, "src/index.ts")
const OUT_DIR = join(ROOT, "dist")
const OUT_FILE = "index.js"
const SHEBANG = "#!/usr/bin/env node\n"

// ---------------------------------------------------------------------------
// MCP SDK resolution plugin
//
// The MCP SDK uses a wildcard `exports` entry (`./*` → `./dist/esm/*`)
// that omits the `.js` extension. This breaks both Bun's bundler and
// Node.js ESM resolution. The plugin intercepts SDK subpath imports and
// resolves them to the concrete `.js` files so they can be bundled.
// ---------------------------------------------------------------------------

const mcpSdkPlugin: BunPlugin = {
  name: "resolve-mcp-sdk-wildcard",
  setup(build) {
    build.onResolve({ filter: /^@modelcontextprotocol\/sdk\/.+/ }, (args) => {
      const subpath = args.path.replace("@modelcontextprotocol/sdk/", "")
      const sdkDir = join(ROOT, "node_modules", "@modelcontextprotocol", "sdk")
      return { path: join(sdkDir, "dist", "esm", `${subpath}.js`) }
    })
  },
}

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
  plugins: [mcpSdkPlugin],
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
