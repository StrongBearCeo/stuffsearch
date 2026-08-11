-- semantic_match: cosine similarity search over item embeddings within a household.
-- Called by the semantic-search Edge Function. SECURITY DEFINER so the service
-- role can read embeddings; scoped to the passed household.
create or replace function public.semantic_match(
  _household_id uuid,
  _embedding vector(1536),
  _limit int default 20
)
returns table (
  item_id uuid,
  name text,
  description text,
  category text,
  current_place_id uuid,
  score float
)
language sql
security definer set search_path = public
stable
as $$
  select
    i.id as item_id,
    i.name,
    i.description,
    i.category,
    i.current_place_id,
    1 - (i.embedding <=> _embedding) as score
  from public.items i
  where i.household_id = _household_id
    and i.embedding is not null
  order by i.embedding <=> _embedding
  limit _limit;
$$;

grant execute on function public.semantic_match(uuid, vector(1536), int) to authenticated, service_role;
