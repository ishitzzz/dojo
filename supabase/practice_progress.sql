-- ═══════════════════════════════════════════════════════════════
-- Practice progress (M7.1 — EXECUTE_GUIDANCE ↔ STEP_OUTCOME loop)
-- One row per reported practice-step outcome: completed / stalled /
-- skipped. plan_id matches a PracticePlan issued by
-- GET /api/practice-plan (in-memory, not a FK).
-- ═══════════════════════════════════════════════════════════════

create table if not exists practice_progress (
    id uuid primary key default gen_random_uuid(),
    plan_id text,
    user_id text not null default 'anonymous',
    topic text,
    chapter_title text,
    outcome text not null check (outcome in ('completed', 'stalled', 'skipped')),
    note text,
    created_at timestamptz not null default now()
);

create index if not exists idx_practice_progress_user on practice_progress (user_id);
create index if not exists idx_practice_progress_plan on practice_progress (plan_id);

alter table practice_progress enable row level security;

-- PRAGMATIC v1: permissive anon policies because no auth flow exists yet.
-- Anyone can read/write practice-progress rows until Supabase Auth lands;
-- tighten these to `auth.uid() = user_id` when real identities arrive.
drop policy if exists "anon can read practice_progress" on practice_progress;
create policy "anon can read practice_progress"
    on practice_progress for select
    to anon
    using (true);

drop policy if exists "anon can insert practice_progress" on practice_progress;
create policy "anon can insert practice_progress"
    on practice_progress for insert
    to anon
    with check (true);
