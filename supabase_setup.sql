-- ═══════════════════════════════════════════════════════════════
-- DOJO V3: NEXUS SCHEMA
-- The Knowledge Territory - Infinite Graph Storage
-- ═══════════════════════════════════════════════════════════════

-- Enable pgvector extension for embedding searches (future proofing)
create extension if not exists vector;

-- ═══════════════════════════════════════════════════════════════
-- TABLE: knowledge_nodes
-- Individual nodes on the infinite canvas
-- ═══════════════════════════════════════════════════════════════
create table public.knowledge_nodes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  
  -- Content
  title text not null,
  summary text,
  atomic_truths jsonb default '[]'::jsonb,  -- Array of 3 core truths
  
  -- Video Association
  video_id text,
  anchor_channel text,
  
  -- Canvas Position
  position_x float default 0,
  position_y float default 0,
  
  -- Node State
  status text default 'ghost' check (status in ('ghost', 'active', 'mastered')),
  
  -- Hierarchy
  parent_id uuid references public.knowledge_nodes(id) on delete set null,
  origin_topic text,  -- The original user query that spawned this tree
  
  -- Metadata
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for faster user-based queries
create index idx_knowledge_nodes_user_id on public.knowledge_nodes(user_id);
create index idx_knowledge_nodes_origin_topic on public.knowledge_nodes(origin_topic);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: node_edges
-- Connections between nodes (the "web")
-- ═══════════════════════════════════════════════════════════════
create table public.node_edges (
  id uuid default gen_random_uuid() primary key,
  source_id uuid references public.knowledge_nodes(id) on delete cascade not null,
  target_id uuid references public.knowledge_nodes(id) on delete cascade not null,
  
  -- Edge Type
  edge_type text default 'deep_dive' check (edge_type in ('deep_dive', 'prerequisite', 'tangent', 'bridge')),
  label text,  -- e.g., "Why?", "How?", "Related"
  
  -- Metadata
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Prevent duplicate edges
  constraint node_edges_unique unique (source_id, target_id)
);

-- Index for graph traversal
create index idx_node_edges_source on public.node_edges(source_id);
create index idx_node_edges_target on public.node_edges(target_id);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: user_progress
-- Track mastery and telemetry per node
-- ═══════════════════════════════════════════════════════════════
create table public.user_progress (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  node_id uuid references public.knowledge_nodes(id) on delete cascade not null,
  
  -- Progress
  feynman_passed boolean default false,
  confusion_count int default 0,  -- Rewind telemetry
  time_spent_seconds int default 0,
  
  -- Timestamps
  started_at timestamp with time zone default timezone('utc'::text, now()),
  completed_at timestamp with time zone,
  
  -- Unique constraint
  constraint user_progress_unique unique (user_id, node_id)
);

-- Index for user progress queries
create index idx_user_progress_user_id on public.user_progress(user_id);

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════

-- Enable RLS
alter table public.knowledge_nodes enable row level security;
alter table public.node_edges enable row level security;
alter table public.user_progress enable row level security;

-- Policies for knowledge_nodes
create policy "Users can view their own nodes"
  on public.knowledge_nodes for select
  using (auth.uid() = user_id);

create policy "Users can insert their own nodes"
  on public.knowledge_nodes for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own nodes"
  on public.knowledge_nodes for update
  using (auth.uid() = user_id);

-- Policies for node_edges (based on source node ownership)
create policy "Users can view edges for their nodes"
  on public.node_edges for select
  using (
    exists (
      select 1 from public.knowledge_nodes
      where id = source_id and user_id = auth.uid()
    )
  );

create policy "Users can insert edges for their nodes"
  on public.node_edges for insert
  with check (
    exists (
      select 1 from public.knowledge_nodes
      where id = source_id and user_id = auth.uid()
    )
  );

-- Policies for user_progress
create policy "Users can view their own progress"
  on public.user_progress for select
  using (auth.uid() = user_id);

create policy "Users can insert their own progress"
  on public.user_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own progress"
  on public.user_progress for update
  using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════
-- SERVICE ROLE BYPASS (for API routes)
-- ═══════════════════════════════════════════════════════════════

-- Allow service role to bypass RLS for all tables
create policy "Service role bypass for knowledge_nodes"
  on public.knowledge_nodes for all
  using (auth.role() = 'service_role');

create policy "Service role bypass for node_edges"
  on public.node_edges for all
  using (auth.role() = 'service_role');

create policy "Service role bypass for user_progress"
  on public.user_progress for all
  using (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- LEGACY: Keep video_vault for Hidden Gem caching
-- ═══════════════════════════════════════════════════════════════
create table if not exists public.video_vault (
  id bigint generated by default as identity primary key,
  video_id text not null,
  title text not null,
  description text,
  transcript_snippet text,
  density_score numeric default 0,
  density_flags text[],
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  constraint video_vault_video_id_key unique (video_id)
);

alter table public.video_vault enable row level security;

create policy "Enable read access for all users"
  on public.video_vault for select
  using (true);

create policy "Enable insert for service role"
  on public.video_vault for insert
  with check (true);

create index if not exists idx_video_vault_video_id on public.video_vault (video_id);
