-- ════════════════════════════════════════════════════════════════════════
-- StuffSearch — 0001_init.sql
-- Core schema: profiles, households, household_members, places, items,
-- item_history, embeddings (pgvector), and household-scoped RLS policies.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";        -- gen_random_uuid()
create extension if not exists "uuid-ossp";       -- uuid_generate_v4()
create extension if not exists "vector";          -- pgvector (1536-dim for text-embedding-3-small)
create extension if not exists "pg_trgm";         -- trigram search for fast text LIKE

-- ───────────────────────────────────────────────────────────────
-- Enums
-- ───────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'household_role') then
    create type household_role as enum ('owner', 'member');
  end if;
  if not exists (select 1 from pg_type where typname = 'supported_language') then
    create type supported_language as enum ('en', 'vi');
  end if;
  if not exists (select 1 from pg_type where typname = 'voice_provider') then
    create type voice_provider as enum ('on-device', 'whisper');
  end if;
end$$;

-- ───────────────────────────────────────────────────────────────
-- profiles  — one row per auth user (1:1 with auth.users)
-- ───────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  avatar_url      text,
  default_language supported_language default 'en',
  voice_provider  voice_provider default 'on-device',
  created_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user can read / write their own profile.
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles self upsert" on public.profiles;
create policy "profiles self upsert"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile when a new auth.users row appears.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, default_language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'language')::supported_language, 'en')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────────────────────────────────────────
-- households  — the sharing scope; owner is a member with role 'owner'
-- ───────────────────────────────────────────────────────────────
create table if not exists public.households (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  photo_url     text,
  owner_id      uuid not null references auth.users(id) on delete set null,
  invite_token  text not null unique default encode(gen_random_bytes(18), 'hex'),
  created_at    timestamptz not null default now()
);

create index if not exists households_invite_token_idx on public.households(invite_token);

alter table public.households enable row level security;

-- Helper: is the requesting user a member of this household (any role)?
create or replace function public.is_household_member(_household_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = _household_id and m.user_id = auth.uid()
  );
$$;

-- Helper: is the requesting user the OWNER of this household?
create or replace function public.is_household_owner(_household_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = _household_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

drop policy if exists "households visible to members" on public.households;
create policy "households visible to members"
  on public.households for select
  using (public.is_household_member(id));

drop policy if exists "households insert by owner" on public.households;
create policy "households insert by owner"
  on public.households for insert
  with check (auth.uid() is not null);

drop policy if exists "households update by owner" on public.households;
create policy "households update by owner"
  on public.households for update
  using (public.is_household_owner(id));

drop policy if exists "households delete by owner" on public.households;
create policy "households delete by owner"
  on public.households for delete
  using (public.is_household_owner(id));

-- ───────────────────────────────────────────────────────────────
-- household_members  — join table; PK (household_id, user_id)
-- ───────────────────────────────────────────────────────────────
create table if not exists public.household_members (
  household_id  uuid not null references public.households(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          household_role not null default 'member',
  joined_at     timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_idx on public.household_members(user_id);

alter table public.household_members enable row level security;

-- A user can read the membership rows of any household they belong to.
drop policy if exists "members visible to household members" on public.household_members;
create policy "members visible to household members"
  on public.household_members for select
  using (public.is_household_member(household_id));

-- A user can read their own memberships across households (for the switcher).
drop policy if exists "members self read" on public.household_members;
create policy "members self read"
  on public.household_members for select
  using (user_id = auth.uid());

-- Insert: the user themselves joins (via invite flow), or the owner adds them.
drop policy if exists "members self join" on public.household_members;
create policy "members self join"
  on public.household_members for insert
  with check (
    user_id = auth.uid()
    -- Owner of the household may also add other users (rare; mostly self-join).
    or public.is_household_owner(household_id)
  );

-- Update (role change / ownership transfer): owner only.
drop policy if exists "members update by owner" on public.household_members;
create policy "members update by owner"
  on public.household_members for update
  using (public.is_household_owner(household_id));

-- Delete (leave / remove): self may leave; owner may remove others.
drop policy if exists "members delete" on public.household_members;
create policy "members delete"
  on public.household_members for delete
  using (
    user_id = auth.uid()
    or public.is_household_owner(household_id)
  );

-- ───────────────────────────────────────────────────────────────
-- places  — rooms / shelves / containers within a household
-- ───────────────────────────────────────────────────────────────
create table if not exists public.places (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  name            text not null,
  description     text,
  photo_url       text,
  parent_place_id uuid references public.places(id) on delete set null,
  qr_token        text unique,  -- app-generated, nullable if identified only by external code
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists places_household_idx on public.places(household_id);
create index if not exists places_qr_token_idx on public.places(qr_token);
create index if not exists places_name_trgm_idx on public.places using gin (name gin_trgm_ops);

alter table public.places enable row level security;

drop policy if exists "places household read" on public.places;
create policy "places household read"
  on public.places for select
  using (public.is_household_member(household_id));

drop policy if exists "places household write" on public.places;
create policy "places household write"
  on public.places for insert
  with check (public.is_household_member(household_id));

drop policy if exists "places household update" on public.places;
create policy "places household update"
  on public.places for update
  using (public.is_household_member(household_id));

drop policy if exists "places household delete" on public.places;
create policy "places household delete"
  on public.places for delete
  using (public.is_household_member(household_id));

-- ───────────────────────────────────────────────────────────────
-- items  — the actual things being stored
-- ───────────────────────────────────────────────────────────────
create table if not exists public.items (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id) on delete cascade,
  name                text not null,
  description         text,
  category            text,
  photo_urls          text[] not null default '{}',
  product_link        text,
  qr_token            text unique,  -- app-generated, nullable
  current_place_id    uuid references public.places(id) on delete set null,
  current_place_since timestamptz,
  embedding           vector(1536),
  metadata            jsonb not null default '{}'::jsonb,
  created_by          uuid references auth.users(id) on delete set null,
  last_moved_by       uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists items_household_idx on public.items(household_id);
create index if not exists items_current_place_idx on public.items(current_place_id);
create index if not exists items_qr_token_idx on public.items(qr_token);
create index if not exists items_name_trgm_idx on public.items using gin (name gin_trgm_ops);
create index if not exists items_embedding_idx
  on public.items using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.items enable row level security;

drop policy if exists "items household read" on public.items;
create policy "items household read"
  on public.items for select
  using (public.is_household_member(household_id));

drop policy if exists "items household write" on public.items;
create policy "items household write"
  on public.items for insert
  with check (public.is_household_member(household_id));

drop policy if exists "items household update" on public.items;
create policy "items household update"
  on public.items for update
  using (public.is_household_member(household_id));

drop policy if exists "items household delete" on public.items;
create policy "items household delete"
  on public.items for delete
  using (public.is_household_member(household_id));

-- Auto-maintain updated_at.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists items_touch_updated_at on public.items;
create trigger items_touch_updated_at
  before update on public.items
  for each row execute function public.touch_updated_at();

-- Stamp current_place_since when current_place_id changes.
create or replace function public.touch_current_place_since()
returns trigger language plpgsql as $$
begin
  if (new.current_place_id is distinct from old.current_place_id) then
    new.current_place_since := now();
  end if;
  return new;
end;
$$;

drop trigger if exists items_touch_place_since on public.items;
create trigger items_touch_place_since
  before update of current_place_id on public.items
  for each row execute function public.touch_current_place_since();

-- ───────────────────────────────────────────────────────────────
-- item_history  — audit trail of every move (who moved what where)
-- ───────────────────────────────────────────────────────────────
create table if not exists public.item_history (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.items(id) on delete cascade,
  place_id    uuid references public.places(id) on delete set null,
  moved_by    uuid references auth.users(id) on delete set null,
  moved_at    timestamptz not null default now(),
  note        text
);

create index if not exists item_history_item_idx on public.item_history(item_id, moved_at desc);

alter table public.item_history enable row level security;

-- History is visible to members of the household that owns the item.
drop policy if exists "item_history household read" on public.item_history;
create policy "item_history household read"
  on public.item_history for select
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id and public.is_household_member(i.household_id)
    )
  );

drop policy if exists "item_history household write" on public.item_history;
create policy "item_history household write"
  on public.item_history for insert
  with check (
    exists (
      select 1 from public.items i
      where i.id = item_id and public.is_household_member(i.household_id)
    )
  );

-- ───────────────────────────────────────────────────────────────
-- Storage bucket for item / place photos
-- ───────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('stuffsearch', 'stuffsearch', true)
on conflict (id) do nothing;

-- Storage policies: a user may manage objects whose path starts with their uid
-- (we prefix object keys with the uploading user's id and the household id).
drop policy if exists "storage read authenticated" on storage.objects;
create policy "storage read authenticated"
  on storage.objects for select
  using (bucket_id = 'stuffsearch' and auth.role() = 'authenticated');

drop policy if exists "storage insert own" on storage.objects;
create policy "storage insert own"
  on storage.objects for insert
  with check (
    bucket_id = 'stuffsearch'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "storage update own" on storage.objects;
create policy "storage update own"
  on storage.objects for update
  using (
    bucket_id = 'stuffsearch'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "storage delete own" on storage.objects;
create policy "storage delete own"
  on storage.objects for delete
  using (
    bucket_id = 'stuffsearch'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
