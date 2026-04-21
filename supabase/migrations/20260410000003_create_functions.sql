-- recall: Semantic search with optional scoping
CREATE OR REPLACE FUNCTION moneta.recall(
    p_project_id        TEXT,
    p_embedding         VECTOR(1536),
    p_limit             INT DEFAULT 10,
    p_threshold         FLOAT DEFAULT 0.3,
    p_include_archived  BOOLEAN DEFAULT false,
    p_agent             TEXT DEFAULT NULL,
    p_engineer          TEXT DEFAULT NULL,
    p_repo              TEXT DEFAULT NULL,
    p_tags              TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    id                  UUID,
    content             TEXT,
    similarity          FLOAT,
    created_by          TEXT,
    engineer            TEXT,
    repo                TEXT,
    tags                TEXT[],
    importance          TEXT,
    pinned              BOOLEAN,
    archived            BOOLEAN,
    access_count        INTEGER,
    created_at          TIMESTAMPTZ,
    last_accessed_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
SET search_path = moneta, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.content,
        (1 - (m.embedding <=> p_embedding))::FLOAT AS similarity,
        m.created_by,
        m.engineer,
        m.repo,
        m.tags,
        m.importance,
        m.pinned,
        m.archived,
        m.access_count,
        m.created_at,
        m.last_accessed_at
    FROM project_memory m
    WHERE m.project_id = p_project_id
      AND (p_include_archived OR NOT m.archived)
      AND (p_agent IS NULL    OR m.created_by = p_agent)
      AND (p_engineer IS NULL OR m.engineer = p_engineer)
      AND (p_repo IS NULL     OR m.repo = p_repo)
      AND (p_tags IS NULL     OR m.tags @> p_tags)
      AND (1 - (m.embedding <=> p_embedding)) > p_threshold
    ORDER BY m.embedding <=> p_embedding
    LIMIT p_limit;
END;
$$;

-- touch_memories: Bump access on recall hits
CREATE OR REPLACE FUNCTION moneta.touch_memories(p_ids UUID[])
RETURNS void
LANGUAGE sql
SET search_path = moneta, public
AS $$
    UPDATE project_memory
    SET last_accessed_at = now(),
        access_count = access_count + 1
    WHERE id = ANY(p_ids);
$$;

-- dedup_check: Find near-duplicate memories before insert
CREATE OR REPLACE FUNCTION moneta.dedup_check(
    p_project_id    TEXT,
    p_embedding     VECTOR(1536),
    p_threshold     FLOAT DEFAULT 0.95
)
RETURNS TABLE (
    id              UUID,
    content         TEXT,
    similarity      FLOAT,
    created_by      TEXT
)
LANGUAGE plpgsql
SET search_path = moneta, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.content,
        (1 - (m.embedding <=> p_embedding))::FLOAT AS similarity,
        m.created_by
    FROM project_memory m
    WHERE m.project_id = p_project_id
      AND NOT m.archived
      AND (1 - (m.embedding <=> p_embedding)) > p_threshold
    ORDER BY m.embedding <=> p_embedding
    LIMIT 3;
END;
$$;

-- archive_stale: Called by pg_cron daily (or manually)
CREATE OR REPLACE FUNCTION moneta.archive_stale(
    p_stale_interval INTERVAL DEFAULT INTERVAL '30 days'
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = moneta, public
AS $$
DECLARE
    affected INTEGER;
BEGIN
    UPDATE project_memory
    SET archived = true,
        updated_at = now()
    WHERE NOT pinned
      AND NOT archived
      AND last_accessed_at < now() - p_stale_interval;

    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$;
