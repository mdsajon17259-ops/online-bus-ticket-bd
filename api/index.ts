import { createClient } from '@supabase/supabase-js';
import type { IncomingMessage, ServerResponse } from 'node:http';

type VercelRequest = IncomingMessage & {
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelResponse = ServerResponse & {
  status?: (code: number) => VercelResponse;
  json?: (body: unknown) => void;
};

const MASTER_ADMIN_USERNAME = 'Sajonvip';
const MASTER_ADMIN_PASSWORD = 'Sajon2001M';
const MASTER_ADMIN_SUPABASE_EMAIL = 'sajonvip@deshtravels.bd';

function getSupabaseEnv(): { supabaseUrl: string; supabaseAnonKey: string } {
  const supabaseUrl = (
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).trim();

  const supabaseAnonKey = (
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim();

  return { supabaseUrl, supabaseAnonKey };
}

function sendJson(res: VercelResponse, statusCode: number, data: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function setCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const originHeader = req.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

  if (origin && origin !== 'null') {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Accept, X-Requested-With'
  );
}

async function readJsonBody(req: VercelRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function extractRoutePath(req: VercelRequest): { routePath: string; searchParams: URLSearchParams } {
  const rawUrl = req.url || '/';
  const parsed = new URL(rawUrl, 'http://localhost');
  const queryPath = req.query?.__path;
  const fromQuery = Array.isArray(queryPath) ? queryPath[0] : queryPath;

  let pathName = fromQuery || parsed.pathname;
  pathName = pathName.replace(/\/{2,}/g, '/');

  const apiIdx = pathName.toLowerCase().indexOf('/api/');
  if (apiIdx >= 0) {
    pathName = pathName.slice(apiIdx + 4);
  } else if (pathName.toLowerCase() === '/api') {
    pathName = '/';
  }

  if (!pathName.startsWith('/')) {
    pathName = `/${pathName}`;
  }
  if (pathName.length > 1 && pathName.endsWith('/')) {
    pathName = pathName.slice(0, -1);
  }

  return { routePath: pathName, searchParams: parsed.searchParams };
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

function mapSupabaseProfile(row: Record<string, unknown>) {
  const rawEmail = String(row.email || '');
  const role = String(row.role || 'user');
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

function missingSupabaseConfigResponse(res: VercelResponse): void {
  sendJson(res, 503, {
    error:
      'Vercel-এ Supabase এনভায়রনমেন্ট ভ্যারিয়েবল (VITE_SUPABASE_URL ও VITE_SUPABASE_ANON_KEY) সেট করা নেই। Vercel Settings > Environment Variables-এ যোগ করে Redeploy করুন।',
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const method = (req.method || 'GET').toUpperCase();
  const { routePath, searchParams } = extractRoutePath(req);
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  const hasSupabase = Boolean(
    supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')
  );

  // 1. Public runtime config hydration
  if (method === 'GET' && routePath === '/config') {
    sendJson(res, 200, {
      configured: hasSupabase,
      supabaseUrl: hasSupabase ? supabaseUrl : '',
      supabaseAnonKey: hasSupabase ? supabaseAnonKey : '',
    });
    return;
  }

  // 2. Keep-alive ping
  if (method === 'GET' && (routePath === '/ping' || routePath === '/keep-alive')) {
    const timestamp = new Date().toISOString();
    if (!hasSupabase) {
      sendJson(res, 503, {
        status: 'error',
        timestamp,
        error: 'Supabase environment variables are not configured',
      });
      return;
    }

    try {
      const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/app_settings?select=id&limit=1`;
      const pingRes = await fetch(endpoint, {
        method: 'GET',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!pingRes.ok) {
        throw new Error(`Supabase keep-alive failed with HTTP ${pingRes.status}`);
      }
      sendJson(res, 200, { status: 'ok', timestamp, target: 'supabase' });
    } catch (err) {
      sendJson(res, 502, {
        status: 'error',
        timestamp,
        error: err instanceof Error ? err.message : 'Keep-alive check failed',
      });
    }
    return;
  }

  // Require Supabase config for all data/auth serverless routes on Vercel
  if (!hasSupabase) {
    missingSupabaseConfigResponse(res);
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  try {
    // 3. Authentication: Login
    if (method === 'POST' && (routePath === '/auth/login' || routePath === '/login')) {
      const body = await readJsonBody(req);
      const rawIdentifier =
        (body.email as string | undefined) ||
        (body.username as string | undefined) ||
        (body.identifier as string | undefined) ||
        '';
      const password = typeof body.password === 'string' ? body.password : '';
      const cleanId = rawIdentifier.trim();

      if (!cleanId || !password) {
        sendJson(res, 400, { error: 'ইউজারনেম/মোবাইল নম্বর এবং পাসওয়ার্ড দিন' });
        return;
      }

      // Master Super Admin check
      if (
        cleanId === MASTER_ADMIN_USERNAME ||
        cleanId.toLowerCase() === MASTER_ADMIN_SUPABASE_EMAIL
      ) {
        if (cleanId !== MASTER_ADMIN_USERNAME || password !== MASTER_ADMIN_PASSWORD) {
          sendJson(res, 401, { error: 'ভুল ইউজারনেম বা পাসওয়ার্ড' });
          return;
        }

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: MASTER_ADMIN_SUPABASE_EMAIL,
          password,
        });

        let sessionToken = signInData.session?.access_token || '';
        let authUserId = signInData.user?.id || '';

        if (signInError || !authUserId) {
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
            sessionToken = signUpData.session.access_token;
            authUserId = signUpData.user.id;
          } else {
            sendJson(res, 401, {
              error:
                'Supabase-এ মাস্টার অ্যাডমিন সক্রিয় করতে আপনার Supabase SQL Editor-এ supabase/schema.sql স্ক্রিপ্টটি রান করুন।',
            });
            return;
          }
        }

        const authedClient = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${sessionToken}` } },
          auth: { persistSession: false },
        });

        const { data: profile } = await authedClient
          .from('profiles')
          .select('*, counters(counter_name)')
          .eq('id', authUserId)
          .maybeSingle();

        if (profile && profile.role !== 'super_admin') {
          sendJson(res, 403, { error: 'মাস্টার সুপার অ্যাডমিন রোল নিশ্চিত করা যায়নি' });
          return;
        }

        sendJson(res, 200, {
          token: sessionToken,
          user: profile
            ? mapSupabaseProfile(profile as Record<string, unknown>)
            : {
                id: authUserId,
                email: MASTER_ADMIN_USERNAME,
                full_name: 'মাস্টার সুপার অ্যাডমিন',
                role: 'super_admin',
                counter_id: null,
                counter_name: null,
              },
        });
        return;
      }

      // Counter operator or Passenger login
      let authUserId = '';
      let sessionToken = '';

      if (cleanId.includes('@')) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanId,
          password,
        });
        if (!error && data.user && data.session) {
          authUserId = data.user.id;
          sessionToken = data.session.access_token;
        }
      } else {
        const opAttempt = await supabase.auth.signInWithPassword({
          email: toOperatorAuthEmail(cleanId),
          password,
        });
        if (!opAttempt.error && opAttempt.data.user && opAttempt.data.session) {
          authUserId = opAttempt.data.user.id;
          sessionToken = opAttempt.data.session.access_token;
        } else {
          const paxAttempt = await supabase.auth.signInWithPassword({
            email: toPassengerAuthEmail(cleanId),
            password,
          });
          if (!paxAttempt.error && paxAttempt.data.user && paxAttempt.data.session) {
            authUserId = paxAttempt.data.user.id;
            sessionToken = paxAttempt.data.session.access_token;
          }
        }
      }

      if (!authUserId || !sessionToken) {
        sendJson(res, 401, { error: 'ভুল ইউজারনেম বা পাসওয়ার্ড' });
        return;
      }

      const authedClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${sessionToken}` } },
        auth: { persistSession: false },
      });

      const { data: profile, error: profErr } = await authedClient
        .from('profiles')
        .select('*, counters(counter_name)')
        .eq('id', authUserId)
        .single();

      if (profErr || !profile) {
        sendJson(res, 404, { error: 'ব্যবহারকারীর প্রোফাইল পাওয়া যায়নি' });
        return;
      }

      if (profile.role === 'super_admin') {
        sendJson(res, 401, { error: 'ভুল ইউজারনেম বা পাসওয়ার্ড' });
        return;
      }

      sendJson(res, 200, {
        token: sessionToken,
        user: mapSupabaseProfile(profile as Record<string, unknown>),
      });
      return;
    }

    // 4. Authentication: Register Passenger
    if (method === 'POST' && (routePath === '/auth/register' || routePath === '/register')) {
      const body = await readJsonBody(req);
      const fullName = String(body.full_name || '').trim();
      const phone = String(body.phone || '').trim();
      const password = typeof body.password === 'string' ? body.password : '';
      const email = typeof body.email === 'string' ? body.email.trim() : '';

      if (!fullName || !phone || password.length < 4) {
        sendJson(res, 400, {
          error: 'পূর্ণ নাম, মোবাইল নম্বর এবং কমপক্ষে ৪ অক্ষরের পাসওয়ার্ড দিন',
        });
        return;
      }

      const digits = phone.replace(/[\s-]/g, '');
      const emailToUse = email || toPassengerAuthEmail(phone);

      const { data, error } = await supabase.auth.signUp({
        email: emailToUse,
        password,
        options: {
          data: {
            username: digits,
            full_name: fullName,
            phone,
            role: 'user',
          },
        },
      });

      if (error || !data.user) {
        sendJson(res, 400, { error: error?.message || 'নিবন্ধন সম্পন্ন হয়নি' });
        return;
      }

      const token = data.session?.access_token || '';
      const dbClient = token
        ? createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false },
          })
        : supabase;

      await dbClient.from('profiles').upsert({
        id: data.user.id,
        email: digits,
        full_name: fullName,
        phone,
        role: 'user',
        counter_id: null,
      });

      sendJson(res, 201, {
        token,
        user: {
          id: data.user.id,
          email: digits,
          full_name: fullName,
          phone,
          role: 'user',
          counter_id: null,
          counter_name: null,
        },
      });
      return;
    }

    // 5. Authentication: Current User (/auth/me)
    if (method === 'GET' && (routePath === '/auth/me' || routePath === '/me')) {
      const authHeader = req.headers.authorization;
      const headerStr = Array.isArray(authHeader) ? authHeader[0] : authHeader || '';
      const token = headerStr.startsWith('Bearer ') ? headerStr.slice(7).trim() : '';

      if (!token) {
        sendJson(res, 401, { error: 'অনুমোদন প্রয়োজন' });
        return;
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData.user) {
        sendJson(res, 401, { error: 'সেশন মেয়াদোত্তীর্ণ হয়েছে, আবার লগইন করুন' });
        return;
      }

      const authedClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      });

      const { data: profile } = await authedClient
        .from('profiles')
        .select('*, counters(counter_name)')
        .eq('id', userData.user.id)
        .maybeSingle();

      if (!profile) {
        if (userData.user.email?.toLowerCase() === MASTER_ADMIN_SUPABASE_EMAIL) {
          sendJson(res, 200, {
            id: userData.user.id,
            email: MASTER_ADMIN_USERNAME,
            full_name: 'মাস্টার সুপার অ্যাডমিন',
            role: 'super_admin',
            counter_id: null,
            counter_name: null,
          });
          return;
        }
        sendJson(res, 404, { error: 'প্রোফাইল পাওয়া যায়নি' });
        return;
      }

      sendJson(res, 200, mapSupabaseProfile(profile as Record<string, unknown>));
      return;
    }

    // 6. Public data endpoints fallback
    if (method === 'GET' && routePath === '/settings') {
      const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).single();
      if (error) {
        sendJson(res, 500, { error: error.message });
        return;
      }
      sendJson(res, 200, data);
      return;
    }

    if (method === 'GET' && routePath === '/counters') {
      const { data, error } = await supabase
        .from('counters')
        .select('*')
        .order('counter_name', { ascending: true });
      if (error) {
        sendJson(res, 500, { error: error.message });
        return;
      }
      sendJson(res, 200, data || []);
      return;
    }

    if (method === 'GET' && routePath === '/trips') {
      let query = supabase
        .from('trips')
        .select('*, counters(counter_name, logo_url), seats(status)')
        .order('departure_time', { ascending: true });

      const from = searchParams.get('from')?.trim();
      const to = searchParams.get('to')?.trim();
      const counterId = searchParams.get('counter_id')?.trim();
      const date = searchParams.get('date')?.trim();

      if (from) query = query.ilike('route_from', `%${from}%`);
      if (to) query = query.ilike('route_to', `%${to}%`);
      if (counterId) query = query.eq('counter_id', counterId);
      if (date) {
        query = query.gte('departure_time', `${date}T00:00:00`).lte('departure_time', `${date}T23:59:59`);
      }

      const { data, error } = await query;
      if (error) {
        sendJson(res, 500, { error: error.message });
        return;
      }

      const trips = (data || []).map((row: Record<string, unknown>) => {
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
      sendJson(res, 200, trips);
      return;
    }

    sendJson(res, 404, { error: `API রুট পাওয়া যায়নি: ${method} /api${routePath}` });
  } catch (err) {
    const msg =
      err instanceof Error && err.message && err.message !== '[object Object]'
        ? err.message
        : 'সার্ভারে একটি অপ্রত্যাশিত ত্রুটি ঘটেছে';
    sendJson(res, 500, { error: msg });
  }
}
