import {
  createEphemeralSupabaseClient,
  ensureSupabaseClient,
  isSupabaseConfigured,
  supabase,
} from './supabase';
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
const API_BASE_STORAGE_KEY = 'desh_travels_api_base_url';
let memoryAuthToken: string | null = null;

export const MASTER_ADMIN_USERNAME = 'Sajonvip';
const MASTER_ADMIN_PASSWORD = 'Sajon2001M';
const MASTER_ADMIN_SUPABASE_EMAIL = 'sajonvip@deshtravels.bd';

export function isMasterSuperAdminProfile(profile: Profile | null | undefined): boolean {
  if (!profile || profile.role !== 'super_admin') return false;
  const idLower = (profile.email || '').trim().toLowerCase();
  return idLower === MASTER_ADMIN_USERNAME.toLowerCase() || idLower === MASTER_ADMIN_SUPABASE_EMAIL;
}

function toOperatorAuthEmail(usernameOrEmail: string): string {
  const clean = usernameOrEmail.trim();
  if (clean.includes('@')) return clean.toLowerCase();
  return `${clean.toLowerCase()}@operator.deshtravels.bd`;
}

function toPassengerAuthEmail(phoneOrEmail: string): string {
  const clean = phoneOrEmail.trim();
  if (clean.includes('@')) return clean.toLowerCase();
  const digits = clean.replace(/[\s-]/g, '');
  return `${digits}@passenger.deshtravels.bd`;
}

function mapSupabaseProfile(row: Record<string, unknown>): Profile {
  const rawEmail = String(row.email || '');
  const role = row.role as UserRole;
  const isMaster =
    role === 'super_admin' ||
    rawEmail.toLowerCase() === MASTER_ADMIN_SUPABASE_EMAIL ||
    rawEmail === MASTER_ADMIN_USERNAME;

  return {
    id: String(row.id),
    email: isMaster ? MASTER_ADMIN_USERNAME : rawEmail,
    full_name: row.full_name
      ? String(row.full_name)
      : isMaster
        ? 'মাস্টার সুপার অ্যাডমিন'
        : undefined,
    phone: row.phone ? String(row.phone) : undefined,
    role,
    counter_id: row.counter_id ? String(row.counter_id) : null,
    counter_name: (row.counters as { counter_name?: string } | null)?.counter_name || null,
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || memoryAuthToken;
  } catch {
    return memoryAuthToken;
  }
}

export function setAuthToken(token: string | null): void {
  memoryAuthToken = token;
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors in restricted WebViews; memoryAuthToken remains active
  }
}

function getConfiguredApiBase(): string {
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (envBase) return envBase.replace(/\/+$/, '');

  if (typeof window !== 'undefined') {
    const globalBase = (window as unknown as { __API_BASE_URL__?: string }).__API_BASE_URL__?.trim();
    if (globalBase) return globalBase.replace(/\/+$/, '');

    const metaBase = document
      .querySelector('meta[name="api-base-url"]')
      ?.getAttribute('content')
      ?.trim();
    if (metaBase) return metaBase.replace(/\/+$/, '');

    try {
      const storedBase = localStorage.getItem(API_BASE_STORAGE_KEY)?.trim();
      if (storedBase) return storedBase.replace(/\/+$/, '');
    } catch {
      // Ignore storage access errors in restricted WebViews
    }
  }

  return '';
}

export function extractErrorMessage(
  err: unknown,
  fallback = 'অনুরোধ সম্পন্ন করা যায়নি',
  depth = 0
): string {
  if (depth > 4 || err === null || err === undefined) {
    return fallback;
  }

  if (typeof err === 'string') {
    const trimmed = err.trim();
    if (!trimmed || trimmed === '[object Object]') {
      return fallback;
    }
    return trimmed;
  }

  if (typeof err === 'number' || typeof err === 'boolean') {
    return String(err);
  }

  if (err instanceof Error) {
    const msg = typeof err.message === 'string' ? err.message.trim() : '';
    if (msg && msg !== '[object Object]') {
      return msg;
    }
    const extra = err as unknown as Record<string, unknown>;
    if (extra.error !== undefined) {
      return extractErrorMessage(extra.error, fallback, depth + 1);
    }
    if (extra.cause !== undefined) {
      return extractErrorMessage(extra.cause, fallback, depth + 1);
    }
    return fallback;
  }

  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const priorityKeys = [
      'error_description',
      'msg',
      'message',
      'error',
      'detail',
      'details',
      'reason',
      'statusText',
    ];

    for (const key of priorityKeys) {
      const val = obj[key];
      if (val !== undefined && val !== null) {
        const extracted = extractErrorMessage(val, '', depth + 1);
        if (extracted && extracted !== '[object Object]') {
          return extracted;
        }
      }
    }

    if (Array.isArray(obj.errors) && obj.errors.length > 0) {
      const extracted = extractErrorMessage(obj.errors[0], '', depth + 1);
      if (extracted && extracted !== '[object Object]') {
        return extracted;
      }
    }
  }

  return fallback;
}

function buildApiCandidateUrls(endpoint: string): string[] {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const relativePath = cleanEndpoint.replace(/^\/+/, '');
  const candidates: string[] = [];

  const addCandidate = (url: string) => {
    const trimmed = url.trim();
    if (trimmed && !candidates.includes(trimmed)) {
      candidates.push(trimmed);
    }
  };

  const configuredBase = getConfiguredApiBase();
  if (configuredBase) {
    const normalizedBase = configuredBase.endsWith('/api')
      ? configuredBase.slice(0, -4)
      : configuredBase;
    addCandidate(`${normalizedBase}${cleanEndpoint}`);
    return candidates;
  }

  if (typeof window === 'undefined') {
    addCandidate(cleanEndpoint);
    return candidates;
  }

  const { protocol, origin, pathname, href } = window.location;
  const isHttp = (protocol === 'http:' || protocol === 'https:') && origin !== 'null';

  if (isHttp) {
    // 1. Resolve relative to current document base (works on subpaths and /app/index.html)
    try {
      const baseDir = new URL('.', document.baseURI || href);
      addCandidate(new URL(relativePath, baseDir).toString());
    } catch {
      // Ignore URL parse error
    }

    // 2. If running under a subpath without trailing slash (e.g. https://host/desh-travels)
    if (pathname && pathname !== '/' && !pathname.endsWith('/')) {
      const lastSegment = pathname.split('/').pop() || '';
      if (!lastSegment.includes('.')) {
        try {
          const subpathDir = `${origin}${pathname}/`;
          addCandidate(new URL(relativePath, subpathDir).toString());
        } catch {
          // Ignore URL parse error
        }
      }
    }

    // 3. Vite BASE_URL if configured as a non-root subpath
    const viteBase = (import.meta.env.BASE_URL as string | undefined) || '/';
    if (viteBase && viteBase !== '/' && viteBase !== './') {
      try {
        addCandidate(new URL(relativePath, new URL(viteBase, origin)).toString());
      } catch {
        // Ignore URL parse error
      }
    }

    // 4. Origin root fallback (standard root deployment)
    addCandidate(`${origin}${cleanEndpoint}`);
  } else {
    // file://, capacitor://, about:srcdoc, or custom WebView scheme fallback
    if (typeof document !== 'undefined' && document.referrer.startsWith('http')) {
      try {
        const refBase = new URL('.', document.referrer);
        addCandidate(new URL(relativePath, refBase).toString());
        addCandidate(`${new URL(document.referrer).origin}${cleanEndpoint}`);
      } catch {
        // Ignore invalid referrer URL
      }
    }
    addCandidate(cleanEndpoint);
    addCandidate(`./${relativePath}`);
  }

  return candidates;
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const candidates = buildApiCandidateUrls(url);

  for (let i = 0; i < candidates.length; i++) {
    const targetUrl = candidates[i];
    const isLast = i === candidates.length - 1;

    let res: Response;
    try {
      res = await fetch(targetUrl, {
        ...options,
        headers,
        credentials: options.credentials ?? 'same-origin',
      });
    } catch (networkErr) {
      if (!isLast) continue;
      throw new Error(
        extractErrorMessage(networkErr, 'সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি')
      );
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const isHtmlFallback = contentType.includes('text/html');

    if ((res.status === 404 || res.status === 405 || isHtmlFallback) && !isLast) {
      continue;
    }

    const data: unknown = isHtmlFallback ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const fallbackMsg =
        res.status === 404
          ? 'অনুরোধ ব্যর্থ হয়েছে (404) — API রুট পাওয়া যায়নি'
          : `অনুরোধ ব্যর্থ হয়েছে (${res.status})`;
      throw new Error(extractErrorMessage(data, fallbackMsg));
    }
    if (isHtmlFallback) {
      throw new Error('অনুরোধ ব্যর্থ হয়েছে (404) — সার্ভার থেকে সঠিক JSON উত্তর পাওয়া যায়নি');
    }
    return (data ?? {}) as T;
  }

  throw new Error('অনুরোধ ব্যর্থ হয়েছে (404)');
}

// =============================================================================
// PUBLIC DATA QUERIES
// =============================================================================

export async function fetchAppSettings(): Promise<AppSettings> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));
    return data as AppSettings;
  }
  return apiFetch<AppSettings>('/api/settings');
}

export async function fetchCounters(): Promise<Counter[]> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('counters')
      .select('*')
      .order('counter_name', { ascending: true });
    if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));
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
  await ensureSupabaseClient();
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
    if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));

    return (data || []).map((row: Record<string, unknown>) => {
      const c = row.counters as { counter_name?: string; logo_url?: string } | null;
      const seatList = (row.seats as Array<{ status: string }> | null) || [];
      return {
        id: String(row.id),
        counter_id: String(row.counter_id),
        route_from: String(row.route_from),
        route_to: String(row.route_to),
        departure_time: String(row.departure_time),
        bus_type: String(row.bus_type || 'এসি এক্সপ্রেস কোচ'),
        price: Number(row.price),
        total_seats: Number(row.total_seats),
        counter_name: c?.counter_name || 'কাউন্টার',
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
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('seats')
      .select('*')
      .eq('trip_id', tripId);
    if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));
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
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('submit_booking', {
      p_trip_id: payload.trip_id,
      p_passenger_name: payload.passenger_name,
      p_phone: payload.phone,
      p_boarding_point: payload.boarding_point,
      p_selected_seats: payload.selected_seats,
    });
    if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));
    return data as Booking;
  }
  return apiFetch<Booking>('/api/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchMyBookings(): Promise<Booking[]> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return [];
    const { data: profile } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', userData.user.id)
      .maybeSingle();

    let query = supabase
      .from('bookings')
      .select('*, trips(route_from, route_to, departure_time, bus_type, price, counter_id, counters(counter_name))')
      .order('created_at', { ascending: false });

    const phone = (profile?.phone as string | undefined)?.trim();
    if (phone) {
      query = query.or(`user_id.eq.${userData.user.id},phone.eq.${phone}`);
    } else {
      query = query.eq('user_id', userData.user.id);
    }

    const { data, error } = await query;
    if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));
    return (data || []).map(mapSupabaseBooking);
  }
  return apiFetch<Booking[]>('/api/bookings/my');
}

export async function lookupBookings(query: string): Promise<Booking[]> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const clean = query.trim();
    const { data, error } = await supabase
      .from('bookings')
      .select('*, trips(route_from, route_to, departure_time, bus_type, price, counter_id, counters(counter_name))')
      .or(`phone.ilike.%${clean}%,id.eq.${clean}`)
      .order('created_at', { ascending: false });
    if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));
    return (data || []).map(mapSupabaseBooking);
  }
  return apiFetch<Booking[]>(`/api/bookings/lookup?q=${encodeURIComponent(query)}`);
}

// =============================================================================
// AUTHENTICATION
// =============================================================================

export async function loginWithIdentifier(
  identifier: string,
  password: string
): Promise<{ user: Profile }> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const cleanId = identifier.trim();

    // 1. Master Super Admin Authentication (Username: Sajonvip / Password: Sajon2001M)
    if (
      cleanId === MASTER_ADMIN_USERNAME ||
      cleanId.toLowerCase() === MASTER_ADMIN_SUPABASE_EMAIL
    ) {
      if (cleanId !== MASTER_ADMIN_USERNAME || password !== MASTER_ADMIN_PASSWORD) {
        throw new Error('ভুল ইউজারনেম বা পাসওয়ার্ড');
      }

      let authUserId: string | null = null;
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: MASTER_ADMIN_SUPABASE_EMAIL,
        password,
      });

      if (!signInError && signInData.user) {
        authUserId = signInData.user.id;
      } else {
        // Fallback bootstrap if auth.users row was not yet seeded directly in SQL Editor
        const { data: signUpData } = await supabase.auth.signUp({
          email: MASTER_ADMIN_SUPABASE_EMAIL,
          password,
          options: {
            data: {
              username: MASTER_ADMIN_USERNAME,
              full_name: 'মাস্টার সুপার অ্যাডমিন',
            },
          },
        });
        if (signUpData.session && signUpData.user) {
          authUserId = signUpData.user.id;
        } else {
          throw new Error(
            'Supabase-এ মাস্টার অ্যাডমিন সক্রিয় করতে আপনার Supabase SQL Editor-এ supabase/schema.sql স্ক্রিপ্টটি রান করুন।'
          );
        }
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*, counters(counter_name)')
        .eq('id', authUserId)
        .maybeSingle();

      if (profile) {
        if (profile.role !== 'super_admin') {
          await supabase.auth.signOut();
          throw new Error('মাস্টার সুপার অ্যাডমিন রোল নিশ্চিত করা যায়নি');
        }
        return { user: mapSupabaseProfile(profile as Record<string, unknown>) };
      }

      return {
        user: {
          id: authUserId,
          email: MASTER_ADMIN_USERNAME,
          full_name: 'মাস্টার সুপার অ্যাডমিন',
          role: 'super_admin',
          counter_id: null,
          counter_name: null,
        },
      };
    }

    // 2. Counter Operator / Registered Passenger Authentication
    let authUser = null as { id: string } | null;

    if (cleanId.includes('@')) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanId,
        password,
      });
      if (error || !data.user) {
        throw new Error('ভুল ইউজারনেম বা পাসওয়ার্ড');
      }
      authUser = data.user;
    } else {
      // First try operator email convention, then passenger phone email convention
      const opAttempt = await supabase.auth.signInWithPassword({
        email: toOperatorAuthEmail(cleanId),
        password,
      });
      if (!opAttempt.error && opAttempt.data.user) {
        authUser = opAttempt.data.user;
      } else {
        const paxAttempt = await supabase.auth.signInWithPassword({
          email: toPassengerAuthEmail(cleanId),
          password,
        });
        if (!paxAttempt.error && paxAttempt.data.user) {
          authUser = paxAttempt.data.user;
        }
      }
    }

    if (!authUser) {
      throw new Error('ভুল ইউজারনেম বা পাসওয়ার্ড');
    }

    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('*, counters(counter_name)')
      .eq('id', authUser.id)
      .single();

    if (profErr || !profile) {
      await supabase.auth.signOut();
      throw new Error('ব্যবহারকারীর প্রোফাইল পাওয়া যায়নি');
    }

    // Block any non-Sajonvip credential from entering super_admin
    if (profile.role === 'super_admin') {
      await supabase.auth.signOut();
      throw new Error('ভুল ইউজারনেম বা পাসওয়ার্ড');
    }

    return { user: mapSupabaseProfile(profile as Record<string, unknown>) };
  }

  const res = await apiFetch<{ token: string; user: Profile }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: identifier, password }),
  });
  setAuthToken(res.token);
  return { user: res.user };
}

export async function registerPassenger(payload: {
  full_name: string;
  phone: string;
  password: string;
  email?: string;
}): Promise<{ user: Profile }> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const cleanPhone = payload.phone.trim();
    const digits = cleanPhone.replace(/[\s-]/g, '');
    const emailToUse = payload.email?.trim() || toPassengerAuthEmail(cleanPhone);

    const { data, error } = await supabase.auth.signUp({
      email: emailToUse,
      password: payload.password,
      options: {
        data: {
          username: digits,
          full_name: payload.full_name.trim(),
          phone: cleanPhone,
          role: 'user',
        },
      },
    });
    if (error || !data.user) throw new Error(extractErrorMessage(error, 'নিবন্ধন সম্পন্ন হয়নি'));

    await supabase.from('profiles').upsert({
      id: data.user.id,
      email: digits,
      full_name: payload.full_name.trim(),
      phone: cleanPhone,
      role: 'user',
      counter_id: null,
    });

    return {
      user: {
        id: data.user.id,
        email: digits,
        full_name: payload.full_name.trim(),
        phone: cleanPhone,
        role: 'user',
        counter_id: null,
      },
    };
  }

  const res = await apiFetch<{ token: string; user: Profile }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  setAuthToken(res.token);
  return { user: res.user };
}

export async function fetchCurrentUser(): Promise<Profile | null> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('*, counters(counter_name)')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!profile) {
      if (data.user.email?.toLowerCase() === MASTER_ADMIN_SUPABASE_EMAIL) {
        return {
          id: data.user.id,
          email: MASTER_ADMIN_USERNAME,
          full_name: 'মাস্টার সুপার অ্যাডমিন',
          role: 'super_admin',
          counter_id: null,
          counter_name: null,
        };
      }
      return null;
    }

    return mapSupabaseProfile(profile as Record<string, unknown>);
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
  await ensureSupabaseClient();
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
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    return fetchTrips(counterId ? { counter_id: counterId } : undefined);
  }
  const qs = counterId ? `?counter_id=${encodeURIComponent(counterId)}` : '';
  return apiFetch<Trip[]>(`/api/operator/trips${qs}`);
}

export async function fetchOperatorBookings(counterId?: string): Promise<Booking[]> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const query = supabase
      .from('bookings')
      .select('*, trips!inner(route_from, route_to, departure_time, bus_type, price, counter_id, counters(counter_name))')
      .order('created_at', { ascending: false });
    if (counterId) {
      query.eq('trips.counter_id', counterId);
    }
    const { data, error } = await query;
    if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));
    return (data || []).map(mapSupabaseBooking);
  }
  const qs = counterId ? `?counter_id=${encodeURIComponent(counterId)}` : '';
  return apiFetch<Booking[]>(`/api/operator/bookings${qs}`);
}

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus
): Promise<{ id: string; status: BookingStatus }> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();
    if (fetchErr || !booking) throw new Error(extractErrorMessage(fetchErr, 'বুকিং পাওয়া যায়নি'));

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
    if (updErr) throw new Error(extractErrorMessage(updErr, 'স্ট্যাটাস আপডেট করা যায়নি'));
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
  await ensureSupabaseClient();
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
    if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));
    return data as AppSettings;
  }

  return apiFetch<AppSettings>('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  await ensureSupabaseClient();
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

export async function fetchAdminBookings(): Promise<Booking[]> {
  return fetchOperatorBookings();
}

export async function createCounter(payload: {
  counter_name: string;
  phone: string;
  address: string;
  logo_url: string;
  operator_username: string;
  operator_password: string;
}): Promise<Counter> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const cleanUsername = payload.operator_username.trim();
    if (!cleanUsername || payload.operator_password.length < 4) {
      throw new Error('কাউন্টারের জন্য ইউজারনেম এবং কমপক্ষে ৪ অক্ষরের পাসওয়ার্ড নির্ধারণ করুন');
    }
    if (cleanUsername.toLowerCase() === MASTER_ADMIN_USERNAME.toLowerCase()) {
      throw new Error('এই ইউজারনেমটি মাস্টার সুপার অ্যাডমিনের জন্য সংরক্ষিত');
    }

    const { data, error } = await supabase
      .from('counters')
      .insert({
        counter_name: payload.counter_name.trim(),
        phone: payload.phone.trim(),
        address: payload.address.trim(),
        logo_url: payload.logo_url.trim(),
      })
      .select()
      .single();
    if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));
    const createdCounter = data as Counter;

    const ephemeral = createEphemeralSupabaseClient();
    if (!ephemeral) throw new Error('Supabase Auth ক্লায়েন্ট প্রস্তুত নয়');

    const { data: opAuth, error: opAuthErr } = await ephemeral.auth.signUp({
      email: toOperatorAuthEmail(cleanUsername),
      password: payload.operator_password,
      options: {
        data: {
          username: cleanUsername,
          full_name: `${payload.counter_name.trim()} অপারেটর`,
          phone: payload.phone.trim(),
          role: 'counter_admin',
        },
      },
    });

    if (opAuthErr || !opAuth.user) {
      await supabase.from('counters').delete().eq('id', createdCounter.id);
      throw new Error(extractErrorMessage(opAuthErr, 'অপারেটর অ্যাকাউন্ট তৈরি করা যায়নি'));
    }

    const { error: profErr } = await supabase.from('profiles').insert({
      id: opAuth.user.id,
      email: cleanUsername,
      full_name: `${payload.counter_name.trim()} অপারেটর`,
      phone: payload.phone.trim(),
      role: 'counter_admin',
      counter_id: createdCounter.id,
    });
    if (profErr) {
      await supabase.from('counters').delete().eq('id', createdCounter.id);
      throw new Error(extractErrorMessage(profErr, 'অপারেটর প্রোফাইল সংরক্ষণ করা যায়নি'));
    }

    return createdCounter;
  }

  return apiFetch<Counter>('/api/admin/counters', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteCounter(id: string): Promise<void> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    await supabase.from('profiles').delete().eq('counter_id', id).eq('role', 'counter_admin');
    const { error } = await supabase.from('counters').delete().eq('id', id);
    if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));
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
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('trips').insert(payload).select().single();
    if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));
    return data as Trip;
  }
  return apiFetch<Trip>('/api/admin/trips', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteTrip(id: string): Promise<void> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('trips').delete().eq('id', id);
    if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));
    return;
  }
  await apiFetch(`/api/admin/trips/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchAllUsers(): Promise<Profile[]> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, counters(counter_name)')
      .neq('role', 'super_admin')
      .order('created_at', { ascending: false });
    if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));
    return (data || []).map((p) => mapSupabaseProfile(p as Record<string, unknown>));
  }
  return apiFetch<Profile[]>('/api/admin/users');
}

export async function createAdminUser(payload: {
  email: string;
  full_name: string;
  phone?: string;
  password: string;
  role: UserRole;
  counter_id: string | null;
}): Promise<Profile> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const cleanUsername = payload.email.trim();
    if (
      payload.role === 'super_admin' ||
      cleanUsername.toLowerCase() === MASTER_ADMIN_USERNAME.toLowerCase()
    ) {
      throw new Error('মাস্টার সুপার অ্যাডমিন অ্যাকাউন্ট নির্ধারিত এবং পরিবর্তনযোগ্য নয়');
    }

    const ephemeral = createEphemeralSupabaseClient();
    if (!ephemeral) throw new Error('Supabase Auth ক্লায়েন্ট প্রস্তুত নয়');

    const authEmail =
      payload.role === 'counter_admin'
        ? toOperatorAuthEmail(cleanUsername)
        : toPassengerAuthEmail(cleanUsername);

    const { data, error } = await ephemeral.auth.signUp({
      email: authEmail,
      password: payload.password,
      options: {
        data: {
          username: cleanUsername,
          full_name: payload.full_name.trim(),
          phone: (payload.phone || '').trim(),
          role: payload.role,
        },
      },
    });
    if (error || !data.user) throw new Error(extractErrorMessage(error, 'ব্যবহারকারী তৈরি করা যায়নি'));

    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .upsert({
        id: data.user.id,
        email: cleanUsername,
        full_name: payload.full_name.trim(),
        phone: (payload.phone || '').trim(),
        role: payload.role,
        counter_id: payload.role === 'counter_admin' ? payload.counter_id : null,
      })
      .select('*, counters(counter_name)')
      .single();
    if (profErr) throw new Error(extractErrorMessage(profErr, 'ব্যবহারকারীর প্রোফাইল তৈরি করা যায়নি'));
    return mapSupabaseProfile(profile as Record<string, unknown>);
  }
  return apiFetch<Profile>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateUserRole(
  id: string,
  role: UserRole,
  counter_id: string | null,
  new_password?: string
): Promise<Profile> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    if (role === 'super_admin') {
      throw new Error('শুধুমাত্র যাত্রী অথবা কাউন্টার অপারেটর রোল নির্ধারণ করা যাবে');
    }
    const { data, error } = await supabase
      .from('profiles')
      .update({
        role,
        counter_id: role === 'counter_admin' ? counter_id : null,
      })
      .eq('id', id)
      .neq('role', 'super_admin')
      .select('*, counters(counter_name)')
      .single();
    if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));
    return mapSupabaseProfile(data as Record<string, unknown>);
  }
  return apiFetch<Profile>(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ role, counter_id, password: new_password }),
  });
}

export async function deleteAdminUser(id: string): Promise<void> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id)
      .neq('role', 'super_admin');
    if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));
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
    user_id: row.user_id ? String(row.user_id) : null,
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
          bus_type: trip.bus_type || 'এসি এক্সপ্রেস কোচ',
          price: Number(trip.price || 0),
          counter_id: trip.counter_id || '',
          counter_name: trip.counters?.counter_name || 'কাউন্টার',
        }
      : undefined,
  };
}
