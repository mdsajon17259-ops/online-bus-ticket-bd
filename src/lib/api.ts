import {
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
  PasswordResetLog,
  Profile,
  Seat,
  SeatStatus,
  Trip,
  UserRole,
} from '../types';

const TOKEN_KEY = 'transit_auth_token';
const STAFF_TOKEN_KEY = 'desh_travels_staff_token';
const API_BASE_STORAGE_KEY = 'desh_travels_api_base_url';
let memoryAuthToken: string | null = null;
let memoryStaffToken: string | null = null;

export const MASTER_ADMIN_USERNAME = 'Sajonvip';

export function isMasterSuperAdminProfile(profile: Profile | null | undefined): boolean {
  if (!profile || profile.role !== 'super_admin') return false;
  return (profile.email || '').trim() === MASTER_ADMIN_USERNAME;
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
  const isMaster = role === 'super_admin' || rawEmail === MASTER_ADMIN_USERNAME;

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
    token_version: typeof row.token_version === 'number' ? row.token_version : 1,
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
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors in restricted WebViews; memoryAuthToken remains active
  }
}

export function getStaffToken(): string | null {
  try {
    return localStorage.getItem(STAFF_TOKEN_KEY) || memoryStaffToken;
  } catch {
    return memoryStaffToken;
  }
}

export function setStaffToken(token: string | null): void {
  memoryStaffToken = token;
  try {
    if (token) {
      localStorage.setItem(STAFF_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(STAFF_TOKEN_KEY);
      sessionStorage.removeItem(STAFF_TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors in restricted WebViews; memoryStaffToken remains active
  }
}

function requireStaffToken(): string {
  const token = getStaffToken();
  if (!token) {
    throw new Error('আপনার সেশন মেয়াদোত্তীর্ণ হয়েছে বা অনুমোদিত নয়। অনুগ্রহ করে পুনরায় লগইন করুন।');
  }
  return token;
}

function handleSupabaseRpcError(error: unknown, fallback: string): Error {
  const msg = extractErrorMessage(error, fallback);
  const lower = msg.toLowerCase();
  if (
    lower.includes('could not find the function') ||
    lower.includes('does not exist') ||
    lower.includes('pgrst202') ||
    lower.includes('42883')
  ) {
    return new Error(
      'Supabase ডাটাবেসে কাস্টম অ্যাকাউন্ট টেবিল ও ফাংশন সক্রিয় করতে অনুগ্রহ করে Supabase SQL Editor-এ সর্বশেষ supabase/schema.sql স্ক্রিপ্টটি রান করুন।'
    );
  }
  return new Error(msg);
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

export function buildApiCandidateUrls(endpoint: string): string[] {
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
      .order('created_at', { ascending: true });
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
  payment_method?: string;
  trx_id?: string;
}): Promise<Booking> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    let { data, error } = await supabase.rpc('submit_booking', {
      p_trip_id: payload.trip_id,
      p_passenger_name: payload.passenger_name,
      p_phone: payload.phone,
      p_boarding_point: payload.boarding_point,
      p_selected_seats: payload.selected_seats,
      p_payment_method: payload.payment_method || '',
      p_trx_id: payload.trx_id || '',
    });

    if (error) {
      const errMsg = extractErrorMessage(error, '').toLowerCase();
      if (
        errMsg.includes('could not find the function') ||
        errMsg.includes('pgrst202') ||
        errMsg.includes('42883')
      ) {
        const retry = await supabase.rpc('submit_booking', {
          p_trip_id: payload.trip_id,
          p_passenger_name: payload.passenger_name,
          p_phone: payload.phone,
          p_boarding_point: payload.boarding_point,
          p_selected_seats: payload.selected_seats,
        });
        data = retry.data;
        error = retry.error;
      }
    }

    if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));
    const rawBooking = data as Booking;
    if (!rawBooking.trip && rawBooking.id) {
      const { data: fullRow } = await supabase
        .from('bookings')
        .select('*, trips(route_from, route_to, departure_time, bus_type, price, counter_id, counters(counter_name, phone))')
        .eq('id', rawBooking.id)
        .maybeSingle();
      if (fullRow) {
        const mapped = mapSupabaseBooking(fullRow as Record<string, unknown>);
        return {
          ...mapped,
          payment_method: mapped.payment_method || payload.payment_method || '',
          trx_id: mapped.trx_id || payload.trx_id || '',
        };
      }
    }
    return {
      ...rawBooking,
      payment_method: rawBooking.payment_method || payload.payment_method || '',
      trx_id: rawBooking.trx_id || payload.trx_id || '',
    };
  }
  return apiFetch<Booking>('/api/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchMyBookings(): Promise<Booking[]> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const staffToken = getStaffToken();
    if (staffToken) {
      const { data: staffUser } = await supabase.rpc('staff_me', { p_token: staffToken });
      const staffPhone = (staffUser as { phone?: string } | null)?.phone?.trim();
      if (staffPhone) {
        const { data, error } = await supabase
          .from('bookings')
          .select('*, trips(route_from, route_to, departure_time, bus_type, price, counter_id, counters(counter_name, phone))')
          .eq('phone', staffPhone)
          .order('created_at', { ascending: false });
        if (error) throw new Error(extractErrorMessage(error, 'তথ্য প্রক্রিয়া করা যায়নি'));
        return (data || []).map(mapSupabaseBooking);
      }
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return [];
    const { data: profile } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', userData.user.id)
      .maybeSingle();

    let query = supabase
      .from('bookings')
      .select('*, trips(route_from, route_to, departure_time, bus_type, price, counter_id, counters(counter_name, phone))')
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
    if (!clean) return [];
    const noHash = clean.replace(/^#/, '').trim();
    const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(noHash);
    const isShortHex = /^[0-9a-f]{8}$/i.test(noHash);

    let builder = supabase
      .from('bookings')
      .select('*, trips(route_from, route_to, departure_time, bus_type, price, counter_id, counters(counter_name, phone))')
      .order('created_at', { ascending: false });

    if (isFullUuid) {
      builder = builder.or(`phone.ilike.%${clean}%,id.eq.${noHash.toLowerCase()}`);
    } else if (isShortHex) {
      const hex = noHash.toLowerCase();
      builder = builder.or(
        `phone.ilike.%${clean}%,and(id.gte.${hex}-0000-0000-0000-000000000000,id.lte.${hex}-ffff-ffff-ffff-ffffffffffff)`
      );
    } else {
      const digitsOnly = clean.replace(/[\s-]/g, '');
      builder = builder.ilike('phone', `%${digitsOnly}%`);
    }

    const { data, error } = await builder;
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
    if (!cleanId || !password) {
      throw new Error('ইউজারনেম ও পাসওয়ার্ড দিন');
    }

    // 1. Custom Database Verification (Super Admin, Counter Admin, Counter Representative, Admin-created users)
    const { data: staffData, error: staffErr } = await supabase.rpc('staff_login', {
      p_username: cleanId,
      p_password: password,
    });

    if (staffErr) {
      throw handleSupabaseRpcError(staffErr, 'লগইন যাচাই করা যায়নি');
    }

    const staffRes = staffData as { ok?: boolean; token?: string; user?: Profile } | null;
    if (staffRes?.ok && staffRes.token && staffRes.user) {
      await supabase.auth.signOut().catch(() => undefined);
      setStaffToken(staffRes.token);
      return { user: staffRes.user };
    }

    throw new Error('Invalid username or password');
  }

  const res = await apiFetch<{ token: string; user: Profile }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: identifier, password }),
  });
  if (
    res.user.role !== 'super_admin' &&
    res.user.role !== 'counter_admin' &&
    res.user.role !== 'counter_representative'
  ) {
    setAuthToken(null);
    throw new Error('সঠিক তথ্য ও পাসওয়ার্ড দিন অথবা গেস্ট হিসেবে টিকিট কাটুন।');
  }
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

    const { data: available } = await supabase.rpc('is_username_available', {
      p_username: digits,
    });
    if (available === false) {
      throw new Error('এই মোবাইল নম্বর/ইউজারনেমটি ইতিমধ্যে সিস্টেমে ব্যবহৃত হয়েছে।');
    }

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

    setStaffToken(null);
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
    const staffToken = getStaffToken();
    if (staffToken) {
      const { data: staffUser, error: staffErr } = await supabase.rpc('staff_me', {
        p_token: staffToken,
      });
      if (!staffErr && staffUser) {
        return staffUser as Profile;
      }
      // Session expired or invalidated (e.g. after Admin password reset)
      setStaffToken(null);
    }
    return null;
  }

  if (!getAuthToken()) return null;
  try {
    const profile = await apiFetch<Profile>('/api/auth/me');
    if (
      profile.role !== 'super_admin' &&
      profile.role !== 'counter_admin' &&
      profile.role !== 'counter_representative'
    ) {
      setAuthToken(null);
      return null;
    }
    return profile;
  } catch {
    setAuthToken(null);
    return null;
  }
}

export async function signOutUser(): Promise<void> {
  const staffToken = getStaffToken();
  setAuthToken(null);
  setStaffToken(null);
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    if (staffToken) {
      try {
        await supabase.rpc('staff_logout', { p_token: staffToken });
      } catch {
        // Ignore logout RPC error
      }
    }
    await supabase.auth.signOut().catch(() => undefined);
  }
}

// =============================================================================
// COUNTER OPERATOR & REPRESENTATIVE ACTIONS
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

export async function createCounterTrip(payload: {
  counter_id?: string;
  route_from: string;
  route_to: string;
  departure_time: string;
  bus_type: string;
  price: number;
  total_seats: number;
}): Promise<Trip> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('staff_create_trip', {
      p_token: requireStaffToken(),
      p_counter_id: payload.counter_id || null,
      p_route_from: payload.route_from,
      p_route_to: payload.route_to,
      p_departure_time: payload.departure_time,
      p_bus_type: payload.bus_type,
      p_price: Number(payload.price),
      p_total_seats: Number(payload.total_seats),
    });
    if (error) throw handleSupabaseRpcError(error, 'ট্রিপ তৈরি করা যায়নি');
    return data as Trip;
  }
  return apiFetch<Trip>('/api/operator/trips', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCounterTrip(
  tripId: string,
  payload: {
    route_from: string;
    route_to: string;
    departure_time: string;
    bus_type: string;
    price: number;
  }
): Promise<Trip> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('staff_update_trip', {
      p_token: requireStaffToken(),
      p_trip_id: tripId,
      p_route_from: payload.route_from.trim(),
      p_route_to: payload.route_to.trim(),
      p_departure_time: payload.departure_time,
      p_bus_type: payload.bus_type.trim(),
      p_price: Number(payload.price),
    });
    if (error) throw handleSupabaseRpcError(error, 'ট্রিপ আপডেট করা যায়নি');
    return data as Trip;
  }
  return apiFetch<Trip>(`/api/operator/trips/${encodeURIComponent(tripId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteCounterTrip(tripId: string): Promise<void> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('staff_delete_trip', {
      p_token: requireStaffToken(),
      p_trip_id: tripId,
    });
    if (error) throw handleSupabaseRpcError(error, 'ট্রিপ মুছে ফেলা যায়নি');
    return;
  }
  await apiFetch(`/api/operator/trips/${encodeURIComponent(tripId)}`, { method: 'DELETE' });
}

export async function toggleCounterSeat(
  tripId: string,
  seatNumber: string,
  status: SeatStatus
): Promise<Seat> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('staff_toggle_seat', {
      p_token: requireStaffToken(),
      p_trip_id: tripId,
      p_seat_number: seatNumber,
      p_status: status,
    });
    if (error) throw handleSupabaseRpcError(error, 'আসনের অবস্থা পরিবর্তন করা যায়নি');
    return data as Seat;
  }
  return apiFetch<Seat>(
    `/api/operator/trips/${encodeURIComponent(tripId)}/seats/${encodeURIComponent(seatNumber)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }
  );
}

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus
): Promise<{ id: string; status: BookingStatus }> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('staff_update_booking_status', {
      p_token: requireStaffToken(),
      p_booking_id: bookingId,
      p_status: status,
    });
    if (error) throw handleSupabaseRpcError(error, 'স্ট্যাটাস আপডেট করা যায়নি');
    return data as { id: string; status: BookingStatus };
  }

  return apiFetch<{ id: string; status: BookingStatus }>(
    `/api/operator/bookings/${encodeURIComponent(bookingId)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }
  );
}

export async function createCounterBooking(payload: {
  trip_id: string;
  passenger_name: string;
  phone: string;
  boarding_point: string;
  selected_seats: string[];
  status?: 'pending' | 'confirmed';
  total_fare?: number;
}): Promise<Booking> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('staff_create_booking', {
      p_token: requireStaffToken(),
      p_trip_id: payload.trip_id,
      p_passenger_name: payload.passenger_name.trim(),
      p_phone: payload.phone.trim(),
      p_boarding_point: payload.boarding_point.trim(),
      p_selected_seats: payload.selected_seats,
      p_status: payload.status || 'confirmed',
      p_total_fare:
        typeof payload.total_fare === 'number' && Number.isFinite(payload.total_fare)
          ? payload.total_fare
          : null,
    });
    if (error) throw handleSupabaseRpcError(error, 'টিকিট বুকিং সম্পন্ন করা যায়নি');
    return data as Booking;
  }

  return apiFetch<Booking>('/api/operator/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
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
    const { data, error } = await supabase.rpc('admin_update_settings', {
      p_token: requireStaffToken(),
      p_organization_name: payload.organization_name,
      p_organization_logo_url: payload.organization_logo_url,
    });
    if (error) throw handleSupabaseRpcError(error, 'সেটিংস সংরক্ষণ করা যায়নি');
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

export async function fetchAdminCounters(): Promise<Counter[]> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('admin_list_counters', {
      p_token: requireStaffToken(),
    });
    if (error) throw handleSupabaseRpcError(error, 'কাউন্টার তালিকা লোড করা যায়নি');
    return (data || []) as Counter[];
  }
  return apiFetch<Counter[]>('/api/admin/counters');
}

export async function createCounter(payload: {
  counter_name: string;
  phone: string;
  address: string;
  logo_url: string;
  operator_username: string;
  operator_password: string;
  representative_username: string;
  representative_password: string;
}): Promise<Counter> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const cleanOpUsername = payload.operator_username.trim();
    const cleanRepUsername = payload.representative_username.trim();

    if (!cleanOpUsername || payload.operator_password.length < 6) {
      throw new Error('কাউন্টারের জন্য ইউজারনেম এবং কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড নির্ধারণ করুন');
    }
    if (!cleanRepUsername || payload.representative_password.length < 6) {
      throw new Error('কাউন্টার প্রতিনিধির জন্য ইউজারনেম এবং কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড নির্ধারণ করুন');
    }
    if (cleanOpUsername.toLowerCase() === cleanRepUsername.toLowerCase()) {
      throw new Error('কাউন্টার ইউজারনেম এবং প্রতিনিধি ইউজারনেম এক হতে পারবে না');
    }
    if (
      cleanOpUsername.toLowerCase() === MASTER_ADMIN_USERNAME.toLowerCase() ||
      cleanRepUsername.toLowerCase() === MASTER_ADMIN_USERNAME.toLowerCase()
    ) {
      throw new Error('এই ইউজারনেমটি মাস্টার সুপার অ্যাডমিনের জন্য সংরক্ষিত');
    }

    const { data, error } = await supabase.rpc('admin_create_counter', {
      p_token: requireStaffToken(),
      p_counter_name: payload.counter_name.trim(),
      p_phone: payload.phone.trim(),
      p_address: payload.address.trim(),
      p_logo_url: payload.logo_url.trim(),
      p_operator_username: cleanOpUsername,
      p_operator_password: payload.operator_password,
      p_representative_username: cleanRepUsername,
      p_representative_password: payload.representative_password,
    });
    if (error) throw handleSupabaseRpcError(error, 'কাউন্টার তৈরি করা যায়নি');
    return data as Counter;
  }

  return apiFetch<Counter>('/api/admin/counters', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function resetCounterAccountPassword(payload: {
  counter_id: string;
  target_role: 'counter_admin' | 'counter_representative';
  new_password: string;
}): Promise<PasswordResetLog> {
  if (!payload.new_password || payload.new_password.length < 6) {
    throw new Error('নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে');
  }
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('admin_reset_account_password', {
      p_token: requireStaffToken(),
      p_counter_id: payload.counter_id,
      p_target_role: payload.target_role,
      p_new_password: payload.new_password,
    });
    if (error) {
      throw handleSupabaseRpcError(error, 'পাসওয়ার্ড রিসেট করা যায়নি');
    }
    return data as PasswordResetLog;
  }

  return apiFetch<PasswordResetLog>(
    `/api/admin/counters/${encodeURIComponent(payload.counter_id)}/reset-password`,
    {
      method: 'POST',
      body: JSON.stringify({
        target_role: payload.target_role,
        new_password: payload.new_password,
      }),
    }
  );
}

export async function fetchPasswordResetLogs(): Promise<PasswordResetLog[]> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('admin_get_password_reset_logs', {
      p_token: requireStaffToken(),
    });
    if (error) return [];
    return (data || []) as PasswordResetLog[];
  }
  return apiFetch<PasswordResetLog[]>('/api/admin/password-reset-logs');
}

export async function deleteCounter(id: string): Promise<void> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('admin_delete_counter', {
      p_token: requireStaffToken(),
      p_counter_id: id,
    });
    if (error) throw handleSupabaseRpcError(error, 'কাউন্টার মুছে ফেলা যায়নি');
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
    const { data, error } = await supabase.rpc('staff_create_trip', {
      p_token: requireStaffToken(),
      p_counter_id: payload.counter_id,
      p_route_from: payload.route_from,
      p_route_to: payload.route_to,
      p_departure_time: payload.departure_time,
      p_bus_type: payload.bus_type,
      p_price: Number(payload.price),
      p_total_seats: Number(payload.total_seats),
    });
    if (error) throw handleSupabaseRpcError(error, 'ট্রিপ তৈরি করা যায়নি');
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
    const { error } = await supabase.rpc('staff_delete_trip', {
      p_token: requireStaffToken(),
      p_trip_id: id,
    });
    if (error) throw handleSupabaseRpcError(error, 'ট্রিপ মুছে ফেলা যায়নি');
    return;
  }
  await apiFetch(`/api/admin/trips/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchAllUsers(): Promise<Profile[]> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('admin_list_users', {
      p_token: requireStaffToken(),
    });
    if (error) throw handleSupabaseRpcError(error, 'ব্যবহারকারী তালিকা লোড করা যায়নি');
    return (data || []) as Profile[];
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
    if (payload.password.length < 6) {
      throw new Error('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে');
    }

    const isCounterRole =
      payload.role === 'counter_admin' || payload.role === 'counter_representative';

    const { data, error } = await supabase.rpc('admin_create_staff_account', {
      p_token: requireStaffToken(),
      p_username: cleanUsername,
      p_full_name: payload.full_name.trim(),
      p_phone: (payload.phone || '').trim(),
      p_password: payload.password,
      p_role: payload.role,
      p_counter_id: isCounterRole ? payload.counter_id : null,
    });
    if (error) throw handleSupabaseRpcError(error, 'ব্যবহারকারী তৈরি করা যায়নি');
    return data as Profile;
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
      throw new Error('শুধুমাত্র যাত্রী, কাউন্টার অথবা প্রতিনিধি রোল নির্ধারণ করা যাবে');
    }
    const isCounterRole = role === 'counter_admin' || role === 'counter_representative';
    const { data, error } = await supabase.rpc('admin_update_staff_role', {
      p_token: requireStaffToken(),
      p_staff_id: id,
      p_role: role,
      p_counter_id: isCounterRole ? counter_id : null,
    });
    if (error) throw handleSupabaseRpcError(error, 'রোল পরিবর্তন করা যায়নি');
    return data as Profile;
  }
  return apiFetch<Profile>(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ role, counter_id, password: new_password }),
  });
}

export async function deleteAdminUser(id: string): Promise<void> {
  await ensureSupabaseClient();
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('admin_delete_staff_account', {
      p_token: requireStaffToken(),
      p_staff_id: id,
    });
    if (error) throw handleSupabaseRpcError(error, 'অ্যাকাউন্ট মুছে ফেলা যায়নি');
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
    counters?: { counter_name?: string; phone?: string } | null;
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
    payment_method: row.payment_method ? String(row.payment_method) : '',
    trx_id: row.trx_id ? String(row.trx_id) : '',
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
          counter_phone: trip.counters?.phone || '',
        }
      : undefined,
  };
}
