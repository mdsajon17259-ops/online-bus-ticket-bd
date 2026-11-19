-- =============================================================================
-- Multi-Counter Bus Ticket Booking Platform — Supabase PostgreSQL Schema
-- Run this script in your Supabase Project -> SQL Editor
-- =============================================================================

-- Enable UUID extension
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
  role text not null default 'user' check (role in ('user', 'counter_admin', 'super_admin')),
  counter_id uuid references public.counters(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 4. TRIPS TABLE (Schedules & Routes per Counter)
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  counter_id uuid not null references public.counters(id) on delete cascade,
  route_from text not null,
  route_to text not null,
  departure_time timestamptz not null,
  bus_type text not null default 'AC Express Coach',
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
  passenger_name text not null,
  phone text not null,
  boarding_point text not null default '',
  selected_seats text[] not null,
  total_fare numeric(10, 2) not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
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
    trip_id, passenger_name, phone, boarding_point, selected_seats, total_fare, status
  ) values (
    p_trip_id, p_passenger_name, p_phone, p_boarding_point, p_selected_seats,
    v_price * array_length(p_selected_seats, 1), 'pending'
  )
  returning * into v_booking;

  return v_booking;
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

-- Helper to check current user's role
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

-- app_settings: Public read, Super Admin write
create policy "Public read app_settings" on public.app_settings for select using (true);
create policy "Super Admin update app_settings" on public.app_settings for all
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

-- counters: Public read, Super Admin write
create policy "Public read counters" on public.counters for select using (true);
create policy "Super Admin manage counters" on public.counters for all
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

-- trips: Public read, Super Admin & owning Counter Admin manage
create policy "Public read trips" on public.trips for select using (true);
create policy "Admin manage trips" on public.trips for all
  using (
    public.current_user_role() = 'super_admin'
    or (public.current_user_role() = 'counter_admin' and counter_id = public.current_user_counter_id())
  )
  with check (
    public.current_user_role() = 'super_admin'
    or (public.current_user_role() = 'counter_admin' and counter_id = public.current_user_counter_id())
  );

-- seats: Public read, Admin/Counter Admin update
create policy "Public read seats" on public.seats for select using (true);
create policy "Admin manage seats" on public.seats for update
  using (
    public.current_user_role() = 'super_admin'
    or exists (
      select 1 from public.trips t
      where t.id = seats.trip_id and t.counter_id = public.current_user_counter_id()
    )
  );

-- bookings: Public insert & lookup by phone, Counter Admin scoped read/update, Super Admin all
create policy "Public create booking" on public.bookings for insert with check (true);
create policy "Public read bookings" on public.bookings for select using (true);
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

-- profiles: Users read own profile, Super Admin manages all profiles
create policy "Read own profile or Super Admin" on public.profiles for select
  using (id = auth.uid() or public.current_user_role() = 'super_admin');
create policy "Super Admin manage profiles" on public.profiles for all
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

-- Initial Default Branding Seed
insert into public.app_settings (id, organization_name, organization_logo_url)
values (1, 'বেঙ্গল ট্রানজিট নেটওয়ার্ক', '')
on conflict (id) do nothing;
