-- =====================================================================
--  هات الجواب — OTP signup, free credit after verification, trial game,
--  per-account "already played", and permission hardening.
--  Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
--  Run it together with deploying the new site build (see notes at the end).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) SECURITY: who can call which function
--    Supabase grants EXECUTE on public functions to PUBLIC by default,
--    so anon/authenticated could call add_credits through /rest/v1/rpc.
-- ---------------------------------------------------------------------
revoke execute on function public.add_credits(text, integer, text) from public, anon, authenticated;
grant  execute on function public.add_credits(text, integer, text) to service_role;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.start_game(text) from public, anon;
grant  execute on function public.start_game(text) to authenticated;

-- Players only ever READ their profile from the app. Remove any direct
-- write access (whatever the RLS policies say), so nobody can
-- `update profiles set credits = 999` from the browser.
-- Credits change only through the SECURITY DEFINER functions below.
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.games    from anon, authenticated;
revoke insert, update, delete on public.topups   from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) FREE CREDIT ONLY AFTER THE EMAIL IS VERIFIED
--    New profiles start with 0 credits. The 1 free credit is given once,
--    when auth.users.email_confirmed_at gets set (the OTP is entered).
--    free_granted makes sure it can never be given twice.
-- ---------------------------------------------------------------------
alter table public.profiles alter column credits set default 0;
alter table public.profiles add column if not exists free_granted boolean not null default false;
-- everyone who already exists already received their free credit under the old rules
update public.profiles set free_granted = true where free_granted = false;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare verified boolean := new.email_confirmed_at is not null;   -- e.g. confirmation turned off
begin
  insert into public.profiles (id, email, name, credits, free_granted)
  values (new.id, new.email,
          coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
          case when verified then 1 else 0 end, verified)
  on conflict (id) do nothing;
  return new;
end $function$;

create or replace function public.handle_user_verified()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.profiles
       set credits = credits + 1, free_granted = true
     where id = new.id and free_granted = false;
  end if;
  return new;
end $function$;
revoke execute on function public.handle_user_verified() from public, anon, authenticated;

drop trigger if exists on_auth_user_verified on auth.users;
create trigger on_auth_user_verified
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_verified();

-- ---------------------------------------------------------------------
-- 3) "ALREADY PLAYED" PER ACCOUNT
--    One row per (account, question). qid is the app's short fingerprint
--    of category + question + answer. Players can read their own rows and
--    add rows only through mark_played (always for themselves).
-- ---------------------------------------------------------------------
create table if not exists public.played_questions (
  user_id   uuid not null references auth.users(id) on delete cascade,
  qid       text not null check (length(qid) between 4 and 40),
  played_at timestamptz not null default now(),
  primary key (user_id, qid)
);
alter table public.played_questions enable row level security;
revoke all on public.played_questions from anon, authenticated;
grant select on public.played_questions to authenticated;
drop policy if exists "read own played" on public.played_questions;
create policy "read own played" on public.played_questions
  for select to authenticated using (user_id = auth.uid());

create or replace function public.mark_played(p_qids text[])
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare n int;
begin
  if auth.uid() is null then raise exception 'not_logged_in'; end if;
  insert into public.played_questions (user_id, qid)
  select auth.uid(), q from unnest(p_qids[1:500]) as q          -- max 500 per call
  where q is not null and length(q) between 4 and 40
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $function$;
revoke execute on function public.mark_played(text[]) from public, anon;
grant  execute on function public.mark_played(text[]) to authenticated;

-- ---------------------------------------------------------------------
-- 4) begin_game: like start_game (takes 1 credit), but also says whether
--    this is the account's FIRST game → the app uses the fixed trial set.
--    start_game stays unchanged so an old open tab keeps working.
-- ---------------------------------------------------------------------
create or replace function public.begin_game(p_mode text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare left_credits int; played_before int;
begin
  if auth.uid() is null then raise exception 'not_logged_in'; end if;
  update public.profiles p
     set credits = p.credits - 1, games_played = p.games_played + 1
    from (select games_played as before from public.profiles where id = auth.uid() for update) b
   where p.id = auth.uid() and p.credits > 0
   returning p.credits, b.before into left_credits, played_before;
  if left_credits is null then raise exception 'no_credits'; end if;
  insert into public.games (user_id, mode) values (auth.uid(), coalesce(p_mode, 'jeem'));
  return json_build_object('credits', left_credits, 'trial', played_before = 0);
end $function$;
revoke execute on function public.begin_game(text) from public, anon;
grant  execute on function public.begin_game(text) to authenticated;

commit;

-- =====================================================================
--  CHECK AFTER RUNNING (should show: anon/authenticated = false for
--  add_credits; authenticated = true for begin_game / mark_played)
-- =====================================================================
-- select p.proname,
--        has_function_privilege('anon', p.oid, 'execute')          as anon,
--        has_function_privilege('authenticated', p.oid, 'execute') as authenticated
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' order by 1;
