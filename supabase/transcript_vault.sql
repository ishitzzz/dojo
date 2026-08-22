-- ═══════════════════════════════════════════════════════════════
-- Transcript Forge vault
-- Durable cache for YouTube transcripts (positive results + negative
-- "verified caption-less" tombstones). Keyed by video + language.
-- ═══════════════════════════════════════════════════════════════

create table if not exists transcript_vault (
    id uuid primary key default gen_random_uuid(),
    video_id text not null,
    lang text not null default 'default',
    payload jsonb,
    source text,
    tombstone boolean not null default false,
    stored_at timestamptz not null default now(),
    unique (video_id, lang)
);

create index if not exists idx_transcript_vault_video on transcript_vault (video_id);
create index if not exists idx_transcript_vault_stored_at on transcript_vault (stored_at);

-- Optional: purge stale tombstones / old rows periodically.
-- select cron.schedule('purge-transcript-vault', '0 4 * * *', $$
--     delete from transcript_vault where stored_at < now() - interval '45 days';
-- $$);
