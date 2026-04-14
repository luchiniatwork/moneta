# ---------------------------------------------------------------------------
# Moneta API Server — Multi-stage Docker build
# ---------------------------------------------------------------------------

# Stage 1: Install dependencies
FROM oven/bun:1 AS deps
WORKDIR /app

# Copy workspace root files
COPY package.json bun.lock ./

# Copy package.json for each workspace package
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api-server/package.json packages/api-server/package.json
COPY packages/api-client/package.json packages/api-client/package.json

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Stage 2: Build / verify
FROM oven/bun:1 AS build
WORKDIR /app

COPY --from=deps /app/node_modules node_modules
COPY package.json bun.lock tsconfig.json ./
COPY packages/shared packages/shared
COPY packages/api-server packages/api-server
COPY packages/api-client packages/api-client

# Type-check to catch errors at build time
RUN bun run typecheck

# Stage 3: Runtime
FROM oven/bun:1-slim AS runtime
WORKDIR /app

# Copy only what's needed to run
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/packages/api-server packages/api-server
COPY --from=build /app/packages/api-client packages/api-client

# Default port
ENV MONETA_API_PORT=3000
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/v1/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run the API server
CMD ["bun", "run", "packages/api-server/src/index.ts"]
