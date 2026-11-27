-- =============================================================================
-- Multi-Counter Bus Ticket Booking Platform — Supabase PostgreSQL Schema
-- Run this script in your Supabase Project -> SQL Editor
-- =============================================================================

-- Enable pgcrypto for UUID generation, random tokens, and bcrypt password hashing
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

-- 3. CUSTOM STAFF ACCOUNTS TABLE (Exact Usernames + Hashed Passwords — No Fake Emails / No Auth SignUp)
create table if not exists public.staff_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  full_name text not null default '',
  phone text not null default '',
  role text not null check (role in ('user', 'counter_admin', 'counter_representative', 'super_admin')),
  counter_id uuid references public.counters(id) on delete cascade,
  token_version integer not null default 1,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_staff_accounts_username_lower
  on public.staff_accounts (lower(trim(username)));

-- Ensure existing staff_accounts role constraint supports 'user' as well
do $$
declare
  v_constraint_name text;
begin
  select c.conname into v_constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'staff_accounts'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%role%';

  if v_constraint_name is not null then
    execute format('alter table public.staff_accounts drop constraint %I', v_constraint_name);
  end if;

  alter table public.staff_accounts
    add constraint staff_accounts_role_check
    check (role in ('user', 'counter_admin', 'counter_representative', 'super_admin'));
exception
  when duplicate_object then null;
end $$;

-- 4. CUSTOM STAFF SESSIONS TABLE (Token-based DB Session Verification & Invalidation)
create table if not exists public.staff_sessions (
  token text primary key,
  staff_id uuid not null references public.staff_accounts(id) on delete cascade,
  token_version integer not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- 5. PASSENGER PROFILES TABLE (Passenger Auth Profiles)
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

-- 6. TRIPS TABLE (Schedules & Routes per Counter)
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

-- 7. SEATS TABLE (Individual Seat Inventory per Trip)
create table if not exists public.seats (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  seat_number text not null,
  status text not null default 'available' check (status in ('available', 'booked')),
  unique (trip_id, seat_number)
);

-- 8. BOOKINGS TABLE (Passenger Ticket Requests)
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  passenger_name text not null,
  phone text not null,
  boarding_point text not null default '',
  selected_seats text[] not null,
  total_fare numeric(10, 2) not null,
  payment_method text not null default '',
  trx_id text not null default '',
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.bookings add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.bookings add column if not exists payment_method text not null default '';
alter table public.bookings add column if not exists trx_id text not null default '';

-- 9. PASSWORD RESET AUDIT LOGS TABLE
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

-- Passenger signup trigger (only creates standard 'user' profile on passenger auth signup)
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
  v_username := coalesce(nullif(new.raw_user_meta_data->>'username', ''), new.email);
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', '');
  v_phone := coalesce(new.raw_user_meta_data->>'phone', '');

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

-- Atomic passenger booking submission (supports direct guest booking without login)
drop function if exists public.submit_booking(uuid, text, text, text, text[]);
drop function if exists public.submit_booking(uuid, text, text, text, text[], text, text);
create or replace function public.submit_booking(
  p_trip_id uuid,
  p_passenger_name text,
  p_phone text,
  p_boarding_point text,
  p_selected_seats text[],
  p_payment_method text default '',
  p_trx_id text default ''
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price numeric;
  v_seats text[];
  v_updated_count integer;
  v_booking public.bookings;
begin
  select array_agg(distinct s order by s)
  into v_seats
  from (
    select trim(x) as s
    from unnest(coalesce(p_selected_seats, array[]::text[])) as x
    where trim(x) <> ''
  ) sub;

  if coalesce(trim(p_passenger_name), '') = '' or coalesce(trim(p_phone), '') = '' or coalesce(array_length(v_seats, 1), 0) = 0 then
    raise exception 'যাত্রীর নাম, মোবাইল নম্বর এবং কমপক্ষে একটি আসন প্রয়োজন';
  end if;

  select price into v_price from public.trips where id = p_trip_id;
  if v_price is null then
    raise exception 'Trip not found';
  end if;

  -- Lock only the specific target seat rows first (no aggregate functions with FOR UPDATE)
  perform 1
  from public.seats
  where trip_id = p_trip_id
    and seat_number = any(v_seats)
  order by seat_number
  for update;

  -- Atomically mark requested available seats as booked and verify exact row count
  update public.seats
  set status = 'booked'
  where trip_id = p_trip_id
    and seat_number = any(v_seats)
    and status = 'available';

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> array_length(v_seats, 1) then
    raise exception 'নির্বাচিত এক বা একাধিক আসন আর খালি নেই';
  end if;

  insert into public.bookings (
    trip_id, user_id, passenger_name, phone, boarding_point, selected_seats, total_fare, payment_method, trx_id, status
  ) values (
    p_trip_id,
    auth.uid(),
    trim(p_passenger_name),
    trim(p_phone),
    coalesce(trim(p_boarding_point), ''),
    v_seats,
    v_price * array_length(v_seats, 1),
    coalesce(trim(p_payment_method), ''),
    coalesce(trim(p_trx_id), ''),
    'pending'
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

grant execute on function public.submit_booking(uuid, text, text, text, text[], text, text) to anon, authenticated;

-- =============================================================================
-- CUSTOM DATABASE AUTHENTICATION & RBAC RPCs (Zero Email / Zero SignUp)
-- =============================================================================

create or replace function public._verify_staff_session(p_token text)
returns public.staff_accounts
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff public.staff_accounts;
begin
  if coalesce(trim(p_token), '') = '' then
    return null;
  end if;

  select a.* into v_staff
  from public.staff_sessions s
  join public.staff_accounts a on a.id = s.staff_id
  where s.token = trim(p_token)
    and s.expires_at > now()
    and s.token_version = a.token_version
  limit 1;

  return v_staff;
end;
$$;

revoke all on function public._verify_staff_session(text) from public, anon, authenticated;

-- 1. Staff / Admin / Counter / Representative Login directly against staff_accounts
create or replace function public.staff_login(
  p_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_clean text := trim(coalesce(p_username, ''));
  v_staff public.staff_accounts;
  v_token text;
  v_counter_name text;
begin
  if v_clean = '' or coalesce(p_password, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Invalid username or password');
  end if;

  if lower(v_clean) = 'sajonvip' then
    select * into v_staff
    from public.staff_accounts
    where username = v_clean and role = 'super_admin'
    limit 1;
  else
    select * into v_staff
    from public.staff_accounts
    where lower(trim(username)) = lower(v_clean)
      and role <> 'super_admin'
    limit 1;
  end if;

  if v_staff.id is null then
    return jsonb_build_object('ok', false, 'error', 'Invalid username or password');
  end if;

  if v_staff.password_hash <> crypt(p_password, v_staff.password_hash) then
    return jsonb_build_object('ok', false, 'error', 'Invalid username or password');
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.staff_sessions (token, staff_id, token_version, expires_at)
  values (v_token, v_staff.id, v_staff.token_version, now() + interval '7 days');

  if v_staff.counter_id is not null then
    select counter_name into v_counter_name
    from public.counters
    where id = v_staff.counter_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'user', jsonb_build_object(
      'id', v_staff.id,
      'email', v_staff.username,
      'full_name', v_staff.full_name,
      'phone', v_staff.phone,
      'role', v_staff.role,
      'counter_id', v_staff.counter_id,
      'counter_name', v_counter_name,
      'token_version', v_staff.token_version,
      'created_at', v_staff.created_at
    )
  );
end;
$$;

-- 2. Verify active custom staff session
create or replace function public.staff_me(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff public.staff_accounts;
  v_counter_name text;
begin
  v_staff := public._verify_staff_session(p_token);
  if v_staff.id is null then
    return null;
  end if;

  if v_staff.counter_id is not null then
    select counter_name into v_counter_name
    from public.counters
    where id = v_staff.counter_id;
  end if;

  return jsonb_build_object(
    'id', v_staff.id,
    'email', v_staff.username,
    'full_name', v_staff.full_name,
    'phone', v_staff.phone,
    'role', v_staff.role,
    'counter_id', v_staff.counter_id,
    'counter_name', v_counter_name,
    'token_version', v_staff.token_version,
    'created_at', v_staff.created_at
  );
end;
$$;

-- 3. Logout custom staff session
create or replace function public.staff_logout(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.staff_sessions where token = trim(coalesce(p_token, ''));
end;
$$;

-- 4. System-wide username uniqueness check across staff_accounts, profiles & reserved Sajonvip
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

  if exists (select 1 from public.staff_accounts where lower(trim(username)) = v_clean) then
    return false;
  end if;

  if exists (select 1 from public.profiles where lower(trim(email)) = v_clean) then
    return false;
  end if;

  return true;
end;
$$;

-- 5. Admin: List Counters with exact Counter & Representative Usernames
create or replace function public.admin_list_counters(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff public.staff_accounts;
  v_result jsonb;
begin
  v_staff := public._verify_staff_session(p_token);
  if v_staff.id is null or v_staff.role <> 'super_admin' then
    raise exception 'অনুমোদিত নয়: শুধুমাত্র মাস্টার সুপার অ্যাডমিন প্রবেশ করতে পারবেন';
  end if;

  select coalesce(jsonb_agg(row_obj order by row_obj->>'counter_name' asc), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', c.id,
      'counter_name', c.counter_name,
      'phone', c.phone,
      'address', c.address,
      'logo_url', c.logo_url,
      'created_at', c.created_at,
      'operator_username', (
        select a.username from public.staff_accounts a
        where a.counter_id = c.id and a.role = 'counter_admin'
        order by a.created_at asc limit 1
      ),
      'operator_user_id', (
        select a.id from public.staff_accounts a
        where a.counter_id = c.id and a.role = 'counter_admin'
        order by a.created_at asc limit 1
      ),
      'representative_username', (
        select a.username from public.staff_accounts a
        where a.counter_id = c.id and a.role = 'counter_representative'
        order by a.created_at asc limit 1
      ),
      'representative_user_id', (
        select a.id from public.staff_accounts a
        where a.counter_id = c.id and a.role = 'counter_representative'
        order by a.created_at asc limit 1
      )
    ) as row_obj
    from public.counters c
  ) sub;

  return v_result;
end;
$$;

-- 6. Admin: Create Counter + Exact Counter & Representative Accounts in staff_accounts
create or replace function public.admin_create_counter(
  p_token text,
  p_counter_name text,
  p_phone text,
  p_address text,
  p_logo_url text,
  p_operator_username text,
  p_operator_password text,
  p_representative_username text,
  p_representative_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin public.staff_accounts;
  v_name text := trim(coalesce(p_counter_name, ''));
  v_phone text := trim(coalesce(p_phone, ''));
  v_address text := trim(coalesce(p_address, ''));
  v_logo text := trim(coalesce(p_logo_url, ''));
  v_op_user text := trim(coalesce(p_operator_username, ''));
  v_rep_user text := trim(coalesce(p_representative_username, ''));
  v_counter public.counters;
  v_op_id uuid;
  v_rep_id uuid;
begin
  v_admin := public._verify_staff_session(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then
    raise exception 'অনুমোদিত নয়: শুধুমাত্র মাস্টার সুপার অ্যাডমিন কাউন্টার তৈরি করতে পারবেন';
  end if;

  if v_name = '' or v_phone = '' or v_address = '' then
    raise exception 'কাউন্টারের নাম, মোবাইল নম্বর এবং ঠিকানা আবশ্যক';
  end if;

  if v_op_user = '' or length(coalesce(p_operator_password, '')) < 6 then
    raise exception 'কাউন্টারের জন্য ইউজারনেম এবং কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড নির্ধারণ করুন';
  end if;

  if v_rep_user = '' or length(coalesce(p_representative_password, '')) < 6 then
    raise exception 'কাউন্টার প্রতিনিধির জন্য ইউজারনেম এবং কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড নির্ধারণ করুন';
  end if;

  if lower(v_op_user) = lower(v_rep_user) then
    raise exception 'কাউন্টার ইউজারনেম এবং প্রতিনিধি ইউজারনেম এক হতে পারবে না';
  end if;

  if lower(v_op_user) = 'sajonvip' or lower(v_rep_user) = 'sajonvip' then
    raise exception 'এই ইউজারনেমটি মাস্টার সুপার অ্যাডমিনের জন্য সংরক্ষিত';
  end if;

  if not public.is_username_available(v_op_user) then
    raise exception 'ইউজারনেম "%" ইতিমধ্যে সিস্টেমে ব্যবহৃত হয়েছে। অন্য ইউজারনেম দিন।', v_op_user;
  end if;

  if not public.is_username_available(v_rep_user) then
    raise exception 'প্রতিনিধি ইউজারনেম "%" ইতিমধ্যে সিস্টেমে ব্যবহৃত হয়েছে। অন্য ইউজারনেম দিন।', v_rep_user;
  end if;

  insert into public.counters (counter_name, phone, address, logo_url)
  values (v_name, v_phone, v_address, v_logo)
  returning * into v_counter;

  insert into public.staff_accounts (
    username, password_hash, full_name, phone, role, counter_id
  ) values (
    v_op_user,
    crypt(p_operator_password, gen_salt('bf')),
    v_name || ' কাউন্টার',
    v_phone,
    'counter_admin',
    v_counter.id
  )
  returning id into v_op_id;

  insert into public.staff_accounts (
    username, password_hash, full_name, phone, role, counter_id
  ) values (
    v_rep_user,
    crypt(p_representative_password, gen_salt('bf')),
    v_name || ' প্রতিনিধি',
    v_phone,
    'counter_representative',
    v_counter.id
  )
  returning id into v_rep_id;

  return jsonb_build_object(
    'id', v_counter.id,
    'counter_name', v_counter.counter_name,
    'phone', v_counter.phone,
    'address', v_counter.address,
    'logo_url', v_counter.logo_url,
    'created_at', v_counter.created_at,
    'operator_username', v_op_user,
    'operator_user_id', v_op_id,
    'representative_username', v_rep_user,
    'representative_user_id', v_rep_id
  );
end;
$$;

-- 7. Admin: Delete Counter (cascades to staff_accounts & trips)
create or replace function public.admin_delete_counter(p_token text, p_counter_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.staff_accounts;
begin
  v_admin := public._verify_staff_session(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then
    raise exception 'অনুমোদিত নয়';
  end if;

  delete from public.staff_accounts where counter_id = p_counter_id and role <> 'super_admin';
  delete from public.counters where id = p_counter_id;
end;
$$;

-- 8. Admin: Update App Branding Settings
create or replace function public.admin_update_settings(
  p_token text,
  p_organization_name text,
  p_organization_logo_url text
)
returns public.app_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.staff_accounts;
  v_updated public.app_settings;
begin
  v_admin := public._verify_staff_session(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then
    raise exception 'অনুমোদিত নয়';
  end if;

  update public.app_settings
  set organization_name = trim(p_organization_name),
      organization_logo_url = trim(coalesce(p_organization_logo_url, '')),
      updated_at = now()
  where id = 1
  returning * into v_updated;

  return v_updated;
end;
$$;

-- 9. Admin: Reset Counter or Representative Password + Invalidate Old Sessions + Write Audit Log
create or replace function public.admin_reset_account_password(
  p_token text,
  p_counter_id uuid,
  p_target_role text,
  p_new_password text
)
returns public.password_reset_logs
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin public.staff_accounts;
  v_target public.staff_accounts;
  v_counter_name text;
  v_log public.password_reset_logs;
begin
  v_admin := public._verify_staff_session(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then
    raise exception 'শুধুমাত্র মাস্টার সুপার অ্যাডমিন পাসওয়ার্ড রিসেট করতে পারবেন';
  end if;

  if p_target_role not in ('counter_admin', 'counter_representative') then
    raise exception 'অবৈধ অ্যাকাউন্ট রোল';
  end if;

  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে';
  end if;

  select * into v_target
  from public.staff_accounts
  where counter_id = p_counter_id
    and role = p_target_role
  order by created_at asc
  limit 1;

  if v_target.id is null then
    raise exception 'এই কাউন্টারে নির্ধারিত অ্যাকাউন্ট পাওয়া যায়নি';
  end if;

  select counter_name into v_counter_name
  from public.counters
  where id = p_counter_id;

  update public.staff_accounts
  set password_hash = crypt(p_new_password, gen_salt('bf')),
      token_version = token_version + 1
  where id = v_target.id;

  -- Immediately invalidate all active sessions for the reset account
  delete from public.staff_sessions where staff_id = v_target.id;

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
    v_target.username,
    v_admin.username
  )
  returning * into v_log;

  return v_log;
end;
$$;

-- 10. Admin: List Password Reset Audit Logs
create or replace function public.admin_get_password_reset_logs(p_token text)
returns setof public.password_reset_logs
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_admin public.staff_accounts;
begin
  v_admin := public._verify_staff_session(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then
    raise exception 'অনুমোদিত নয়';
  end if;

  return query
  select *
  from public.password_reset_logs
  order by created_at desc
  limit 100;
end;
$$;

-- 11. Admin: List Users & Staff Accounts
create or replace function public.admin_list_users(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_admin public.staff_accounts;
  v_result jsonb;
begin
  v_admin := public._verify_staff_session(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then
    raise exception 'অনুমোদিত নয়';
  end if;

  select coalesce(jsonb_agg(item order by item->>'created_at' desc), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', a.id,
      'email', a.username,
      'full_name', a.full_name,
      'phone', a.phone,
      'role', a.role,
      'counter_id', a.counter_id,
      'counter_name', c.counter_name,
      'token_version', a.token_version,
      'created_at', a.created_at
    ) as item
    from public.staff_accounts a
    left join public.counters c on c.id = a.counter_id
    where a.role <> 'super_admin'
    union all
    select jsonb_build_object(
      'id', p.id,
      'email', p.email,
      'full_name', p.full_name,
      'phone', p.phone,
      'role', p.role,
      'counter_id', p.counter_id,
      'counter_name', c.counter_name,
      'token_version', p.token_version,
      'created_at', p.created_at
    ) as item
    from public.profiles p
    left join public.counters c on c.id = p.counter_id
    where p.role = 'user'
  ) combined;

  return v_result;
end;
$$;

-- 12. Admin: Create Staff Account directly in staff_accounts (Exact username, Hashed password)
create or replace function public.admin_create_staff_account(
  p_token text,
  p_username text,
  p_full_name text,
  p_phone text,
  p_password text,
  p_role text,
  p_counter_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin public.staff_accounts;
  v_clean_username text := trim(coalesce(p_username, ''));
  v_is_counter_role boolean := p_role in ('counter_admin', 'counter_representative');
  v_created public.staff_accounts;
  v_counter_name text;
begin
  v_admin := public._verify_staff_session(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then
    raise exception 'অনুমোদিত নয়';
  end if;

  if p_role not in ('user', 'counter_admin', 'counter_representative') then
    raise exception 'মাস্টার সুপার অ্যাডমিন অ্যাকাউন্ট নির্ধারিত এবং পরিবর্তনযোগ্য নয়';
  end if;

  if v_clean_username = '' or length(coalesce(p_password, '')) < 6 then
    raise exception 'ইউজারনেম ও কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড আবশ্যক';
  end if;

  if v_is_counter_role and p_counter_id is null then
    raise exception 'কাউন্টার বা প্রতিনিধির জন্য কাউন্টার নির্ধারণ আবশ্যক';
  end if;

  if not public.is_username_available(v_clean_username) then
    raise exception 'এই ইউজারনেমটি ইতিমধ্যে ব্যবহৃত হয়েছে';
  end if;

  insert into public.staff_accounts (
    username, password_hash, full_name, phone, role, counter_id
  ) values (
    v_clean_username,
    crypt(p_password, gen_salt('bf')),
    trim(coalesce(p_full_name, '')),
    trim(coalesce(p_phone, '')),
    p_role,
    case when v_is_counter_role then p_counter_id else null end
  )
  returning * into v_created;

  if v_created.counter_id is not null then
    select counter_name into v_counter_name from public.counters where id = v_created.counter_id;
  end if;

  return jsonb_build_object(
    'id', v_created.id,
    'email', v_created.username,
    'full_name', v_created.full_name,
    'phone', v_created.phone,
    'role', v_created.role,
    'counter_id', v_created.counter_id,
    'counter_name', v_counter_name,
    'token_version', v_created.token_version,
    'created_at', v_created.created_at
  );
end;
$$;

-- 13. Admin: Update Staff Role / Counter Assignment
create or replace function public.admin_update_staff_role(
  p_token text,
  p_staff_id uuid,
  p_role text,
  p_counter_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.staff_accounts;
  v_is_counter_role boolean := p_role in ('counter_admin', 'counter_representative');
  v_updated public.staff_accounts;
  v_counter_name text;
begin
  v_admin := public._verify_staff_session(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then
    raise exception 'অনুমোদিত নয়';
  end if;

  if p_role not in ('user', 'counter_admin', 'counter_representative') then
    raise exception 'শুধুমাত্র যাত্রী, কাউন্টার অথবা প্রতিনিধি রোল নির্ধারণ করা যাবে';
  end if;

  if v_is_counter_role and p_counter_id is null then
    raise exception 'কাউন্টার বা প্রতিনিধির জন্য কাউন্টার নির্ধারণ আবশ্যক';
  end if;

  update public.staff_accounts
  set role = p_role,
      counter_id = case when v_is_counter_role then p_counter_id else null end
  where id = p_staff_id
    and role <> 'super_admin'
  returning * into v_updated;

  if v_updated.id is null then
    raise exception 'শুধুমাত্র স্টাফ অ্যাকাউন্টের রোল পরিবর্তন করা যায়';
  end if;

  if v_updated.counter_id is not null then
    select counter_name into v_counter_name from public.counters where id = v_updated.counter_id;
  end if;

  return jsonb_build_object(
    'id', v_updated.id,
    'email', v_updated.username,
    'full_name', v_updated.full_name,
    'phone', v_updated.phone,
    'role', v_updated.role,
    'counter_id', v_updated.counter_id,
    'counter_name', v_counter_name,
    'token_version', v_updated.token_version,
    'created_at', v_updated.created_at
  );
end;
$$;

-- 14. Admin: Delete Staff or Passenger Account
create or replace function public.admin_delete_staff_account(
  p_token text,
  p_staff_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.staff_accounts;
begin
  v_admin := public._verify_staff_session(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then
    raise exception 'অনুমোদিত নয়';
  end if;

  delete from public.staff_accounts where id = p_staff_id and role <> 'super_admin';
  delete from public.profiles where id = p_staff_id and role <> 'super_admin';
end;
$$;

-- 15. Counter Operator & Admin: Create Trip (Representatives blocked!)
create or replace function public.staff_create_trip(
  p_token text,
  p_counter_id uuid,
  p_route_from text,
  p_route_to text,
  p_departure_time timestamptz,
  p_bus_type text,
  p_price numeric,
  p_total_seats integer
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff_accounts;
  v_target_counter uuid;
  v_trip public.trips;
begin
  v_staff := public._verify_staff_session(p_token);
  if v_staff.id is null or v_staff.role not in ('super_admin', 'counter_admin') then
    raise exception 'Forbidden: Read-only or unauthorized account cannot create trips';
  end if;

  v_target_counter := case when v_staff.role = 'super_admin' then p_counter_id else v_staff.counter_id end;
  if v_target_counter is null then
    raise exception 'কাউন্টার নির্ধারণ করা হয়নি';
  end if;

  if v_staff.role = 'counter_admin' and p_counter_id is not null and p_counter_id <> v_staff.counter_id then
    raise exception 'আপনি শুধুমাত্র আপনার নিজস্ব কাউন্টারের ট্রিপ তৈরি করতে পারবেন';
  end if;

  insert into public.trips (counter_id, route_from, route_to, departure_time, bus_type, price, total_seats)
  values (
    v_target_counter,
    trim(p_route_from),
    trim(p_route_to),
    p_departure_time,
    coalesce(nullif(trim(p_bus_type), ''), 'এসি এক্সপ্রেস কোচ'),
    p_price,
    least(60, greatest(8, coalesce(p_total_seats, 36)))
  )
  returning * into v_trip;

  return v_trip;
end;
$$;

-- 16. Counter Operator & Admin: Update Trip (Representatives blocked!)
create or replace function public.staff_update_trip(
  p_token text,
  p_trip_id uuid,
  p_route_from text,
  p_route_to text,
  p_departure_time timestamptz,
  p_bus_type text,
  p_price numeric
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff_accounts;
  v_trip public.trips;
begin
  v_staff := public._verify_staff_session(p_token);
  if v_staff.id is null or v_staff.role not in ('super_admin', 'counter_admin') then
    raise exception 'Forbidden: Read-only or unauthorized account cannot modify trips';
  end if;

  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip.id is null then
    raise exception 'ট্রিপ পাওয়া যায়নি';
  end if;

  if v_staff.role = 'counter_admin' and v_trip.counter_id <> v_staff.counter_id then
    raise exception 'আপনি শুধুমাত্র আপনার নিজস্ব কাউন্টারের ট্রিপ সম্পাদনা করতে পারবেন';
  end if;

  update public.trips
  set route_from = trim(p_route_from),
      route_to = trim(p_route_to),
      departure_time = p_departure_time,
      bus_type = trim(p_bus_type),
      price = p_price
  where id = p_trip_id
  returning * into v_trip;

  return v_trip;
end;
$$;

-- 17. Counter Operator & Admin: Delete Trip (Representatives blocked!)
create or replace function public.staff_delete_trip(
  p_token text,
  p_trip_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff_accounts;
  v_trip public.trips;
begin
  v_staff := public._verify_staff_session(p_token);
  if v_staff.id is null or v_staff.role not in ('super_admin', 'counter_admin') then
    raise exception 'Forbidden: Read-only or unauthorized account cannot delete trips';
  end if;

  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip.id is null then
    raise exception 'ট্রিপ পাওয়া যায়নি';
  end if;

  if v_staff.role = 'counter_admin' and v_trip.counter_id <> v_staff.counter_id then
    raise exception 'আপনি শুধুমাত্র আপনার নিজস্ব কাউন্টারের ট্রিপ মুছতে পারবেন';
  end if;

  delete from public.trips where id = p_trip_id;
end;
$$;

-- 18. Counter Operator & Admin: Toggle Seat Status (Representatives blocked!)
create or replace function public.staff_toggle_seat(
  p_token text,
  p_trip_id uuid,
  p_seat_number text,
  p_status text
)
returns public.seats
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff_accounts;
  v_trip public.trips;
  v_seat public.seats;
begin
  v_staff := public._verify_staff_session(p_token);
  if v_staff.id is null or v_staff.role not in ('super_admin', 'counter_admin') then
    raise exception 'Forbidden: Read-only or unauthorized account cannot update seats';
  end if;

  if p_status not in ('available', 'booked') then
    raise exception 'অবৈধ আসন অবস্থা';
  end if;

  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip.id is null then
    raise exception 'ট্রিপ পাওয়া যায়নি';
  end if;

  if v_staff.role = 'counter_admin' and v_trip.counter_id <> v_staff.counter_id then
    raise exception 'আপনি শুধুমাত্র আপনার নিজস্ব কাউন্টারের আসন পরিবর্তন করতে পারবেন';
  end if;

  update public.seats
  set status = p_status
  where trip_id = p_trip_id and seat_number = p_seat_number
  returning * into v_seat;

  return v_seat;
end;
$$;

-- 19. Counter Operator & Admin: Confirm / Cancel Booking Status (Representatives blocked!)
create or replace function public.staff_update_booking_status(
  p_token text,
  p_booking_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff_accounts;
  v_booking public.bookings;
  v_trip_counter uuid;
begin
  v_staff := public._verify_staff_session(p_token);
  if v_staff.id is null or v_staff.role not in ('super_admin', 'counter_admin') then
    raise exception 'Forbidden: Read-only or unauthorized account cannot modify booking status';
  end if;

  if p_status not in ('pending', 'confirmed', 'cancelled') then
    raise exception 'Invalid booking status';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id;

  if v_booking.id is null then
    raise exception 'বুকিং পাওয়া যায়নি';
  end if;

  select counter_id into v_trip_counter from public.trips where id = v_booking.trip_id;

  if v_staff.role = 'counter_admin' and v_trip_counter <> v_staff.counter_id then
    raise exception 'আপনি শুধুমাত্র আপনার নিজস্ব কাউন্টারের বুকিং পরিচালনা করতে পারবেন';
  end if;

  if p_status = 'cancelled' and v_booking.status <> 'cancelled' then
    update public.seats
    set status = 'available'
    where trip_id = v_booking.trip_id
      and seat_number = any(v_booking.selected_seats);
  elsif p_status <> 'cancelled' and v_booking.status = 'cancelled' then
    if exists (
      select 1 from public.seats
      where trip_id = v_booking.trip_id
        and seat_number = any(v_booking.selected_seats)
        and status <> 'available'
    ) then
      raise exception 'নির্বাচিত এক বা একাধিক আসন ইতিমধ্যে বুক হয়ে গেছে';
    end if;
    update public.seats
    set status = 'booked'
    where trip_id = v_booking.trip_id
      and seat_number = any(v_booking.selected_seats);
  end if;

  update public.bookings
  set status = p_status
  where id = p_booking_id;

  return jsonb_build_object('id', p_booking_id, 'status', p_status);
end;
$$;

-- 20. Counter Operator & Admin: Direct Counter Ticket Issue / Booking (Representatives blocked!)
create or replace function public.staff_create_booking(
  p_token text,
  p_trip_id uuid,
  p_passenger_name text,
  p_phone text,
  p_boarding_point text,
  p_selected_seats text[],
  p_status text default 'confirmed',
  p_total_fare numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff_accounts;
  v_trip public.trips;
  v_counter_name text;
  v_seats text[];
  v_updated_count integer;
  v_fare numeric;
  v_booking public.bookings;
  v_final_status text := coalesce(nullif(trim(p_status), ''), 'confirmed');
begin
  v_staff := public._verify_staff_session(p_token);
  if v_staff.id is null or v_staff.role not in ('super_admin', 'counter_admin') then
    raise exception 'Forbidden: Read-only or unauthorized account cannot issue counter tickets';
  end if;

  if v_final_status not in ('pending', 'confirmed') then
    raise exception 'অবৈধ বুকিং স্ট্যাটাস';
  end if;

  select array_agg(distinct s order by s)
  into v_seats
  from (
    select trim(x) as s
    from unnest(coalesce(p_selected_seats, array[]::text[])) as x
    where trim(x) <> ''
  ) sub;

  if coalesce(trim(p_passenger_name), '') = '' or coalesce(trim(p_phone), '') = '' or coalesce(array_length(v_seats, 1), 0) = 0 then
    raise exception 'যাত্রীর নাম, মোবাইল নম্বর এবং কমপক্ষে একটি আসন প্রয়োজন';
  end if;

  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip.id is null then
    raise exception 'ট্রিপ পাওয়া যায়নি';
  end if;

  if v_staff.role = 'counter_admin' and v_trip.counter_id <> v_staff.counter_id then
    raise exception 'আপনি শুধুমাত্র আপনার নিজস্ব কাউন্টারের ট্রিপের টিকেট কাটতে পারবেন';
  end if;

  select counter_name into v_counter_name from public.counters where id = v_trip.counter_id;

  -- Lock only the specific target seat rows first (no aggregate functions with FOR UPDATE)
  perform 1
  from public.seats
  where trip_id = p_trip_id
    and seat_number = any(v_seats)
  order by seat_number
  for update;

  -- Atomically mark requested available seats as booked and verify exact row count
  update public.seats
  set status = 'booked'
  where trip_id = p_trip_id
    and seat_number = any(v_seats)
    and status = 'available';

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> array_length(v_seats, 1) then
    raise exception 'নির্বাচিত এক বা একাধিক আসন আর খালি নেই';
  end if;

  v_fare := coalesce(p_total_fare, v_trip.price * array_length(v_seats, 1));
  if v_fare < 0 then
    raise exception 'ভাড়ার পরিমাণ সঠিক নয়';
  end if;

  insert into public.bookings (
    trip_id, user_id, passenger_name, phone, boarding_point, selected_seats, total_fare, status
  ) values (
    p_trip_id,
    null,
    trim(p_passenger_name),
    trim(p_phone),
    coalesce(nullif(trim(p_boarding_point), ''), coalesce(v_counter_name, 'প্রধান কাউন্টার')),
    v_seats,
    v_fare,
    v_final_status
  )
  returning * into v_booking;

  return jsonb_build_object(
    'id', v_booking.id,
    'trip_id', v_booking.trip_id,
    'user_id', v_booking.user_id,
    'passenger_name', v_booking.passenger_name,
    'phone', v_booking.phone,
    'boarding_point', v_booking.boarding_point,
    'selected_seats', v_booking.selected_seats,
    'total_fare', v_booking.total_fare,
    'status', v_booking.status,
    'created_at', v_booking.created_at,
    'trip', jsonb_build_object(
      'route_from', v_trip.route_from,
      'route_to', v_trip.route_to,
      'departure_time', v_trip.departure_time,
      'bus_type', v_trip.bus_type,
      'price', v_trip.price,
      'counter_id', v_trip.counter_id,
      'counter_name', coalesce(v_counter_name, 'কাউন্টার')
    )
  );
end;
$$;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

alter table public.app_settings enable row level security;
alter table public.counters enable row level security;
alter table public.staff_accounts enable row level security;
alter table public.staff_sessions enable row level security;
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.seats enable row level security;
alter table public.bookings enable row level security;
alter table public.password_reset_logs enable row level security;

-- Public reads for passenger portal
drop policy if exists "Public read app_settings" on public.app_settings;
create policy "Public read app_settings" on public.app_settings for select using (true);

drop policy if exists "Public read counters" on public.counters;
create policy "Public read counters" on public.counters for select using (true);

drop policy if exists "Public read trips" on public.trips;
create policy "Public read trips" on public.trips for select using (true);

drop policy if exists "Public read seats" on public.seats;
create policy "Public read seats" on public.seats for select using (true);

drop policy if exists "Public read bookings" on public.bookings;
create policy "Public read bookings" on public.bookings for select using (true);

-- Passenger booking insert (for authenticated passengers or verified guest/passenger submits via submit_booking RPC)
drop policy if exists "Public create booking" on public.bookings;
create policy "Public create booking" on public.bookings for insert
  with check (auth.uid() is not null);

-- Passenger profiles
drop policy if exists "Read own profile or Super Admin" on public.profiles;
create policy "Read own profile or Super Admin" on public.profiles for select
  using (id = auth.uid());

drop policy if exists "Users insert own passenger profile" on public.profiles;
create policy "Users insert own passenger profile" on public.profiles for insert
  with check (id = auth.uid() and role = 'user');

-- Note: staff_accounts, staff_sessions, and password_reset_logs have RLS enabled with NO public policies;
-- they are strictly accessed via token-verified SECURITY DEFINER RPCs above.

-- Initial Default Branding Seed
insert into public.app_settings (id, organization_name, organization_logo_url)
values (1, 'দেশ ভ্রমণ / Desh Travels', '')
on conflict (id) do update
  set organization_name = coalesce(nullif(public.app_settings.organization_name, ''), 'দেশ ভ্রমণ / Desh Travels');

-- =============================================================================
-- SEED MASTER SUPER ADMIN IN CUSTOM staff_accounts TABLE (Sajonvip / Sajon2001M)
-- =============================================================================
do $$
begin
  perform set_config('search_path', 'public, extensions', true);
  if exists (select 1 from public.staff_accounts where lower(trim(username)) = 'sajonvip') then
    update public.staff_accounts
    set username = 'Sajonvip',
        password_hash = crypt('Sajon2001M', gen_salt('bf')),
        full_name = 'মাস্টার সুপার অ্যাডমিন',
        role = 'super_admin',
        counter_id = null
    where lower(trim(username)) = 'sajonvip';
  else
    insert into public.staff_accounts (username, password_hash, full_name, phone, role, counter_id)
    values (
      'Sajonvip',
      crypt('Sajon2001M', gen_salt('bf')),
      'মাস্টার সুপার অ্যাডমিন',
      '',
      'super_admin',
      null
    );
  end if;
end $$;
