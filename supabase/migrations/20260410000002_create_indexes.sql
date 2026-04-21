-- Semantic search: HNSW for fast approximate nearest neighbor
CREATE INDEX idx_memory_embedding
    ON moneta.project_memory USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Active memories per project (the hot path)
CREATE INDEX idx_memory_project_active
    ON moneta.project_memory (project_id)
    WHERE NOT archived;

-- Tag filtering
CREATE INDEX idx_memory_tags
    ON moneta.project_memory USING gin (tags);

-- Archival reaper: find stale, unpinned, unarchived memories
CREATE INDEX idx_memory_archival_candidates
    ON moneta.project_memory (last_accessed_at)
    WHERE NOT pinned AND NOT archived;

-- Attribution lookups
CREATE INDEX idx_memory_created_by
    ON moneta.project_memory (created_by);

-- Repo scoping
CREATE INDEX idx_memory_repo
    ON moneta.project_memory (repo)
    WHERE repo IS NOT NULL;
