import { isSupabaseConfigured, supabase } from './supabase';
import type {
  AdminOverview,
  AppSettings,
  Booking,
  BookingStatus,
  Counter,
  Profile,
  Seat,
  Trip,
  UserRole,
} from '../types';

const TOKEN_KEY = 'transit_auth_token';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

// =============================================================================
// PUBLIC DATA QUERIES
// =============================================================================

export async function fetchAppSettings(): Promise<AppSettings> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw new Error(error.message);
    return data as AppSettings;
  }
  return apiFetch<AppSettings>('/api/settings');
}

export async function fetchCounters(): Promise<Counter[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('counters')
      .select('*')
      .order('counter_name', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []) as Counter[];
  }
  return apiFetch<Counter[]>('/api/counters');
}

export async function fetchTrips(filters?: {
  from?: string;
  to?: string;
  date?: string;
  counter_id?: string;
}): Promise<Trip[]> {
  if (isSupabaseConfigured && supabase) {
    let query = supabase
      .from('trips')
      .select('*, counters(counter_name, logo_url), seats(status)')
      .order('departure_time', { ascending: true });

    if (filters?.from?.trim()) {
      query = query.ilike('route_from', `%${filters.from.trim()}%`);
    }
    if (filters?.to?.trim()) {
      query = query.ilike('route_to', `%${filters.to.trim()}%`);
    }
    if (filters?.counter_id?.trim()) {
      query = query.eq('counter_id', filters.counter_id.trim());
    }
    if (filters?.date?.trim()) {
      const start = `${filters.date.trim()}T00:00:00`;
      const end = `${filters.date.trim()}T23:59:59`;
      query = query.gte('departure_time', start).lte('departure_time', end);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map((row: Record<string, unknown>) => {
      const c = row.counters as { counter_name?: string; logo_url?: string } | null;
      const seatList = (row.seats as Array<{ status: string }> | null) || [];
      return {
        id: String(row.id),
        counter_id: String(row.counter_id),
        route_from: String(row.route_from),
        route_to: String(row.route_to),
        departure_time: String(row.departure_time),
        bus_type: String(row.bus_type || 'AC Express Coach'),
        price: Number(row.price),
        total_seats: Number(row.total_seats),
        counter_name: c?.counter_name || 'Counter',
        counter_logo_url: c?.logo_url || '',
        available_seats: seatList.filter((s) => s.status === 'available').length,
      };
    });
  }

  const params = new URLSearchParams();
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  if (filters?.date) params.set('date', filters.date);
  if (filters?.counter_id) params.set('counter_id', filters.counter_id);

  const qs = params.toString();
  return apiFetch<Trip[]>(`/api/trips${qs ? `?${qs}` : ''}`);
}

export async function fetchTripSeats(tripId: string): Promise<Seat[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('seats')
      .select('*')
      .eq('trip_id', tripId);
    if (error) throw new Error(error.message);
    return ((data || []) as Seat[]).sort((a, b) => {
      const numA = parseInt(a.seat_number.slice(1), 10);
      const numB = parseInt(b.seat_number.slice(1), 10);
      if (numA !== numB) return numA - numB;
      return a.seat_number.localeCompare(b.seat_number);
    });
  }
  return apiFetch<Seat[]>(`/api/trips/${encodeURIComponent(tripId)}/seats`);
}

export async function createBooking(payload: {
  trip_id: string;
  passenger_name: string;
  phone: string;
  boarding_point: string;
  selected_seats: string[];
}): Promise<Booking> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('submit_booking', {
      p_trip_id: payload.trip_id,
      p_passenger_name: payload.passenger_name,
      p_phone: payload.phone,
      p_boarding_point: payload.boarding_point,
      p_selected_seats: payload.selected_seats,
    });
    if (error) throw new Error(error.message);
    return data as Booking;
  }
  return apiFetch<Booking>('/api/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function lookupBookings(query: string): Promise<Booking[]> {
  if (isSupabaseConfigured && supabase) {
    const clean = query.trim();
    const { data, error } = await supabase
      .from('bookings')
      .select('*, trips(route_from, route_to, departure_time, bus_type, price, counter_id, counters(counter_name))')
      .or(`phone.ilike.%${clean}%,id.eq.${clean}`)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(mapSupabaseBooking);
  }
  return apiFetch<Booking[]>(`/api/bookings/lookup?q=${encodeURIComponent(query)}`);
}

// =============================================================================
// AUTHENTICATION
// =============================================================================

export async function loginWithEmail(
  email: string,
  password: string
): Promise<{ user: Profile }> {
  if (isSupabaseConfigured && supabase) {
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !authData.user) {
      throw new Error(error?.message || 'Sign in failed');
    }
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('*, counters(counter_name)')
      .eq('id', authData.user.id)
      .single();
    if (profErr || !profile) {
      throw new Error('User profile not found in database');
    }
    return {
      user: {
        id: profile.id,
        email: profile.email,
        role: profile.role,
        counter_id: profile.counter_id,
        counter_name: (profile.counters as { counter_name?: string } | null)?.counter_name || null,
      },
    };
  }

  const res = await apiFetch<{ token: string; user: Profile }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setAuthToken(res.token);
  return { user: res.user };
}

export async function registerPassenger(
  email: string,
  password: string,
  full_name: string
): Promise<{ user: Profile }> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name } },
    });
    if (error || !data.user) throw new Error(error?.message || 'Registration failed');
    const { error: profErr } = await supabase.from('profiles').insert({
      id: data.user.id,
      email,
      role: 'user',
      counter_id: null,
    });
    if (profErr) throw new Error(profErr.message);
    return {
      user: {
        id: data.user.id,
        email,
        full_name,
        role: 'user',
        counter_id: null,
      },
    };
  }

  const res = await apiFetch<{ token: string; user: Profile }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, full_name }),
  });
  setAuthToken(res.token);
  return { user: res.user };
}

export async function fetchCurrentUser(): Promise<Profile | null> {
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('*, counters(counter_name)')
      .eq('id', data.user.id)
      .single();
    if (!profile) return null;
    return {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      counter_id: profile.counter_id,
      counter_name: (profile.counters as { counter_name?: string } | null)?.counter_name || null,
    };
  }

  if (!getAuthToken()) return null;
  try {
    return await apiFetch<Profile>('/api/auth/me');
  } catch {
    setAuthToken(null);
    return null;
  }
}

export async function signOutUser(): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    await supabase.auth.signOut();
    return;
  }
  setAuthToken(null);
}

// =============================================================================
// COUNTER OPERATOR ACTIONS
// =============================================================================

export async function fetchOperatorTrips(counterId?: string): Promise<Trip[]> {
  if (isSupabaseConfigured && supabase) {
    return fetchTrips(counterId ? { counter_id: counterId } : undefined);
  }
  const qs = counterId ? `?counter_id=${encodeURIComponent(counterId)}` : '';
  return apiFetch<Trip[]>(`/api/operator/trips${qs}`);
}

export async function fetchOperatorBookings(counterId?: string): Promise<Booking[]> {
  if (isSupabaseConfigured && supabase) {
    const query = supabase
      .from('bookings')
      .select('*, trips!inner(route_from, route_to, departure_time, bus_type, price, counter_id, counters(counter_name))')
      .order('created_at', { ascending: false });
    if (counterId) {
      query.eq('trips.counter_id', counterId);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map(mapSupabaseBooking);
  }
  const qs = counterId ? `?counter_id=${encodeURIComponent(counterId)}` : '';
  return apiFetch<Booking[]>(`/api/operator/bookings${qs}`);
}

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus
): Promise<{ id: string; status: BookingStatus }> {
  if (isSupabaseConfigured && supabase) {
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();
    if (fetchErr || !booking) throw new Error(fetchErr?.message || 'Booking not found');

    const seats = booking.selected_seats as string[];
    if (status === 'cancelled' && booking.status !== 'cancelled') {
      await supabase
        .from('seats')
        .update({ status: 'available' })
        .eq('trip_id', booking.trip_id)
        .in('seat_number', seats);
    } else if (status !== 'cancelled' && booking.status === 'cancelled') {
      await supabase
        .from('seats')
        .update({ status: 'booked' })
        .eq('trip_id', booking.trip_id)
        .in('seat_number', seats);
    }

    const { error: updErr } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', bookingId);
    if (updErr) throw new Error(updErr.message);
    return { id: bookingId, status };
  }

  return apiFetch<{ id: string; status: BookingStatus }>(
    `/api/operator/bookings/${encodeURIComponent(bookingId)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }
  );
}

// =============================================================================
// SUPER ADMIN ACTIONS
// =============================================================================

export async function updateAppSettings(payload: {
  organization_name: string;
  organization_logo_url: string;
}): Promise<AppSettings> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('app_settings')
      .update({
        organization_name: payload.organization_name,
        organization_logo_url: payload.organization_logo_url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as AppSettings;
  }

  return apiFetch<AppSettings>('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  if (isSupabaseConfigured && supabase) {
    const [bookingsRes, tripsRes, countersRes] = await Promise.all([
      supabase.from('bookings').select('id, total_fare, status, trips(counter_id)'),
      supabase.from('trips').select('id, counter_id'),
      supabase.from('counters').select('id, counter_name'),
    ]);

    const bookings = bookingsRes.data || [];
    const trips = tripsRes.data || [];
    const counters = countersRes.data || [];

    const totalBookings = bookings.length;
    const pendingBookings = bookings.filter((b) => b.status === 'pending').length;
    const confirmedBookings = bookings.filter((b) => b.status === 'confirmed').length;
    const cancelledBookings = bookings.filter((b) => b.status === 'cancelled').length;
    const confirmedRevenue = bookings
      .filter((b) => b.status === 'confirmed')
      .reduce((acc, b) => acc + Number(b.total_fare), 0);
    const pendingRevenue = bookings
      .filter((b) => b.status === 'pending')
      .reduce((acc, b) => acc + Number(b.total_fare), 0);

    const counterStats = counters.map((c) => {
      const cTrips = trips.filter((t) => t.counter_id === c.id);
      const cBookings = bookings.filter(
        (b) => ((b.trips as unknown) as { counter_id?: string } | null)?.counter_id === c.id
      );
      const rev = cBookings
        .filter((b) => b.status === 'confirmed')
        .reduce((sum, b) => sum + Number(b.total_fare), 0);
      return {
        counter_id: c.id,
        counter_name: c.counter_name,
        trips_count: cTrips.length,
        bookings_count: cBookings.length,
        revenue: rev,
      };
    });

    return {
      totalBookings,
      pendingBookings,
      confirmedBookings,
      cancelledBookings,
      confirmedRevenue,
      pendingRevenue,
      activeTrips: trips.length,
      totalCounters: counters.length,
      counterStats,
    };
  }

  return apiFetch<AdminOverview>('/api/admin/overview');
}

export async function createCounter(payload: {
  counter_name: string;
  phone: string;
  address: string;
  logo_url: string;
}): Promise<Counter> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('counters').insert(payload).select().single();
    if (error) throw new Error(error.message);
    return data as Counter;
  }
  return apiFetch<Counter>('/api/admin/counters', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteCounter(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('counters').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  await apiFetch(`/api/admin/counters/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function createTrip(payload: {
  counter_id: string;
  route_from: string;
  route_to: string;
  departure_time: string;
  bus_type: string;
  price: number;
  total_seats: number;
}): Promise<Trip> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('trips').insert(payload).select().single();
    if (error) throw new Error(error.message);
    return data as Trip;
  }
  return apiFetch<Trip>('/api/admin/trips', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteTrip(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('trips').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  await apiFetch(`/api/admin/trips/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchAllUsers(): Promise<Profile[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, counters(counter_name)')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map((p: Record<string, unknown>) => ({
      id: String(p.id),
      email: String(p.email),
      role: p.role as UserRole,
      counter_id: p.counter_id ? String(p.counter_id) : null,
      counter_name: (p.counters as { counter_name?: string } | null)?.counter_name || null,
      created_at: String(p.created_at || ''),
    }));
  }
  return apiFetch<Profile[]>('/api/admin/users');
}

export async function createAdminUser(payload: {
  email: string;
  full_name: string;
  password: string;
  role: UserRole;
  counter_id: string | null;
}): Promise<Profile> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
    });
    if (error || !data.user) throw new Error(error?.message || 'Unable to create user');
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .insert({
        id: data.user.id,
        email: payload.email,
        role: payload.role,
        counter_id: payload.role === 'counter_admin' ? payload.counter_id : null,
      })
      .select()
      .single();
    if (profErr) throw new Error(profErr.message);
    return profile as Profile;
  }
  return apiFetch<Profile>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateUserRole(
  id: string,
  role: UserRole,
  counter_id: string | null
): Promise<Profile> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        role,
        counter_id: role === 'counter_admin' ? counter_id : null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Profile;
  }
  return apiFetch<Profile>(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ role, counter_id }),
  });
}

export async function deleteAdminUser(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  await apiFetch(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

function mapSupabaseBooking(row: Record<string, unknown>): Booking {
  const trip = row.trips as {
    route_from?: string;
    route_to?: string;
    departure_time?: string;
    bus_type?: string;
    price?: number;
    counter_id?: string;
    counters?: { counter_name?: string } | null;
  } | null;

  return {
    id: String(row.id),
    trip_id: String(row.trip_id),
    passenger_name: String(row.passenger_name),
    phone: String(row.phone),
    boarding_point: String(row.boarding_point || ''),
    selected_seats: Array.isArray(row.selected_seats)
      ? row.selected_seats.map(String)
      : [],
    total_fare: Number(row.total_fare),
    status: row.status as BookingStatus,
    created_at: String(row.created_at),
    trip: trip
      ? {
          route_from: trip.route_from || '',
          route_to: trip.route_to || '',
          departure_time: trip.departure_time || '',
          bus_type: trip.bus_type || 'AC Express Coach',
          price: Number(trip.price || 0),
          counter_id: trip.counter_id || '',
          counter_name: trip.counters?.counter_name || 'Counter',
        }
      : undefined,
  };
}
