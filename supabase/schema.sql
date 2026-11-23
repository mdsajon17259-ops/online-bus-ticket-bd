-- =============================================================================
-- Multi-Counter Bus Ticket Booking Platform — Supabase PostgreSQL Schema
-- Run this script in your Supabase Project -> SQL Editor
-- =============================================================================

-- Enable pgcrypto for UUID generation and password hashing
create extension if not exists "pgcrypto";

-- 1. APP SETTINGS TABLE (Dynamic Branding)
create table if not exists public.app_settings (
  id integer primary key default 1,
  organization_name text not null default 'দেশ ভ্রমণ / Desh Travels',
  organization_logo_url text not null default '',
  updated_at timestamptz not null default now(),
  constraint single_settings_row check (id = 1)
);

-- 2. COUNTERS TABLE (Bus Operators / Counters)
create table if not exists public.counters (
  id uuid primary key default gen_random_uuid(),
  counter_name text not null,
  phone text not null,
  address text not null,
  logo_url text default '',
  created_at timestamptz not null default now()
);

-- 3. PROFILES TABLE (Role-Based Access Control linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  phone text not null default '',
  role text not null default 'user' check (role in ('user', 'counter_admin', 'counter_representative', 'super_admin')),
  counter_id uuid references public.counters(id) on delete set null,
  token_version integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name text not null default '';
alter table public.profiles add column if not exists phone text not null default '';
alter table public.profiles add column if not exists token_version integer not null default 1;

-- Safely upgrade existing role check constraint to include counter_representative
do $$
declare
  v_constraint_name text;
begin
  select c.conname into v_constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'profiles'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%role%';

  if v_constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', v_constraint_name);
  end if;

  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('user', 'counter_admin', 'counter_representative', 'super_admin'));
exception
  when duplicate_object then null;
end $$;

-- 4. TRIPS TABLE (Schedules & Routes per Counter)
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  counter_id uuid not null references public.counters(id) on delete cascade,
  route_from text not null,
  route_to text not null,
  departure_time timestamptz not null,
  bus_type text not null default 'এসি এক্সপ্রেস কোচ',
  price numeric(10, 2) not null check (price >= 0),
  total_seats integer not null default 36 check (total_seats > 0 and total_seats <= 60),
  created_at timestamptz not null default now()
);

-- 5. SEATS TABLE (Individual Seat Inventory per Trip)
create table if not exists public.seats (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  seat_number text not null,
  status text not null default 'available' check (status in ('available', 'booked')),
  unique (trip_id, seat_number)
);

-- 6. BOOKINGS TABLE (Passenger Ticket Requests)
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  passenger_name text not null,
  phone text not null,
  boarding_point text not null default '',
  selected_seats text[] not null,
  total_fare numeric(10, 2) not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.bookings add column if not exists user_id uuid references auth.users(id) on delete set null;

-- 7. PASSWORD RESET AUDIT LOGS TABLE
create table if not exists public.password_reset_logs (
  id uuid primary key default gen_random_uuid(),
  counter_id uuid references public.counters(id) on delete set null,
  counter_name text not null,
  target_role text not null check (target_role in ('counter_admin', 'counter_representative')),
  target_username text not null,
  reset_by text not null,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- HELPER FUNCTIONS & TRIGGERS
-- =============================================================================

-- Automatically generate seat rows when a new trip is created (4-column layout A1..D9)
create or replace function public.generate_seats_for_trip()
returns trigger
language plpgsql
security definer
as $$
declare
  rows_count integer;
  cols text[] := array['A', 'B', 'C', 'D'];
  r integer;
  c integer;
  seat_idx integer := 0;
begin
  rows_count := ceil(new.total_seats::numeric / 4);
  for r in 1..rows_count loop
    for c in 1..4 loop
      seat_idx := seat_idx + 1;
      if seat_idx <= new.total_seats then
        insert into public.seats (trip_id, seat_number, status)
        values (new.id, cols[c] || r::text, 'available');
      end if;
    end loop;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_generate_seats on public.trips;
create trigger trg_generate_seats
after insert on public.trips
for each row
execute function public.generate_seats_for_trip();

-- Automatically sync profiles row when auth.users is created (supports Master Super Admin & Passenger signup)
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_full_name text;
  v_phone text;
begin
  if lower(new.email) = 'sajonvip@deshtravels.bd' then
    insert into public.profiles (id, email, full_name, phone, role, counter_id)
    values (new.id, 'Sajonvip', 'মাস্টার সুপার অ্যাডমিন', '', 'super_admin', null)
    on conflict (id) do update
      set email = 'Sajonvip',
          full_name = 'মাস্টার সুপার অ্যাডমিন',
          role = 'super_admin',
          counter_id = null;
    return new;
  end if;

  v_username := coalesce(nullif(new.raw_user_meta_data->>'username', ''), new.email);
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', '');
  v_phone := coalesce(new.raw_user_meta_data->>'phone', '');

  -- Only auto-create standard 'user' profiles from public signup metadata;
  -- counter_admin and counter_representative profiles are explicitly created by Master Super Admin.
  if coalesce(new.raw_user_meta_data->>'role', 'user') = 'user' then
    insert into public.profiles (id, email, full_name, phone, role, counter_id)
    values (new.id, v_username, v_full_name, v_phone, 'user', null)
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

-- Atomic passenger booking submission (marks seats booked + creates pending booking)
create or replace function public.submit_booking(
  p_trip_id uuid,
  p_passenger_name text,
  p_phone text,
  p_boarding_point text,
  p_selected_seats text[]
)
returns public.bookings
language plpgsql
security definer
as $$
declare
  v_price numeric;
  v_avail_count integer;
  v_booking public.bookings;
begin
  select price into v_price from public.trips where id = p_trip_id;
  if v_price is null then
    raise exception 'Trip not found';
  end if;

  -- Lock selected seats and verify availability
  select count(*) into v_avail_count
  from public.seats
  where trip_id = p_trip_id
    and seat_number = any(p_selected_seats)
    and status = 'available'
  for update;

  if v_avail_count <> array_length(p_selected_seats, 1) then
    raise exception 'One or more selected seats are no longer available';
  end if;

  -- Reserve seats immediately as pending/booked
  update public.seats
  set status = 'booked'
  where trip_id = p_trip_id
    and seat_number = any(p_selected_seats);

  insert into public.bookings (
    trip_id, user_id, passenger_name, phone, boarding_point, selected_seats, total_fare, status
  ) values (
    p_trip_id, auth.uid(), p_passenger_name, p_phone, p_boarding_point, p_selected_seats,
    v_price * array_length(p_selected_seats, 1), 'pending'
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

-- Helper to check current user's role & counter_id
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_counter_id()
returns uuid
language sql
stable
security definer
as $$
  select counter_id from public.profiles where id = auth.uid();
$$;

-- System-wide username uniqueness check across Admin, Counters, Representatives & Profiles
create or replace function public.is_username_available(p_username text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clean text := lower(trim(coalesce(p_username, '')));
begin
  if v_clean = '' or v_clean = 'sajonvip' then
    return false;
  end if;

  return not exists (
    select 1 from public.profiles where lower(trim(email)) = v_clean
  );
end;
$$;

-- Super Admin Recovery: Reset Counter or Representative password, invalidate old sessions, and write audit log
create or replace function public.admin_reset_account_password(
  p_counter_id uuid,
  p_target_role text,
  p_new_password text
)
returns public.password_reset_logs
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_role text;
  v_caller_username text;
  v_profile public.profiles;
  v_counter_name text;
  v_log public.password_reset_logs;
begin
  select role, email into v_caller_role, v_caller_username
  from public.profiles
  where id = auth.uid();

  if v_caller_role <> 'super_admin' then
    raise exception 'শুধুমাত্র মাস্টার সুপার অ্যাডমিন পাসওয়ার্ড রিসেট করতে পারবেন';
  end if;

  if p_target_role not in ('counter_admin', 'counter_representative') then
    raise exception 'অবৈধ অ্যাকাউন্ট রোল';
  end if;

  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে';
  end if;

  select * into v_profile
  from public.profiles
  where counter_id = p_counter_id
    and role = p_target_role
  order by created_at asc
  limit 1;

  if v_profile.id is null then
    raise exception 'এই কাউন্টারে নির্ধারিত অ্যাকাউন্ট পাওয়া যায়নি';
  end if;

  select counter_name into v_counter_name
  from public.counters
  where id = p_counter_id;

  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  where id = v_profile.id;

  -- Invalidate all active sessions for the reset account
  begin
    delete from auth.sessions where user_id = v_profile.id;
  exception
    when others then null;
  end;

  update public.profiles
  set token_version = token_version + 1
  where id = v_profile.id;

  insert into public.password_reset_logs (
    counter_id,
    counter_name,
    target_role,
    target_username,
    reset_by
  ) values (
    p_counter_id,
    coalesce(v_counter_name, 'কাউন্টার'),
    p_target_role,
    v_profile.email,
    coalesce(v_caller_username, 'Sajonvip')
  )
  returning * into v_log;

  return v_log;
end;
$$;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

alter table public.app_settings enable row level security;
alter table public.counters enable row level security;
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.seats enable row level security;
alter table public.bookings enable row level security;
alter table public.password_reset_logs enable row level security;

-- app_settings: Public read, Super Admin write
drop policy if exists "Public read app_settings" on public.app_settings;
create policy "Public read app_settings" on public.app_settings for select using (true);
drop policy if exists "Super Admin update app_settings" on public.app_settings;
create policy "Super Admin update app_settings" on public.app_settings for all
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

-- counters: Public read, Super Admin write
drop policy if exists "Public read counters" on public.counters;
create policy "Public read counters" on public.counters for select using (true);
drop policy if exists "Super Admin manage counters" on public.counters;
create policy "Super Admin manage counters" on public.counters for all
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

-- trips: Public read, Super Admin & owning Counter Admin manage (Representatives have NO write permissions)
drop policy if exists "Public read trips" on public.trips;
create policy "Public read trips" on public.trips for select using (true);
drop policy if exists "Admin manage trips" on public.trips;
create policy "Admin manage trips" on public.trips for all
  using (
    public.current_user_role() = 'super_admin'
    or (public.current_user_role() = 'counter_admin' and counter_id = public.current_user_counter_id())
  )
  with check (
    public.current_user_role() = 'super_admin'
    or (public.current_user_role() = 'counter_admin' and counter_id = public.current_user_counter_id())
  );

-- seats: Public read, Super Admin & owning Counter Admin update (Representatives cannot write)
drop policy if exists "Public read seats" on public.seats;
create policy "Public read seats" on public.seats for select using (true);
drop policy if exists "Admin manage seats" on public.seats;
create policy "Admin manage seats" on public.seats for update
  using (
    public.current_user_role() = 'super_admin'
    or (
      public.current_user_role() = 'counter_admin'
      and exists (
        select 1 from public.trips t
        where t.id = seats.trip_id and t.counter_id = public.current_user_counter_id()
      )
    )
  )
  with check (
    public.current_user_role() = 'super_admin'
    or (
      public.current_user_role() = 'counter_admin'
      and exists (
        select 1 from public.trips t
        where t.id = seats.trip_id and t.counter_id = public.current_user_counter_id()
      )
    )
  );

-- bookings: Authenticated insert, scoped read/update (Representatives strictly read-only)
drop policy if exists "Public create booking" on public.bookings;
create policy "Public create booking" on public.bookings for insert
  with check (auth.uid() is not null);
drop policy if exists "Public read bookings" on public.bookings;
create policy "Public read bookings" on public.bookings for select using (true);
drop policy if exists "Counter Admin update own bookings" on public.bookings;
create policy "Counter Admin update own bookings" on public.bookings for update
  using (
    public.current_user_role() = 'super_admin'
    or (
      public.current_user_role() = 'counter_admin'
      and exists (
        select 1 from public.trips t
        where t.id = bookings.trip_id and t.counter_id = public.current_user_counter_id()
      )
    )
  );

-- profiles: Users read own profile, self-signup insert for 'user', Super Admin manages all
drop policy if exists "Read own profile or Super Admin" on public.profiles;
create policy "Read own profile or Super Admin" on public.profiles for select
  using (id = auth.uid() or public.current_user_role() = 'super_admin');
drop policy if exists "Users insert own passenger profile" on public.profiles;
create policy "Users insert own passenger profile" on public.profiles for insert
  with check (id = auth.uid() and role = 'user');
drop policy if exists "Super Admin manage profiles" on public.profiles;
create policy "Super Admin manage profiles" on public.profiles for all
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

-- password_reset_logs: Super Admin only
drop policy if exists "Super Admin read reset logs" on public.password_reset_logs;
create policy "Super Admin read reset logs" on public.password_reset_logs for select
  using (public.current_user_role() = 'super_admin');
drop policy if exists "Super Admin insert reset logs" on public.password_reset_logs;
create policy "Super Admin insert reset logs" on public.password_reset_logs for insert
  with check (public.current_user_role() = 'super_admin');

-- Initial Default Branding Seed
insert into public.app_settings (id, organization_name, organization_logo_url)
values (1, 'দেশ ভ্রমণ / Desh Travels', '')
on conflict (id) do update
  set organization_name = coalesce(nullif(public.app_settings.organization_name, ''), 'দেশ ভ্রমণ / Desh Travels');

-- =============================================================================
-- SEED MASTER SUPER ADMIN IN SUPABASE AUTH (Username: Sajonvip / Pass: Sajon2001M)
-- =============================================================================
do $$
declare
  v_admin_id uuid;
begin
  select id into v_admin_id
  from auth.users
  where lower(email) = 'sajonvip@deshtravels.bd'
  limit 1;

  if v_admin_id is null then
    v_admin_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_admin_id,
      'authenticated',
      'authenticated',
      'sajonvip@deshtravels.bd',
      crypt('Sajon2001M', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"username":"Sajonvip","full_name":"মাস্টার সুপার অ্যাডমিন"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    insert into auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      v_admin_id,
      v_admin_id::text,
      jsonb_build_object(
        'sub', v_admin_id::text,
        'email', 'sajonvip@deshtravels.bd',
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(),
      now(),
      now()
    );
  else
    update auth.users
    set encrypted_password = crypt('Sajon2001M', gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = v_admin_id;
  end if;

  insert into public.profiles (id, email, full_name, phone, role, counter_id)
  values (v_admin_id, 'Sajonvip', 'মাস্টার সুপার অ্যাডমিন', '', 'super_admin', null)
  on conflict (id) do update
    set email = 'Sajonvip',
        full_name = 'মাস্টার সুপার অ্যাডমিন',
        role = 'super_admin',
        counter_id = null;
exception
  when others then
    raise notice 'Master Super Admin auto-seed skipped (%). Ensure user sajonvip@deshtravels.bd exists in Auth.', sqlerrm;
end $$;
