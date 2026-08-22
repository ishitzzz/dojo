-- ═══════════════════════════════════════════════════════════════
-- Video feedback store
-- Raw learner signals (watch %, likes/dislikes, free-text reasons)
-- tied to a user + video, optionally scoped to a roadmap chapter.
-- Feeds the M4 dislike-invalidation loop.
-- ═══════════════════════════════════════════════════════════════

create table if not exists video_feedback (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    video_id text not null,
    chapter_key text,
    signal text not null check (signal in ('watch_pct', 'like', 'dislike', 'reason')),
    value text,
    created_at timestamptz not null default now()
);

create index if not exists idx_video_feedback_user_video on video_feedback (user_id, video_id);
create index if not exists idx_video_feedback_chapter on video_feedback (chapter_key);

alter table video_feedback enable row level security;

-- PRAGMATIC v1: permissive anon policies because no auth flow exists yet.
-- Anyone can read/write feedback rows until Supabase Auth lands; tighten
-- these to `auth.uid() = user_id` when real identities arrive.
drop policy if exists "anon can read video_feedback" on video_feedback;
create policy "anon can read video_feedback"
    on video_feedback for select
    to anon
    using (true);

drop policy if exists "anon can insert video_feedback" on video_feedback;
create policy "anon can insert video_feedback"
    on video_feedback for insert
    to anon
    with check (true);
