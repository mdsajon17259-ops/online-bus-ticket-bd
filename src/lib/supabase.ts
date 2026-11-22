import { createClient, type SupabaseClient } from '@supabase/supabase-js';

declare const __APP_SUPABASE_URL__: string | undefined;
declare const __APP_SUPABASE_ANON_KEY__: string | undefined;

const memoryStorage = new Map<string, string>();

const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return window.localStorage.getItem(key) ?? memoryStorage.get(key) ?? null;
    } catch {
      return memoryStorage.get(key) ?? null;
    }
  },
  setItem: (key: string, value: string): void => {
    memoryStorage.set(key, value);
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage restrictions in WebView
    }
  },
  removeItem: (key: string): void => {
    memoryStorage.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage restrictions in WebView
    }
  },
};

function readInitialSupabaseConfig(): { url: string; anonKey: string } {
  const envUrl =
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.VITE_SUPABASE_URL as string | undefined)) ||
    (typeof __APP_SUPABASE_URL__ !== 'undefined' ? __APP_SUPABASE_URL__ : '') ||
    '';

  const envKey =
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined)) ||
    (typeof __APP_SUPABASE_ANON_KEY__ !== 'undefined' ? __APP_SUPABASE_ANON_KEY__ : '') ||
    '';

  let url = (envUrl || '').trim();
  let anonKey = (envKey || '').trim();

  if (typeof window !== 'undefined') {
    const win = window as unknown as {
      __SUPABASE_URL__?: string;
      __SUPABASE_ANON_KEY__?: string;
    };
    if (!url && win.__SUPABASE_URL__) url = win.__SUPABASE_URL__.trim();
    if (!anonKey && win.__SUPABASE_ANON_KEY__) anonKey = win.__SUPABASE_ANON_KEY__.trim();

    if (!url) {
      url =
        document.querySelector('meta[name="supabase-url"]')?.getAttribute('content')?.trim() || '';
    }
    if (!anonKey) {
      anonKey =
        document
          .querySelector('meta[name="supabase-anon-key"]')
          ?.getAttribute('content')
          ?.trim() || '';
    }
  }

  return { url, anonKey };
}

function buildSupabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: typeof window !== 'undefined' ? safeStorage : undefined,
    },
  });
}

const initial = readInitialSupabaseConfig();
let activeUrl = initial.url;
let activeAnonKey = initial.anonKey;

export let isSupabaseConfigured = Boolean(
  activeUrl && activeAnonKey && activeUrl.startsWith('http')
);

export let supabase: SupabaseClient | null = isSupabaseConfigured
  ? buildSupabaseClient(activeUrl, activeAnonKey)
  : null;

let configHydrationPromise: Promise<SupabaseClient | null> | null = null;

function getConfigEndpointCandidates(): string[] {
  if (typeof window === 'undefined') return [];
  const candidates: string[] = [];
  const add = (u: string) => {
    if (u && !candidates.includes(u)) candidates.push(u);
  };

  const { protocol, origin, href } = window.location;
  if (protocol === 'http:' || protocol === 'https:') {
    try {
      add(new URL('api/config', new URL('.', document.baseURI || href)).toString());
    } catch {
      // Ignore invalid URL
    }
    add(`${origin}/api/config`);
  } else if (document.referrer.startsWith('http')) {
    try {
      add(`${new URL(document.referrer).origin}/api/config`);
    } catch {
      // Ignore invalid referrer
    }
  }
  return candidates;
}

/**
 * Ensures Supabase client is initialized. If Vite env vars were not baked in at
 * build time (e.g., runtime env vars on Vercel or Express), checks /api/config once.
 */
export async function ensureSupabaseClient(): Promise<SupabaseClient | null> {
  if (supabase) return supabase;
  if (typeof window === 'undefined') return null;

  if (!configHydrationPromise) {
    configHydrationPromise = (async () => {
      const urls = getConfigEndpointCandidates();
      for (const configUrl of urls) {
        try {
          const res = await fetch(configUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
          });
          if (!res.ok) continue;
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (!ct.includes('application/json')) continue;

          const data = (await res.json().catch(() => null)) as {
            configured?: boolean;
            supabaseUrl?: string;
            supabaseAnonKey?: string;
          } | null;

          if (
            data?.configured &&
            data.supabaseUrl &&
            data.supabaseAnonKey &&
            data.supabaseUrl.startsWith('http')
          ) {
            activeUrl = data.supabaseUrl.trim();
            activeAnonKey = data.supabaseAnonKey.trim();
            isSupabaseConfigured = true;
            supabase = buildSupabaseClient(activeUrl, activeAnonKey);
            return supabase;
          }
          break;
        } catch {
          // Try next candidate
        }
      }
      return null;
    })();
  }

  return configHydrationPromise;
}

/**
 * Non-persistent client used when the Super Admin creates counter operator or
 * user accounts via Supabase Auth signUp so the active Super Admin session is preserved.
 */
export function createEphemeralSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured || !activeUrl || !activeAnonKey) return null;
  return createClient(activeUrl, activeAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
