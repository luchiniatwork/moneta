-- Add full-text search for hybrid recall (vector similarity + text matching).
--
-- Problem: Purely embedding-based search can miss exact keyword matches,
-- especially for proper names like "Patrick" which carry little semantic
-- weight in embedding models.
--
-- Solution: Add a tsvector column with a GIN index and extend the
-- recall() function to fall back to full-text matching when the embedding
-- similarity is below the threshold.

-- ---------------------------------------------------------------------------
-- 1. tsvector column + trigger
-- ---------------------------------------------------------------------------

ALTER TABLE moneta.project_memory ADD COLUMN tsv tsvector;

-- Trigger function to keep tsv in sync with content
CREATE OR REPLACE FUNCTION moneta.update_tsv()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = moneta, public
AS $$
BEGIN
    NEW.tsv := to_tsvector('english', NEW.content);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_tsv
    BEFORE INSERT OR UPDATE OF content ON moneta.project_memory
    FOR EACH ROW
    EXECUTE FUNCTION moneta.update_tsv();

-- ---------------------------------------------------------------------------
-- 2. Backfill existing rows
-- ---------------------------------------------------------------------------

UPDATE moneta.project_memory
SET tsv = to_tsvector('english', content);

-- ---------------------------------------------------------------------------
-- 3. GIN index for fast full-text lookup
-- ---------------------------------------------------------------------------

CREATE INDEX idx_memory_tsv
    ON moneta.project_memory USING gin (tsv);

-- ---------------------------------------------------------------------------
-- 4. Replace recall() with hybrid search (vector + text)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION moneta.recall(
    p_project_id        TEXT,
    p_embedding         VECTOR(1536),
    p_limit             INT DEFAULT 10,
    p_threshold         FLOAT DEFAULT 0.3,
    p_include_archived  BOOLEAN DEFAULT false,
    p_agent             TEXT DEFAULT NULL,
    p_engineer          TEXT DEFAULT NULL,
    p_repo              TEXT DEFAULT NULL,
    p_tags              TEXT[] DEFAULT NULL,
    p_query_text        TEXT DEFAULT NULL
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
      AND (
          (1 - (m.embedding <=> p_embedding)) > p_threshold
          OR (p_query_text IS NOT NULL
              AND m.tsv @@ plainto_tsquery('english', p_query_text))
      )
    ORDER BY m.embedding <=> p_embedding
    LIMIT p_limit;
END;
$$;
