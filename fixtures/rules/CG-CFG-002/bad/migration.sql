alter table public.users disable row level security;
create policy p on public.users for select using (true);
