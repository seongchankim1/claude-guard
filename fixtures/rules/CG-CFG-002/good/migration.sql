alter table public.users enable row level security;
create policy p on public.users for select using (auth.uid() = id);
