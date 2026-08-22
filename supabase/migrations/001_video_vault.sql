-- ═══════════════════════════════════════════════════════════════════════════
-- VIDEO VAULT SCHEMA FOR "THE DOJO"
-- Supabase + pgvector Migration
-- 
-- Run this in Supabase SQL Editor to set up the video caching system.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Enable the pgvector extension (required for embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create the video_vault table
CREATE TABLE IF NOT EXISTS video_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Core video identification
    video_id VARCHAR(11) UNIQUE NOT NULL,  -- YouTube video IDs are 11 chars
    title TEXT NOT NULL,
    description TEXT,
    transcript_snippet TEXT,  -- First ~2000 chars of transcript for analysis
    
    -- Embeddings for semantic search (1536 dimensions for OpenAI embeddings)
    -- Can also use 768 for smaller models like all-MiniLM-L6-v2
    embedding vector(1536),
    
    -- Density scoring (our custom ranking system)
    density_score FLOAT DEFAULT 0,
    density_flags TEXT[] DEFAULT '{}',  -- Array of flags like 'GitHub Link', 'Deep Dive'
    
    -- Flexible metadata storage
    metadata JSONB DEFAULT '{}',
    -- Example metadata structure:
    -- {
    --   "duration_seconds": 1234,
    --   "author": "Channel Name",
    --   "views": 50000,
    --   "fetched_at": "2024-01-15T12:00:00Z",
    --   "query_used": "react hooks tutorial",
    --   "user_role": "Student",
    --   "experience_level": "Deep Dive"
    -- }
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_video_vault_video_id ON video_vault(video_id);
CREATE INDEX IF NOT EXISTS idx_video_vault_density_score ON video_vault(density_score DESC);
CREATE INDEX IF NOT EXISTS idx_video_vault_metadata ON video_vault USING GIN(metadata);

-- 4. Create a vector similarity search index (using IVFFlat for performance)
-- Note: You need at least 1000 rows for IVFFlat to work well
-- For smaller datasets, you can use exact search without this index
CREATE INDEX IF NOT EXISTS idx_video_vault_embedding ON video_vault 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 5. Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create trigger for auto-updating timestamps
DROP TRIGGER IF EXISTS video_vault_updated_at ON video_vault;
CREATE TRIGGER video_vault_updated_at
    BEFORE UPDATE ON video_vault
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- 7. Create a function for semantic similarity search
CREATE OR REPLACE FUNCTION match_videos(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.8,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    video_id VARCHAR(11),
    title TEXT,
    description TEXT,
    density_score FLOAT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.id,
        v.video_id,
        v.title,
        v.description,
        v.density_score,
        1 - (v.embedding <=> query_embedding) AS similarity
    FROM video_vault v
    WHERE v.embedding IS NOT NULL
      AND 1 - (v.embedding <=> query_embedding) > match_threshold
    ORDER BY v.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 8. Create a function to find videos by query metadata
CREATE OR REPLACE FUNCTION find_cached_video(
    search_query TEXT,
    search_role TEXT,
    search_experience TEXT
)
RETURNS TABLE (
    video_id VARCHAR(11),
    title TEXT,
    density_score FLOAT,
    density_flags TEXT[],
    metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.video_id,
        v.title,
        v.density_score,
        v.density_flags,
        v.metadata
    FROM video_vault v
    WHERE v.metadata->>'query_used' ILIKE '%' || search_query || '%'
      AND (search_role IS NULL OR v.metadata->>'user_role' = search_role)
      AND (search_experience IS NULL OR v.metadata->>'experience_level' = search_experience)
    ORDER BY v.density_score DESC
    LIMIT 1;
END;
$$;

-- 9. Create query_cache table for faster lookups
CREATE TABLE IF NOT EXISTS query_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- The search query details
    query_hash VARCHAR(64) UNIQUE NOT NULL,  -- SHA256 hash of normalized query
    query_text TEXT NOT NULL,
    user_role VARCHAR(50),
    experience_level VARCHAR(50),
    
    -- Mapping to the best video
    video_id VARCHAR(11) REFERENCES video_vault(video_id) ON DELETE CASCADE,
    
    -- Cache metadata
    hit_count INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_hit TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_query_cache_hash ON query_cache(query_hash);
CREATE INDEX IF NOT EXISTS idx_query_cache_video ON query_cache(video_id);

-- 10. Create a function to log cache hits
CREATE OR REPLACE FUNCTION log_cache_hit(cache_hash VARCHAR(64))
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE query_cache
    SET hit_count = hit_count + 1,
        last_hit = NOW()
    WHERE query_hash = cache_hash;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SAMPLE DATA (Optional - for testing)
-- ═══════════════════════════════════════════════════════════════════════════

-- INSERT INTO video_vault (video_id, title, description, density_score, density_flags, metadata)
-- VALUES (
--     'dQw4w9WgXcQ',
--     'Sample Technical Video',
--     'A comprehensive tutorial with GitHub repo: https://github.com/example/repo',
--     75,
--     ARRAY['🔗 GitHub Link', '⏱️ Deep Dive (15+ min)'],
--     '{"duration_seconds": 1234, "author": "Tech Channel", "views": 50000, "query_used": "react tutorial"}'::jsonb
-- );

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPFUL QUERIES
-- ═══════════════════════════════════════════════════════════════════════════

-- Get top videos by density score:
-- SELECT video_id, title, density_score, density_flags 
-- FROM video_vault 
-- ORDER BY density_score DESC 
-- LIMIT 10;

-- Find videos with GitHub links:
-- SELECT video_id, title, description 
-- FROM video_vault 
-- WHERE description ILIKE '%github.com%';

-- Semantic search (requires embeddings):
-- SELECT * FROM match_videos(
--     '[0.1, 0.2, ...]'::vector,  -- Your query embedding
--     0.85,  -- Similarity threshold
--     5      -- Max results
-- );
