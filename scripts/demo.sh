#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Moneta Demo Walkthrough
#
# Interactive script that demonstrates Moneta's core features using the
# REST API running in Docker. Each step pauses for the presenter to explain
# what is happening before continuing.
#
# Prerequisites:
#   - Docker (with compose v2)
#   - jq (for pretty-printing JSON)
#   - OPENAI_API_KEY set in the environment (or in .env alongside docker-compose.yml)
#
# Usage:
#   export OPENAI_API_KEY=sk-...
#   ./scripts/demo.sh
# ---------------------------------------------------------------------------
set -euo pipefail

API="http://localhost:3000/api/v1"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
DIM='\033[2m'
NC='\033[0m'

step() {
  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  $1${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  read -rp "  Press Enter to continue..."
  echo ""
}

note() {
  echo -e "  ${YELLOW}$1${NC}"
  echo ""
}

run() {
  # Print the command, then execute it and pretty-print the JSON output.
  echo -e "  ${DIM}\$${NC} ${BLUE}$1${NC}"
  echo ""
  eval "$1" 2>/dev/null | jq . 2>/dev/null || eval "$1" 2>/dev/null
  echo ""
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

if ! command -v docker &>/dev/null; then
  echo "Error: docker is not installed." >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq is not installed (used for pretty-printing JSON)." >&2
  exit 1
fi

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "Error: OPENAI_API_KEY is not set. Export it before running this script." >&2
  echo "  export OPENAI_API_KEY=sk-..." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Demo
# ---------------------------------------------------------------------------

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Moneta — Live Demo Walkthrough         ║${NC}"
echo -e "${GREEN}║     Shared Persistent Memory for AI Agents       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"

# ── Step 1: Start the stack ───────────────────────────────────────────────

step "Step 1 — Start the Docker stack (PostgreSQL + API server)"

note "This starts two containers: pgvector (PostgreSQL 16 + vector extensions) and the Moneta API server (Hono on Bun). Migrations run automatically."

docker compose up -d

echo ""
echo "  Waiting for services to become healthy..."
echo ""

# Wait for the API to respond (up to 60 seconds)
for i in $(seq 1 60); do
  if curl -sf "${API}/health" >/dev/null 2>&1; then
    echo -e "  ${GREEN}API server is ready.${NC}"
    break
  fi
  if [[ $i -eq 60 ]]; then
    echo "  Error: API server did not become healthy within 60 seconds." >&2
    echo "  Check logs with: docker compose logs api" >&2
    exit 1
  fi
  sleep 1
done

# ── Step 2: Health check ─────────────────────────────────────────────────

step "Step 2 — Health check"

note "Verify the server is running and see which project is configured."

run "curl -s ${API}/health"

# ── Step 3: Remember (Agent A) ───────────────────────────────────────────

step "Step 3 — Store memories from Agent A (alice/backend-dev)"

note "Two memories about backend architecture, tagged and scoped to a repo. The X-Agent-Id header identifies which agent is writing."

run "curl -s -X POST ${API}/memories/remember \\
    -H 'Content-Type: application/json' \\
    -H 'X-Agent-Id: alice/backend-dev' \\
    -d '{
      \"content\": \"The API uses Hono framework on Bun runtime for HTTP serving. Key design decision: pure function app factory pattern for testability.\",
      \"tags\": [\"architecture\", \"api\"],
      \"repo\": \"moneta\"
    }'"

run "curl -s -X POST ${API}/memories/remember \\
    -H 'Content-Type: application/json' \\
    -H 'X-Agent-Id: alice/backend-dev' \\
    -d '{
      \"content\": \"Database migrations use pgvector for semantic search with cosine distance. Embeddings are 1536-dimensional vectors from text-embedding-3-small.\",
      \"tags\": [\"database\", \"architecture\"],
      \"repo\": \"moneta\"
    }'"

# ── Step 4: Remember (Agent B) ───────────────────────────────────────────

step "Step 4 — Store a memory from Agent B (bob/frontend-dev)"

note "A different agent on the same project stores its own discovery. All agents share the same memory pool by default."

run "curl -s -X POST ${API}/memories/remember \\
    -H 'Content-Type: application/json' \\
    -H 'X-Agent-Id: bob/frontend-dev' \\
    -d '{
      \"content\": \"The CLI uses ink for terminal UI rendering with React-like components. Built with Bun bundler producing a single executable.\",
      \"tags\": [\"cli\", \"ui\"],
      \"repo\": \"moneta\"
    }'"

# ── Step 5: Recall ───────────────────────────────────────────────────────

step "Step 5 — Semantic search (recall)"

note "Ask a natural-language question. Moneta converts it to an embedding and finds the most relevant memories using cosine similarity."

run "curl -s -X POST ${API}/memories/recall \\
    -H 'Content-Type: application/json' \\
    -d '{\"question\": \"What web framework does the project use?\"}'"

# ── Step 6: Scoped recall ────────────────────────────────────────────────

step "Step 6 — Scoped recall (filter by agent)"

note "Narrow search to memories from a specific agent. You can also scope by engineer, repo, or tags."

run "curl -s -X POST ${API}/memories/recall \\
    -H 'Content-Type: application/json' \\
    -d '{
      \"question\": \"How does the API server handle HTTP requests?\",
      \"scope\": {\"agent\": \"alice/backend-dev\"}
    }'"

# ── Step 7: Deduplication ────────────────────────────────────────────────

step "Step 7 — Deduplication (same agent, similar fact)"

note "When the same agent stores a near-duplicate, Moneta detects it and updates the existing memory in place instead of creating a new one."

run "curl -s -X POST ${API}/memories/remember \\
    -H 'Content-Type: application/json' \\
    -H 'X-Agent-Id: alice/backend-dev' \\
    -d '{
      \"content\": \"The API uses Hono framework on Bun runtime for HTTP serving. Key design decision: pure function app factory for testability.\",
      \"tags\": [\"architecture\", \"api\"],
      \"repo\": \"moneta\"
    }'"

note "The response shows 'deduplicated: true' — the existing memory was updated, not duplicated."

# ── Step 8: Corroboration ────────────────────────────────────────────────

step "Step 8 — Corroboration (different agent, similar fact)"

note "When a DIFFERENT agent independently confirms the same fact, Moneta creates a new memory and adds a 'corroborated' tag. This signals higher confidence."

# Run the curl and capture the result, but display it as if using run()
CORROBORATE_CMD="curl -s -X POST ${API}/memories/remember \\
    -H 'Content-Type: application/json' \\
    -H 'X-Agent-Id: bob/frontend-dev' \\
    -d '{
      \"content\": \"The API uses Hono framework on Bun runtime for HTTP serving. Key design decision: pure function app factory for testability.\",
      \"tags\": [\"architecture\"],
      \"repo\": \"moneta\"
    }'"

echo -e "  ${DIM}\$${NC} ${BLUE}${CORROBORATE_CMD}${NC}"
echo ""

CORROBORATE_RESULT=$(curl -s -X POST ${API}/memories/remember \
    -H 'Content-Type: application/json' \
    -H 'X-Agent-Id: bob/frontend-dev' \
    -d '{
      "content": "The API uses Hono framework on Bun runtime for HTTP serving. Key design decision: pure function app factory for testability.",
      "tags": ["architecture"],
      "repo": "moneta"
    }')

echo "${CORROBORATE_RESULT}" | jq .
echo ""

CORROBORATE_ID=$(echo "${CORROBORATE_RESULT}" | jq -r '.id')

note "A new memory was created (deduplicated: false — it's from a different agent). Let's fetch it to see the 'corroborated' tag:"

run "curl -s ${API}/memories/${CORROBORATE_ID}"

# ── Step 9: Pin ──────────────────────────────────────────────────────────

step "Step 9 — Pin a critical memory"

note "Pinned memories are never automatically archived, even if stale. Use this for architectural decisions, conventions, etc."

MEMORY_ID=$(curl -s "${API}/memories?limit=1" | jq -r '.memories[0].id')

run "curl -s -X POST ${API}/memories/${MEMORY_ID}/pin"

# ── Step 10: Correct ─────────────────────────────────────────────────────

step "Step 10 — Correct a memory"

note "When information becomes stale, agents can correct it. The content and embedding are both updated."

run "curl -s -X POST ${API}/memories/${MEMORY_ID}/correct \\
    -H 'Content-Type: application/json' \\
    -H 'X-Agent-Id: alice/backend-dev' \\
    -d '{
      \"newContent\": \"The API uses Hono framework on Bun runtime. Chosen for Web Standards API compatibility, excellent performance, and small bundle size.\"
    }'"

# ── Step 11: Stats ───────────────────────────────────────────────────────

step "Step 11 — Stats overview"

note "A dashboard view of the entire memory pool: counts, top tags, per-engineer breakdown, and most accessed memories."

run "curl -s ${API}/stats"

# ── Step 12: Cleanup ─────────────────────────────────────────────────────

step "Step 12 — Cleanup"

echo "  To tear down the stack and remove all data:"
echo ""
echo -e "  ${BLUE}docker compose down -v${NC}"
echo ""
echo "  To keep the data for later, just stop without -v:"
echo ""
echo -e "  ${BLUE}docker compose down${NC}"
echo ""

echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Demo complete! Questions?            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
