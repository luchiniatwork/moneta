-- Enable pgvector extension for embedding storage and similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Core table: stores all agent memories
CREATE TABLE project_memory (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        TEXT NOT NULL,

    -- The memory itself
    content           TEXT NOT NULL,
    embedding         VECTOR(1536),

    -- Attribution: who created this memory
    created_by        TEXT NOT NULL,
    engineer          TEXT,
    agent_type        TEXT,

    -- Organization
    repo              TEXT,
    tags              TEXT[] DEFAULT '{}',

    -- Lifecycle
    importance        TEXT NOT NULL DEFAULT 'normal'
                      CHECK (importance IN ('normal', 'high', 'critical')),
    pinned            BOOLEAN NOT NULL DEFAULT false,
    archived          BOOLEAN NOT NULL DEFAULT false,

    -- Timestamps
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_accessed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    access_count      INTEGER NOT NULL DEFAULT 0
);
