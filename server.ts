import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'desh-travels-session-secret-key';
const MASTER_ADMIN_USERNAME = 'Sajonvip';
const MASTER_ADMIN_PASSWORD = 'Sajon2001M';

interface AuthUser {
  id: string;
  email: string;
  role: 'user' | 'counter_admin' | 'counter_representative' | 'super_admin';
  counter_id: string | null;
  token_version: number;
}

interface AuthedRequest extends Request {
  user?: AuthUser;
}

// Ensure data directory exists
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'bus_booking.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize SQLite schema mirroring Supabase PostgreSQL tables
db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    organization_name TEXT NOT NULL DEFAULT 'Aurora Transit Network',
    organization_logo_url TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS counters (
    id TEXT PRIMARY KEY,
    counter_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    logo_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'counter_admin', 'counter_representative', 'super_admin')),
    counter_id TEXT REFERENCES counters(id) ON DELETE SET NULL,
    token_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    counter_id TEXT NOT NULL REFERENCES counters(id) ON DELETE CASCADE,
    route_from TEXT NOT NULL,
    route_to TEXT NOT NULL,
    departure_time TEXT NOT NULL,
    bus_type TEXT NOT NULL DEFAULT 'এসি এক্সপ্রেস কোচ',
    price REAL NOT NULL,
    total_seats INTEGER NOT NULL DEFAULT 36,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS seats (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    seat_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'booked')),
    UNIQUE (trip_id, seat_number)
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id TEXT DEFAULT NULL,
    passenger_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    boarding_point TEXT NOT NULL DEFAULT '',
    selected_seats TEXT NOT NULL,
    total_fare REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT '',
    trx_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_reset_logs (
    id TEXT PRIMARY KEY,
    counter_id TEXT REFERENCES counters(id) ON DELETE SET NULL,
    counter_name TEXT NOT NULL,
    target_role TEXT NOT NULL CHECK (target_role IN ('counter_admin', 'counter_representative')),
    target_username TEXT NOT NULL,
    reset_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Safely migrate existing SQLite profiles table to add token_version and counter_representative CHECK constraint
const profileCols = db.prepare('PRAGMA table_info(profiles)').all() as Array<{ name: string }>;
if (!profileCols.some((c) => c.name === 'phone')) {
  db.exec("ALTER TABLE profiles ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
}
if (!profileCols.some((c) => c.name === 'token_version')) {
  db.exec('ALTER TABLE profiles ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1');
}

const profilesSchemaRow = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'profiles'")
  .get() as { sql?: string } | undefined;
if (profilesSchemaRow?.sql && !profilesSchemaRow.sql.includes('counter_representative')) {
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec(`
      CREATE TABLE profiles_migrated (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'counter_admin', 'counter_representative', 'super_admin')),
        counter_id TEXT REFERENCES counters(id) ON DELETE SET NULL,
        token_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      INSERT INTO profiles_migrated (id, email, full_name, phone, password_hash, role, counter_id, token_version, created_at)
      SELECT id, email, COALESCE(full_name, ''), COALESCE(phone, ''), password_hash, role, counter_id, COALESCE(token_version, 1), created_at FROM profiles;
      DROP TABLE profiles;
      ALTER TABLE profiles_migrated RENAME TO profiles;
    `);
  })();
  db.pragma('foreign_keys = ON');
}

const bookingCols = db.prepare('PRAGMA table_info(bookings)').all() as Array<{ name: string }>;
if (!bookingCols.some((c) => c.name === 'user_id')) {
  db.exec('ALTER TABLE bookings ADD COLUMN user_id TEXT DEFAULT NULL');
}
if (!bookingCols.some((c) => c.name === 'payment_method')) {
  db.exec("ALTER TABLE bookings ADD COLUMN payment_method TEXT NOT NULL DEFAULT ''");
}
if (!bookingCols.some((c) => c.name === 'trx_id')) {
  db.exec("ALTER TABLE bookings ADD COLUMN trx_id TEXT NOT NULL DEFAULT ''");
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, originalHash] = stored.split(':');
  if (!salt || !originalHash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(originalHash, 'hex'));
}

function signToken(user: AuthUser): string {
  const payload = Buffer.from(
    JSON.stringify({
      ...user,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string): AuthUser | null {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AuthUser & { exp: number };
    if (Date.now() > data.exp) return null;
    return {
      id: data.id,
      email: data.email,
      role: data.role,
      counter_id: data.counter_id,
      token_version: typeof data.token_version === 'number' ? data.token_version : 1,
    };
  } catch {
    return null;
  }
}

function generateSeatsForTrip(tripId: string, totalSeats: number) {
  const cols = ['A', 'B', 'C', 'D'];
  const rows = Math.ceil(totalSeats / 4);
  const insertSeat = db.prepare(
    'INSERT INTO seats (id, trip_id, seat_number, status) VALUES (?, ?, ?, ?)'
  );
  let count = 0;
  for (let r = 1; r <= rows; r++) {
    for (let c = 0; c < 4; c++) {
      count++;
      if (count <= totalSeats) {
        insertSeat.run(crypto.randomUUID(), tripId, `${cols[c]}${r}`, 'available');
      }
    }
  }
}

function seedDatabaseIfEmpty() {
  const existing = db.prepare('SELECT id FROM app_settings WHERE id = 1').get();
  const hasOldUsSeed = db.prepare("SELECT id FROM counters WHERE id = 'c-aurora-central'").get();
  const hasOldAdmin = db.prepare("SELECT id FROM profiles WHERE email = 'admin@bengaltransit.bd'").get();

  // Upgrade old admin@bengaltransit.bd seed to Master Super Admin (Sajonvip) + Desh Travels branding
  if (existing && !hasOldUsSeed && hasOldAdmin) {
    db.transaction(() => {
      db.prepare("DELETE FROM profiles WHERE role = 'super_admin'").run();
      db.prepare(
        'INSERT OR REPLACE INTO profiles (id, email, full_name, phone, password_hash, role, counter_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        'u-master-super-admin',
        MASTER_ADMIN_USERNAME,
        'মাস্টার সুপার অ্যাডমিন',
        '',
        hashPassword(MASTER_ADMIN_PASSWORD),
        'super_admin',
        null,
        new Date().toISOString()
      );
      db.prepare(
        "UPDATE app_settings SET organization_name = 'দেশ ভ্রমণ / Desh Travels' WHERE id = 1 AND organization_name = 'বেঙ্গল ট্রানজিট নেটওয়ার্ক'"
      ).run();
      // Update operator identifiers to clean usernames
      db.prepare("UPDATE profiles SET email = 'greenline' WHERE id = 'u-op-greenline'").run();
      db.prepare("UPDATE profiles SET email = 'hanif' WHERE id = 'u-op-hanif'").run();
      db.prepare("UPDATE profiles SET email = 'shyamoli' WHERE id = 'u-op-shyamoli'").run();
      db.prepare("UPDATE profiles SET email = 'sylhet' WHERE id = 'u-op-sylhet'").run();
    })();
    return;
  }

  if (existing && !hasOldUsSeed) return;

  const now = new Date().toISOString();
  const seed = db.transaction(() => {
    if (hasOldUsSeed) {
      db.prepare('DELETE FROM bookings').run();
      db.prepare('DELETE FROM seats').run();
      db.prepare('DELETE FROM trips').run();
      db.prepare('DELETE FROM profiles').run();
      db.prepare('DELETE FROM counters').run();
      db.prepare('DELETE FROM app_settings').run();
    }

    db.prepare(
      'INSERT INTO app_settings (id, organization_name, organization_logo_url, updated_at) VALUES (1, ?, ?, ?)'
    ).run('দেশ ভ্রমণ / Desh Travels', '/src/assets/images/desh_travels_logo_1795618756599.jpg', now);

    const c1 = 'c-green-line';
    const c2 = 'c-hanif-enterprise';
    const c3 = 'c-shyamoli-paribahan';
    const c4 = 'c-sylhet-central';

    const insertCounter = db.prepare(
      'INSERT INTO counters (id, counter_name, phone, address, logo_url, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insertCounter.run(
      c1,
      'গ্রিন লাইন পরিবহন',
      '01711-004422',
      '৯/২ আউটার সার্কুলার রোড, রাজারবাগ, ঢাকা-১২১৭',
      '/src/assets/images/counter_emblem_one_1794840145454.jpg',
      now
    );
    insertCounter.run(
      c2,
      'হানিফ এন্টারপ্রাইজ',
      '01713-402671',
      'কল্যাণপুর ও সায়েদাবাদ বাস টার্মিনাল, ঢাকা',
      '/src/assets/images/default_org_logo_1794840144839.jpg',
      now
    );
    insertCounter.run(
      c3,
      'শ্যামলী পরিবহন',
      '01819-225588',
      'গাবতলী কেন্দ্রীয় বাস টার্মিনাল, মিরপুর রোড, ঢাকা',
      '/src/assets/images/counter_emblem_one_1794840145454.jpg',
      now
    );
    insertCounter.run(
      c4,
      'সিলেট কেন্দ্রীয় টার্মিনাল',
      '01712-889911',
      'কদমতলী কেন্দ্রীয় বাস টার্মিনাল, দক্ষিণ সুরমা, সিলেট',
      '/src/assets/images/default_org_logo_1794840144839.jpg',
      now
    );

    const insertProfile = db.prepare(
      'INSERT INTO profiles (id, email, full_name, phone, password_hash, role, counter_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    insertProfile.run(
      'u-master-super-admin',
      MASTER_ADMIN_USERNAME,
      'মাস্টার সুপার অ্যাডমিন',
      '',
      hashPassword(MASTER_ADMIN_PASSWORD),
      'super_admin',
      null,
      now
    );
    insertProfile.run(
      'u-op-greenline',
      'greenline',
      'কামরুল হাসান',
      '01711-004422',
      hashPassword('Operator123!'),
      'counter_admin',
      c1,
      now
    );
    insertProfile.run(
      'u-op-hanif',
      'hanif',
      'রফিকুল ইসলাম',
      '01713-402671',
      hashPassword('Operator123!'),
      'counter_admin',
      c2,
      now
    );
    insertProfile.run(
      'u-op-shyamoli',
      'shyamoli',
      'সাজ্জাদ হোসেন',
      '01819-225588',
      hashPassword('Operator123!'),
      'counter_admin',
      c3,
      now
    );
    insertProfile.run(
      'u-op-sylhet',
      'sylhet',
      'মাহবুব আলম',
      '01712-889911',
      hashPassword('Operator123!'),
      'counter_admin',
      c4,
      now
    );
    insertProfile.run(
      'u-passenger',
      '01711223344',
      'রাশেদুল করিম',
      '01711223344',
      hashPassword('1234'),
      'user',
      null,
      now
    );

    const formatDateOffset = (daysAhead: number, timeStr: string) => {
      const d = new Date();
      d.setDate(d.getDate() + daysAhead);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}T${timeStr}:00`;
    };

    const insertTrip = db.prepare(
      'INSERT INTO trips (id, counter_id, route_from, route_to, departure_time, bus_type, price, total_seats, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    const seededTrips = [
      { id: 't-dhk-ctg-1', counter: c1, from: 'ঢাকা', to: 'চট্টগ্রাম', dt: formatDateOffset(0, '08:00'), type: 'স্ক্যানিয়া এসি বিজনেস ক্লাস', price: 1400, seats: 36 },
      { id: 't-dhk-ctg-2', counter: c2, from: 'ঢাকা', to: 'চট্টগ্রাম', dt: formatDateOffset(0, '10:30'), type: 'হিনো নন-এসি চেয়ার কোচ', price: 680, seats: 36 },
      { id: 't-dhk-cxb-1', counter: c1, from: 'ঢাকা', to: 'কক্সবাজার', dt: formatDateOffset(0, '22:00'), type: 'ডাবল-ডেকার এসি স্লিপার', price: 2200, seats: 32 },
      { id: 't-dhk-syl-1', counter: c4, from: 'ঢাকা', to: 'সিলেট', dt: formatDateOffset(0, '09:15'), type: 'হুন্দাই এসি এক্সপ্রেস', price: 1200, seats: 36 },
      { id: 't-dhk-raj-1', counter: c3, from: 'ঢাকা', to: 'রাজশাহী', dt: formatDateOffset(0, '14:30'), type: 'শ্যামলী এসি চেয়ার কোচ', price: 1100, seats: 36 },
      { id: 't-dhk-khl-1', counter: c2, from: 'ঢাকা', to: 'খুলনা', dt: formatDateOffset(1, '08:30'), type: 'পদ্মা এক্সপ্রেস নন-এসি', price: 750, seats: 36 },
      { id: 't-syl-dhk-1', counter: c4, from: 'সিলেট', to: 'ঢাকা', dt: formatDateOffset(1, '15:00'), type: 'এসি বিজনেস কোচ', price: 1250, seats: 36 },
      { id: 't-dhk-cxb-2', counter: c3, from: 'ঢাকা', to: 'কক্সবাজার', dt: formatDateOffset(2, '21:30'), type: 'রাতের লাক্সারি এসি কোচ', price: 1850, seats: 32 },
    ];

    for (const t of seededTrips) {
      insertTrip.run(t.id, t.counter, t.from, t.to, t.dt, t.type, t.price, t.seats, now);
      generateSeatsForTrip(t.id, t.seats);
    }

    // Reserve realistic seats and seed sample Bangladeshi bookings
    const markBooked = db.prepare('UPDATE seats SET status = ? WHERE trip_id = ? AND seat_number = ?');
    const insertBooking = db.prepare(
      'INSERT INTO bookings (id, trip_id, passenger_name, phone, boarding_point, selected_seats, total_fare, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    const b1Seats = ['A1', 'B1'];
    for (const s of b1Seats) markBooked.run('booked', 't-dhk-ctg-1', s);
    insertBooking.run('BK-10421', 't-dhk-ctg-1', 'রাশেদুল করিম', '01711223344', 'রাজারবাগ কাউন্টার, ঢাকা', JSON.stringify(b1Seats), 2800, 'confirmed', now);

    const b2Seats = ['C3', 'D3'];
    for (const s of b2Seats) markBooked.run('booked', 't-dhk-ctg-1', s);
    insertBooking.run('BK-10422', 't-dhk-ctg-1', 'ফারহানা আক্তার', '01819334455', 'সায়েদাবাদ কাউন্টার, ঢাকা', JSON.stringify(b2Seats), 2800, 'pending', now);

    const b3Seats = ['A2', 'B2', 'C2'];
    for (const s of b3Seats) markBooked.run('booked', 't-dhk-ctg-2', s);
    insertBooking.run('BK-10423', 't-dhk-ctg-2', 'মাহমুদুল হাসান', '01911556677', 'কল্যাণপুর কাউন্টার, ঢাকা', JSON.stringify(b3Seats), 2040, 'pending', now);

    const b4Seats = ['D1'];
    for (const s of b4Seats) markBooked.run('booked', 't-dhk-syl-1', s);
    insertBooking.run('BK-10424', 't-dhk-syl-1', 'সাদিয়া আফরিন', '01715667788', 'মহাখালী বাস টার্মিনাল', JSON.stringify(b4Seats), 1200, 'confirmed', now);
  });

  seed();
}

seedDatabaseIfEmpty();

// Ensure seeded counters also have sample representative accounts if missing
function ensureSeededRepresentatives() {
  const reps = [
    { id: 'u-rep-greenline', username: 'greenline_rep', fullName: 'গ্রিন লাইন প্রতিনিধি', phone: '01711-004422', counterId: 'c-green-line' },
    { id: 'u-rep-hanif', username: 'hanif_rep', fullName: 'হানিফ প্রতিনিধি', phone: '01713-402671', counterId: 'c-hanif-enterprise' },
    { id: 'u-rep-shyamoli', username: 'shyamoli_rep', fullName: 'শ্যামলী প্রতিনিধি', phone: '01819-225588', counterId: 'c-shyamoli-paribahan' },
    { id: 'u-rep-sylhet', username: 'sylhet_rep', fullName: 'সিলেট প্রতিনিধি', phone: '01712-889911', counterId: 'c-sylhet-central' },
  ];
  const now = new Date().toISOString();
  for (const r of reps) {
    const counterExists = db.prepare('SELECT id FROM counters WHERE id = ?').get(r.counterId);
    if (!counterExists) continue;
    const hasRep = db
      .prepare("SELECT id FROM profiles WHERE counter_id = ? AND role = 'counter_representative'")
      .get(r.counterId);
    const usernameTaken = db
      .prepare('SELECT id FROM profiles WHERE LOWER(email) = LOWER(?)')
      .get(r.username);
    if (!hasRep && !usernameTaken) {
      db.prepare(
        'INSERT INTO profiles (id, email, full_name, phone, password_hash, role, counter_id, token_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)'
      ).run(r.id, r.username, r.fullName, r.phone, hashPassword('Rep123456'), 'counter_representative', r.counterId, now);
    }
  }
}
ensureSeededRepresentatives();

// Upgrade legacy default logo URL to the custom Desh Travels brand logo if unchanged
db.prepare(
  "UPDATE app_settings SET organization_logo_url = '/src/assets/images/desh_travels_logo_1795618756599.jpg' WHERE id = 1 AND (organization_logo_url = '' OR organization_logo_url = '/src/assets/images/default_org_logo_1794840144839.jpg')"
).run();

// Express Auth Middleware (verifies token signature + DB token_version to invalidate reset sessions)
function attachUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const user = verifyToken(token);
    if (user) {
      const row = db
        .prepare('SELECT id, email, role, counter_id, token_version FROM profiles WHERE id = ?')
        .get(user.id) as AuthUser | undefined;
      if (row && Number(row.token_version) === Number(user.token_version)) {
        req.user = row;
      }
    }
  }
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

function requireSuperAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'লগইন করা প্রয়োজন' });
    return;
  }
  if (req.user.role !== 'super_admin' || req.user.email !== MASTER_ADMIN_USERNAME) {
    res.status(403).json({ error: 'অনুমোদিত নয়: শুধুমাত্র মাস্টার সুপার অ্যাডমিন প্রবেশ করতে পারবেন' });
    return;
  }
  next();
}

function requireOperatorOrAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user.role !== 'counter_admin' && req.user.role !== 'super_admin') {
    res.status(403).json({ error: 'Forbidden: Read-only or unauthorized account cannot modify counter data' });
    return;
  }
  if (req.user.role === 'counter_admin' && !req.user.counter_id) {
    res.status(403).json({ error: 'Operator account is not assigned to any counter' });
    return;
  }
  next();
}

function requireCounterViewAccess(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (
    req.user.role !== 'counter_admin' &&
    req.user.role !== 'counter_representative' &&
    req.user.role !== 'super_admin'
  ) {
    res.status(403).json({ error: 'Forbidden: Counter access required' });
    return;
  }
  if (
    (req.user.role === 'counter_admin' || req.user.role === 'counter_representative') &&
    !req.user.counter_id
  ) {
    res.status(403).json({ error: 'Account is not assigned to any counter' });
    return;
  }
  next();
}

async function startServer() {
  const app = express();

  // Normalize API URLs across WebViews, proxies, duplicate slashes, and subpath prefixes
  app.use((req, _res, next) => {
    const qIndex = req.url.indexOf('?');
    const rawPath = qIndex >= 0 ? req.url.slice(0, qIndex) : req.url;
    const rawQuery = qIndex >= 0 ? req.url.slice(qIndex) : '';

    let normalizedPath = rawPath.replace(/\/{2,}/g, '/');
    const apiMatch = normalizedPath.match(/^(?:.*?)\/(api(?:\/.*)?)$/i);
    if (apiMatch) {
      normalizedPath = `/${apiMatch[1].replace(/^api/i, 'api')}`;
    }
    if (normalizedPath.startsWith('/api/') && normalizedPath.length > 5 && normalizedPath.endsWith('/')) {
      normalizedPath = normalizedPath.slice(0, -1);
    }

    req.url = `${normalizedPath}${rawQuery}`;
    next();
  });

  // Allow cross-origin & WebView requests (e.g. file://, capacitor://, appassets, custom domains)
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && origin !== 'null') {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '6mb' }));
  app.use(attachUser);

  // ===========================================================================
  // PUBLIC ENDPOINTS
  // ===========================================================================

  const handleKeepAlive = async (_req: express.Request, res: express.Response) => {
    const timestamp = new Date().toISOString();
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
    const supabaseKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

    try {
      if (supabaseUrl.startsWith('http') && supabaseKey) {
        const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/app_settings?select=id&limit=1`;
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
          signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
          throw new Error(`Supabase keep-alive failed with HTTP ${response.status}`);
        }

        res.status(200).json({ status: 'ok', timestamp, target: 'supabase' });
        return;
      }

      db.prepare('SELECT id FROM app_settings WHERE id = 1').get();
      res.status(200).json({ status: 'ok', timestamp, target: 'sqlite' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Keep-alive check failed';
      res.status(502).json({ status: 'error', timestamp, error: message });
    }
  };

  app.get('/api/ping', handleKeepAlive);
  app.get('/api/keep-alive', handleKeepAlive);

  // Short-lived in-memory PNG cache for direct HTTP Content-Disposition attachment downloads
  // (Prevents Android WebView from opening "Share 1 photo" or failing on blob:/data: URIs)
  const ticketExportCache = new Map<
    string,
    { buffer: Buffer; filename: string; expiresAt: number }
  >();
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const pruneTicketExportCache = () => {
    const now = Date.now();
    for (const [key, entry] of ticketExportCache.entries()) {
      if (entry.expiresAt <= now) {
        ticketExportCache.delete(key);
      }
    }
    while (ticketExportCache.size >= 100) {
      const oldestKey = ticketExportCache.keys().next().value;
      if (!oldestKey) break;
      ticketExportCache.delete(oldestKey);
    }
  };

  app.post('/api/tickets/export-png', (req, res) => {
    const { imageDataUrl, filename } = (req.body || {}) as {
      imageDataUrl?: unknown;
      filename?: unknown;
    };

    if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/png;base64,')) {
      res.status(400).json({ error: 'সঠিক PNG ছবির ডেটা পাওয়া যায়নি' });
      return;
    }

    const base64Payload = imageDataUrl.slice('data:image/png;base64,'.length);
    const buffer = Buffer.from(base64Payload, 'base64');

    if (
      buffer.length < 16 ||
      buffer.length > 5 * 1024 * 1024 ||
      !buffer.subarray(0, 8).equals(PNG_MAGIC)
    ) {
      res.status(400).json({ error: 'অবৈধ PNG ফাইল ফরম্যাট' });
      return;
    }

    const rawName = typeof filename === 'string' ? filename.trim() : '';
    const cleanedName = rawName.replace(/[^a-zA-Z0-9._-]/g, '');
    const safeFilename =
      cleanedName && cleanedName.toLowerCase().endsWith('.png')
        ? cleanedName.slice(0, 96)
        : 'desh-travels-ticket.png';

    pruneTicketExportCache();

    const token = crypto.randomUUID();
    ticketExportCache.set(token, {
      buffer,
      filename: safeFilename,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    res.status(201).json({
      token,
      downloadPath: `/api/tickets/export-png/${token}`,
      filename: safeFilename,
    });
  });

  app.get('/api/tickets/export-png/:token', (req, res) => {
    const token = (req.params.token || '').trim();
    if (!/^[a-f0-9-]{36}$/i.test(token)) {
      res.status(400).json({ error: 'অবৈধ ডাউনলোড টোকেন' });
      return;
    }

    const entry = ticketExportCache.get(token);
    if (!entry || Date.now() > entry.expiresAt) {
      ticketExportCache.delete(token);
      res.status(404).json({ error: 'ডাউনলোড লিংকের মেয়াদ শেষ হয়েছে, অনুগ্রহ করে আবার ডাউনলোড চাপুন' });
      return;
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${entry.filename}"; filename*=UTF-8''${encodeURIComponent(entry.filename)}`
    );
    res.setHeader('Content-Length', String(entry.buffer.length));
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(entry.buffer);
  });

  app.get('/api/config', (_req, res) => {
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

    const configured = Boolean(
      supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')
    );

    res.json({
      configured,
      supabaseUrl: configured ? supabaseUrl : '',
      supabaseAnonKey: configured ? supabaseAnonKey : '',
    });
  });

  app.get('/api/settings', (_req, res) => {
    const settings = db.prepare('SELECT * FROM app_settings WHERE id = 1').get();
    res.json(settings);
  });

  app.get('/api/counters', (_req, res) => {
    const counters = db
      .prepare('SELECT * FROM counters ORDER BY created_at ASC, rowid ASC')
      .all();
    res.json(counters);
  });

  app.get('/api/trips', (req, res) => {
    const { from, to, date, counter_id } = req.query;
    let query = `
      SELECT
        t.*,
        c.counter_name,
        c.logo_url AS counter_logo_url,
        (SELECT COUNT(*) FROM seats s WHERE s.trip_id = t.id AND s.status = 'available') AS available_seats
      FROM trips t
      JOIN counters c ON c.id = t.counter_id
      WHERE 1 = 1
    `;
    const params: unknown[] = [];

    if (from && typeof from === 'string' && from.trim()) {
      query += ' AND LOWER(t.route_from) LIKE ?';
      params.push(`%${from.trim().toLowerCase()}%`);
    }
    if (to && typeof to === 'string' && to.trim()) {
      query += ' AND LOWER(t.route_to) LIKE ?';
      params.push(`%${to.trim().toLowerCase()}%`);
    }
    if (date && typeof date === 'string' && date.trim()) {
      query += ' AND substr(t.departure_time, 1, 10) = ?';
      params.push(date.trim());
    }
    if (counter_id && typeof counter_id === 'string' && counter_id.trim()) {
      query += ' AND t.counter_id = ?';
      params.push(counter_id.trim());
    }

    query += ' ORDER BY t.departure_time ASC';
    const trips = db.prepare(query).all(...params);
    res.json(trips);
  });

  app.get('/api/trips/:id/seats', (req, res) => {
    const seats = db
      .prepare('SELECT * FROM seats WHERE trip_id = ? ORDER BY length(seat_number), seat_number')
      .all(req.params.id);
    res.json(seats);
  });

  app.post('/api/bookings', (req: AuthedRequest, res) => {
    const {
      trip_id,
      passenger_name,
      phone,
      boarding_point,
      selected_seats,
      payment_method,
      trx_id,
    } = req.body as {
      trip_id?: string;
      passenger_name?: string;
      phone?: string;
      boarding_point?: string;
      selected_seats?: string[];
      payment_method?: string;
      trx_id?: string;
    };

    if (!trip_id || !passenger_name?.trim() || !phone?.trim() || !Array.isArray(selected_seats) || selected_seats.length === 0) {
      res.status(400).json({ error: 'ট্রিপ, যাত্রীর নাম, মোবাইল নম্বর এবং কমপক্ষে একটি আসন প্রয়োজন' });
      return;
    }

    try {
      const created = db.transaction(() => {
        const trip = db
          .prepare('SELECT t.*, c.counter_name, c.phone AS counter_phone FROM trips t JOIN counters c ON c.id = t.counter_id WHERE t.id = ?')
          .get(trip_id) as { id: string; price: number; route_from: string; route_to: string; departure_time: string; bus_type: string; counter_id: string; counter_name: string; counter_phone?: string } | undefined;

        if (!trip) {
          throw new Error('TRIP_NOT_FOUND');
        }

        const placeholders = selected_seats.map(() => '?').join(',');
        const seatRows = db
          .prepare(`SELECT * FROM seats WHERE trip_id = ? AND seat_number IN (${placeholders})`)
          .all(trip_id, ...selected_seats) as Array<{ id: string; seat_number: string; status: string }>;

        if (seatRows.length !== selected_seats.length) {
          throw new Error('INVALID_SEATS');
        }

        const alreadyBooked = seatRows.filter((s) => s.status !== 'available');
        if (alreadyBooked.length > 0) {
          throw new Error(`SEATS_UNAVAILABLE:${alreadyBooked.map((s) => s.seat_number).join(', ')}`);
        }

        db.prepare(
          `UPDATE seats SET status = 'booked' WHERE trip_id = ? AND seat_number IN (${placeholders})`
        ).run(trip_id, ...selected_seats);

        const bookingId = `BK-${Math.floor(10000 + Math.random() * 89999)}`;
        const totalFare = trip.price * selected_seats.length;
        const now = new Date().toISOString();
        const actorUserId = req.user?.id || null;
        const cleanMethod = (payment_method || '').trim();
        const cleanTrxId = (trx_id || '').trim();

        db.prepare(
          'INSERT INTO bookings (id, trip_id, user_id, passenger_name, phone, boarding_point, selected_seats, total_fare, payment_method, trx_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          bookingId,
          trip_id,
          actorUserId,
          passenger_name.trim(),
          phone.trim(),
          (boarding_point || '').trim(),
          JSON.stringify(selected_seats),
          totalFare,
          cleanMethod,
          cleanTrxId,
          'pending',
          now
        );

        return {
          id: bookingId,
          trip_id,
          user_id: actorUserId,
          passenger_name: passenger_name.trim(),
          phone: phone.trim(),
          boarding_point: (boarding_point || '').trim(),
          selected_seats,
          total_fare: totalFare,
          payment_method: cleanMethod,
          trx_id: cleanTrxId,
          status: 'pending',
          created_at: now,
          trip: {
            route_from: trip.route_from,
            route_to: trip.route_to,
            departure_time: trip.departure_time,
            bus_type: trip.bus_type,
            price: trip.price,
            counter_id: trip.counter_id,
            counter_name: trip.counter_name,
            counter_phone: trip.counter_phone || '',
          },
        };
      })();

      res.status(201).json(created);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Booking failed';
      if (msg === 'TRIP_NOT_FOUND') {
        res.status(404).json({ error: 'Selected trip was not found' });
        return;
      }
      if (msg.startsWith('SEATS_UNAVAILABLE:')) {
        res.status(409).json({ error: `Seats already reserved: ${msg.split(':')[1]}` });
        return;
      }
      res.status(400).json({ error: msg });
    }
  });

  app.get('/api/bookings/lookup', (req, res) => {
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!rawQuery) {
      res.json([]);
      return;
    }
    const cleanId = rawQuery.replace(/^#/, '').trim();
    const idPrefixPattern = cleanId.length >= 4 ? `${cleanId}%` : cleanId;

    const rows = db
      .prepare(`
        SELECT b.*, t.route_from, t.route_to, t.departure_time, t.bus_type, t.price, t.counter_id, c.counter_name, c.phone AS counter_phone
        FROM bookings b
        JOIN trips t ON t.id = b.trip_id
        JOIN counters c ON c.id = t.counter_id
        WHERE LOWER(b.id) = LOWER(?)
          OR LOWER(b.id) LIKE LOWER(?)
          OR replace(replace(b.phone, '-', ''), ' ', '') LIKE ?
        ORDER BY b.created_at DESC
      `)
      .all(cleanId, idPrefixPattern, `%${rawQuery.replace(/[\s#-]/g, '')}%`) as Array<Record<string, unknown>>;

    res.json(
      rows.map((r) => ({
        id: r.id,
        trip_id: r.trip_id,
        passenger_name: r.passenger_name,
        phone: r.phone,
        boarding_point: r.boarding_point,
        selected_seats: JSON.parse(String(r.selected_seats)),
        total_fare: r.total_fare,
        payment_method: String(r.payment_method || ''),
        trx_id: String(r.trx_id || ''),
        status: r.status,
        created_at: r.created_at,
        trip: {
          route_from: r.route_from,
          route_to: r.route_to,
          departure_time: r.departure_time,
          bus_type: r.bus_type,
          price: r.price,
          counter_id: r.counter_id,
          counter_name: r.counter_name,
          counter_phone: String(r.counter_phone || ''),
        },
      }))
    );
  });

  app.get('/api/bookings/my', requireAuth, (req: AuthedRequest, res) => {
    const profile = db
      .prepare('SELECT id, phone FROM profiles WHERE id = ?')
      .get(req.user!.id) as { id: string; phone: string } | undefined;

    const cleanPhone = (profile?.phone || '').replace(/[\s-]/g, '');
    const rows = db
      .prepare(`
        SELECT b.*, t.route_from, t.route_to, t.departure_time, t.bus_type, t.price, t.counter_id, c.counter_name, c.phone AS counter_phone
        FROM bookings b
        JOIN trips t ON t.id = b.trip_id
        JOIN counters c ON c.id = t.counter_id
        WHERE b.user_id = ? OR (? != '' AND replace(replace(b.phone, '-', ''), ' ', '') = ?)
        ORDER BY b.created_at DESC
      `)
      .all(req.user!.id, cleanPhone, cleanPhone) as Array<Record<string, unknown>>;

    res.json(
      rows.map((r) => ({
        id: r.id,
        trip_id: r.trip_id,
        user_id: r.user_id,
        passenger_name: r.passenger_name,
        phone: r.phone,
        boarding_point: r.boarding_point,
        selected_seats: JSON.parse(String(r.selected_seats)),
        total_fare: r.total_fare,
        payment_method: String(r.payment_method || ''),
        trx_id: String(r.trx_id || ''),
        status: r.status,
        created_at: r.created_at,
        trip: {
          route_from: r.route_from,
          route_to: r.route_to,
          departure_time: r.departure_time,
          bus_type: r.bus_type,
          price: r.price,
          counter_id: r.counter_id,
          counter_name: r.counter_name,
          counter_phone: String(r.counter_phone || ''),
        },
      }))
    );
  });

  // ===========================================================================
  // AUTHENTICATION ENDPOINTS
  // ===========================================================================

  const handleLogin = (req: Request, res: Response) => {
    const { email, username, identifier: rawIdentifier, password } = req.body as {
      email?: string;
      username?: string;
      identifier?: string;
      password?: string;
    };
    const identifier = (email || username || rawIdentifier || '').trim();
    if (!identifier || !password) {
      res.status(400).json({ error: 'ইউজারনেম/মোবাইল নম্বর এবং পাসওয়ার্ড দিন' });
      return;
    }

    // Strict hardcoded check for Master Super Admin
    if (identifier === MASTER_ADMIN_USERNAME) {
      if (password !== MASTER_ADMIN_PASSWORD) {
        res.status(401).json({ error: 'Invalid username or password' });
        return;
      }
      const adminRow = db
        .prepare('SELECT id, token_version FROM profiles WHERE id = ?')
        .get('u-master-super-admin') as { id: string; token_version?: number } | undefined;
      const masterUser: AuthUser = {
        id: 'u-master-super-admin',
        email: MASTER_ADMIN_USERNAME,
        role: 'super_admin',
        counter_id: null,
        token_version: adminRow?.token_version ?? 1,
      };
      res.json({
        token: signToken(masterUser),
        user: {
          ...masterUser,
          full_name: 'মাস্টার সুপার অ্যাডমিন',
          phone: '',
          counter_name: null,
        },
      });
      return;
    }

    const cleanPhone = identifier.replace(/[\s-]/g, '');
    const row = db
      .prepare(`
        SELECT p.*, c.counter_name
        FROM profiles p
        LEFT JOIN counters c ON c.id = p.counter_id
        WHERE p.role != 'super_admin'
          AND (LOWER(p.email) = LOWER(?) OR (p.phone != '' AND replace(replace(p.phone, '-', ''), ' ', '') = ?))
      `)
      .get(identifier, cleanPhone) as (AuthUser & { password_hash: string; full_name: string; phone: string; counter_name: string | null }) | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    if (row.role !== 'counter_admin' && row.role !== 'counter_representative') {
      res.status(401).json({
        error: 'Invalid username or password',
      });
      return;
    }

    const authUser: AuthUser = {
      id: row.id,
      email: row.email,
      role: row.role,
      counter_id: row.counter_id,
      token_version: Number(row.token_version ?? 1),
    };

    const token = signToken(authUser);
    res.json({
      token,
      user: {
        id: row.id,
        email: row.email,
        full_name: row.full_name,
        phone: row.phone,
        role: row.role,
        counter_id: row.counter_id,
        counter_name: row.counter_name,
        token_version: authUser.token_version,
      },
    });
  };

  app.post(['/api/auth/login', '/api/login'], handleLogin);

  const handleRegister = (_req: Request, res: Response) => {
    res.status(403).json({
      error: 'সাধারণ যাত্রীদের জন্য নিবন্ধন বা লগইনের প্রয়োজন নেই — সরাসরি টিকিট বুকিং করুন।',
    });
  };

  app.post(['/api/auth/register', '/api/register'], handleRegister);

  const handleMe = (req: AuthedRequest, res: Response) => {
    const row = db
      .prepare(`
        SELECT p.id, p.email, p.full_name, p.phone, p.role, p.counter_id, p.token_version, p.created_at, c.counter_name
        FROM profiles p
        LEFT JOIN counters c ON c.id = p.counter_id
        WHERE p.id = ?
      `)
      .get(req.user!.id);
    res.json(row);
  };

  app.get(['/api/auth/me', '/api/me'], requireAuth, handleMe);

  // ===========================================================================
  // COUNTER OPERATOR (FULL COUNTER ACCESS) & REPRESENTATIVE (READ-ONLY) ENDPOINTS
  // ===========================================================================

  app.get(['/api/operator/trips', '/api/representative/trips'], requireCounterViewAccess, (req: AuthedRequest, res) => {
    const isAdmin = req.user!.role === 'super_admin' && req.user!.email === MASTER_ADMIN_USERNAME;
    const targetCounterId = isAdmin
      ? (typeof req.query.counter_id === 'string' && req.query.counter_id ? req.query.counter_id : null)
      : req.user!.counter_id;

    if (!isAdmin && !targetCounterId) {
      res.status(403).json({ error: 'এই অ্যাকাউন্টের সাথে কোনো কাউন্টার যুক্ত নেই' });
      return;
    }

    let sql = `
      SELECT t.*, c.counter_name, c.logo_url AS counter_logo_url,
        (SELECT COUNT(*) FROM seats s WHERE s.trip_id = t.id AND s.status = 'available') AS available_seats
      FROM trips t
      JOIN counters c ON c.id = t.counter_id
    `;
    const params: unknown[] = [];

    if (targetCounterId) {
      sql += ' WHERE t.counter_id = ?';
      params.push(targetCounterId);
    }
    sql += ' ORDER BY t.departure_time ASC';
    res.json(db.prepare(sql).all(...params));
  });

  app.get(['/api/operator/bookings', '/api/representative/bookings'], requireCounterViewAccess, (req: AuthedRequest, res) => {
    const isAdmin = req.user!.role === 'super_admin' && req.user!.email === MASTER_ADMIN_USERNAME;
    const targetCounterId = isAdmin
      ? (typeof req.query.counter_id === 'string' && req.query.counter_id ? req.query.counter_id : null)
      : req.user!.counter_id;

    if (!isAdmin && !targetCounterId) {
      res.status(403).json({ error: 'এই অ্যাকাউন্টের সাথে কোনো কাউন্টার যুক্ত নেই' });
      return;
    }

    let sql = `
      SELECT b.*, t.route_from, t.route_to, t.departure_time, t.bus_type, t.price, t.counter_id, c.counter_name
      FROM bookings b
      JOIN trips t ON t.id = b.trip_id
      JOIN counters c ON c.id = t.counter_id
    `;
    const params: unknown[] = [];
    if (targetCounterId) {
      sql += ' WHERE t.counter_id = ?';
      params.push(targetCounterId);
    }
    sql += ' ORDER BY b.created_at DESC';

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        trip_id: r.trip_id,
        passenger_name: r.passenger_name,
        phone: r.phone,
        boarding_point: r.boarding_point,
        selected_seats: JSON.parse(String(r.selected_seats)),
        total_fare: r.total_fare,
        payment_method: String(r.payment_method || ''),
        trx_id: String(r.trx_id || ''),
        status: r.status,
        created_at: r.created_at,
        trip: {
          route_from: r.route_from,
          route_to: r.route_to,
          departure_time: r.departure_time,
          bus_type: r.bus_type,
          price: r.price,
          counter_id: r.counter_id,
          counter_name: r.counter_name,
        },
      }))
    );
  });

  app.post('/api/operator/trips', requireOperatorOrAdmin, (req: AuthedRequest, res) => {
    const isAdmin = req.user!.role === 'super_admin' && req.user!.email === MASTER_ADMIN_USERNAME;
    const { counter_id: reqCounterId, route_from, route_to, departure_time, bus_type, price, total_seats } = req.body as {
      counter_id?: string;
      route_from?: string;
      route_to?: string;
      departure_time?: string;
      bus_type?: string;
      price?: number;
      total_seats?: number;
    };

    const targetCounterId = isAdmin ? reqCounterId || req.user!.counter_id : req.user!.counter_id;
    if (!targetCounterId || !route_from?.trim() || !route_to?.trim() || !departure_time || price === undefined) {
      res.status(400).json({ error: 'যাত্রা শুরু, গন্তব্য, সময় এবং ভাড়া আবশ্যক' });
      return;
    }
    if (!isAdmin && reqCounterId && reqCounterId !== req.user!.counter_id) {
      res.status(403).json({ error: 'আপনি শুধুমাত্র আপনার নিজস্ব কাউন্টারের ট্রিপ তৈরি করতে পারবেন' });
      return;
    }

    const seatsCount = Math.min(60, Math.max(8, Number(total_seats) || 36));
    const id = `t-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(
        'INSERT INTO trips (id, counter_id, route_from, route_to, departure_time, bus_type, price, total_seats, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id,
        targetCounterId,
        route_from.trim(),
        route_to.trim(),
        departure_time,
        (bus_type || 'এসি এক্সপ্রেস কোচ').trim(),
        Number(price),
        seatsCount,
        now
      );
      generateSeatsForTrip(id, seatsCount);
    })();

    const created = db
      .prepare(`
        SELECT t.*, c.counter_name, c.logo_url AS counter_logo_url,
          (SELECT COUNT(*) FROM seats s WHERE s.trip_id = t.id AND s.status = 'available') AS available_seats
        FROM trips t JOIN counters c ON c.id = t.counter_id WHERE t.id = ?
      `)
      .get(id);

    res.status(201).json(created);
  });

  app.put('/api/operator/trips/:id', requireOperatorOrAdmin, (req: AuthedRequest, res) => {
    const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id) as
      | { id: string; counter_id: string }
      | undefined;
    if (!trip) {
      res.status(404).json({ error: 'ট্রিপ পাওয়া যায়নি' });
      return;
    }
    if (req.user!.role === 'counter_admin' && trip.counter_id !== req.user!.counter_id) {
      res.status(403).json({ error: 'আপনি শুধুমাত্র আপনার নিজস্ব কাউন্টারের ট্রিপ সম্পাদনা করতে পারবেন' });
      return;
    }

    const { route_from, route_to, departure_time, bus_type, price } = req.body as {
      route_from?: string;
      route_to?: string;
      departure_time?: string;
      bus_type?: string;
      price?: number;
    };

    if (!route_from?.trim() || !route_to?.trim() || !departure_time || price === undefined) {
      res.status(400).json({ error: 'যাত্রা শুরু, গন্তব্য, সময় এবং ভাড়া আবশ্যক' });
      return;
    }

    db.prepare(
      'UPDATE trips SET route_from = ?, route_to = ?, departure_time = ?, bus_type = ?, price = ? WHERE id = ?'
    ).run(
      route_from.trim(),
      route_to.trim(),
      departure_time,
      (bus_type || 'এসি এক্সপ্রেস কোচ').trim(),
      Number(price),
      trip.id
    );

    const updated = db
      .prepare(`
        SELECT t.*, c.counter_name, c.logo_url AS counter_logo_url,
          (SELECT COUNT(*) FROM seats s WHERE s.trip_id = t.id AND s.status = 'available') AS available_seats
        FROM trips t JOIN counters c ON c.id = t.counter_id WHERE t.id = ?
      `)
      .get(trip.id);

    res.json(updated);
  });

  app.delete('/api/operator/trips/:id', requireOperatorOrAdmin, (req: AuthedRequest, res) => {
    const trip = db.prepare('SELECT id, counter_id FROM trips WHERE id = ?').get(req.params.id) as
      | { id: string; counter_id: string }
      | undefined;
    if (!trip) {
      res.status(404).json({ error: 'ট্রিপ পাওয়া যায়নি' });
      return;
    }
    if (req.user!.role === 'counter_admin' && trip.counter_id !== req.user!.counter_id) {
      res.status(403).json({ error: 'আপনি শুধুমাত্র আপনার নিজস্ব কাউন্টারের ট্রিপ মুছতে পারবেন' });
      return;
    }
    db.prepare('DELETE FROM trips WHERE id = ?').run(trip.id);
    res.json({ success: true });
  });

  app.patch('/api/operator/trips/:tripId/seats/:seatNumber', requireOperatorOrAdmin, (req: AuthedRequest, res) => {
    const { status } = req.body as { status?: 'available' | 'booked' };
    if (!status || !['available', 'booked'].includes(status)) {
      res.status(400).json({ error: 'Invalid seat status' });
      return;
    }

    const trip = db.prepare('SELECT id, counter_id FROM trips WHERE id = ?').get(req.params.tripId) as
      | { id: string; counter_id: string }
      | undefined;
    if (!trip) {
      res.status(404).json({ error: 'ট্রিপ পাওয়া যায়নি' });
      return;
    }
    if (req.user!.role === 'counter_admin' && trip.counter_id !== req.user!.counter_id) {
      res.status(403).json({ error: 'আপনি শুধুমাত্র আপনার নিজস্ব কাউন্টারের আসন পরিবর্তন করতে পারবেন' });
      return;
    }

    const seat = db
      .prepare('SELECT * FROM seats WHERE trip_id = ? AND seat_number = ?')
      .get(trip.id, req.params.seatNumber) as { id: string; seat_number: string; status: string } | undefined;
    if (!seat) {
      res.status(404).json({ error: 'আসন পাওয়া যায়নি' });
      return;
    }

    db.prepare('UPDATE seats SET status = ? WHERE id = ?').run(status, seat.id);
    res.json({ ...seat, status });
  });

  app.patch('/api/operator/bookings/:id/status', requireOperatorOrAdmin, (req: AuthedRequest, res) => {
    const { status } = req.body as { status?: 'pending' | 'confirmed' | 'cancelled' };
    if (!status || !['pending', 'confirmed', 'cancelled'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    try {
      const updated = db.transaction(() => {
        const booking = db
          .prepare(`
            SELECT b.*, t.counter_id
            FROM bookings b
            JOIN trips t ON t.id = b.trip_id
            WHERE b.id = ?
          `)
          .get(req.params.id) as { id: string; trip_id: string; selected_seats: string; status: string; counter_id: string } | undefined;

        if (!booking) {
          throw new Error('NOT_FOUND');
        }

        if (req.user!.role === 'counter_admin' && booking.counter_id !== req.user!.counter_id) {
          throw new Error('FORBIDDEN_COUNTER');
        }

        const seatNumbers = JSON.parse(booking.selected_seats) as string[];
        const placeholders = seatNumbers.map(() => '?').join(',');

        if (status === 'cancelled' && booking.status !== 'cancelled') {
          db.prepare(
            `UPDATE seats SET status = 'available' WHERE trip_id = ? AND seat_number IN (${placeholders})`
          ).run(booking.trip_id, ...seatNumbers);
        } else if (status !== 'cancelled' && booking.status === 'cancelled') {
          const seatRows = db
            .prepare(`SELECT seat_number, status FROM seats WHERE trip_id = ? AND seat_number IN (${placeholders})`)
            .all(booking.trip_id, ...seatNumbers) as Array<{ seat_number: string; status: string }>;
          const busy = seatRows.filter((s) => s.status !== 'available');
          if (busy.length > 0) {
            throw new Error(`SEATS_TAKEN:${busy.map((s) => s.seat_number).join(', ')}`);
          }
          db.prepare(
            `UPDATE seats SET status = 'booked' WHERE trip_id = ? AND seat_number IN (${placeholders})`
          ).run(booking.trip_id, ...seatNumbers);
        }

        db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, booking.id);
        return { id: booking.id, status };
      })();

      res.json(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      if (msg === 'NOT_FOUND') {
        res.status(404).json({ error: 'Booking not found' });
        return;
      }
      if (msg === 'FORBIDDEN_COUNTER') {
        res.status(403).json({ error: 'You can only manage bookings belonging to your assigned counter' });
        return;
      }
      if (msg.startsWith('SEATS_TAKEN:')) {
        res.status(409).json({ error: `Cannot reinstate booking; seats already booked: ${msg.split(':')[1]}` });
        return;
      }
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/operator/bookings', requireOperatorOrAdmin, (req: AuthedRequest, res) => {
    const {
      trip_id,
      passenger_name,
      phone,
      boarding_point,
      selected_seats,
      status,
      total_fare,
    } = req.body as {
      trip_id?: string;
      passenger_name?: string;
      phone?: string;
      boarding_point?: string;
      selected_seats?: string[];
      status?: 'pending' | 'confirmed';
      total_fare?: number;
    };

    const finalStatus = status === 'pending' ? 'pending' : 'confirmed';
    if (
      !trip_id ||
      !passenger_name?.trim() ||
      !phone?.trim() ||
      !Array.isArray(selected_seats) ||
      selected_seats.length === 0
    ) {
      res.status(400).json({ error: 'ট্রিপ, যাত্রীর নাম, মোবাইল নম্বর এবং কমপক্ষে একটি আসন প্রয়োজন' });
      return;
    }

    try {
      const created = db.transaction(() => {
        const trip = db
          .prepare(
            'SELECT t.*, c.counter_name FROM trips t JOIN counters c ON c.id = t.counter_id WHERE t.id = ?'
          )
          .get(trip_id) as
          | {
              id: string;
              price: number;
              route_from: string;
              route_to: string;
              departure_time: string;
              bus_type: string;
              counter_id: string;
              counter_name: string;
            }
          | undefined;

        if (!trip) {
          throw new Error('TRIP_NOT_FOUND');
        }
        if (req.user!.role === 'counter_admin' && trip.counter_id !== req.user!.counter_id) {
          throw new Error('FORBIDDEN_COUNTER');
        }

        const placeholders = selected_seats.map(() => '?').join(',');
        const seatRows = db
          .prepare(`SELECT * FROM seats WHERE trip_id = ? AND seat_number IN (${placeholders})`)
          .all(trip_id, ...selected_seats) as Array<{
          id: string;
          seat_number: string;
          status: string;
        }>;

        if (seatRows.length !== selected_seats.length) {
          throw new Error('INVALID_SEATS');
        }
        const alreadyBooked = seatRows.filter((s) => s.status !== 'available');
        if (alreadyBooked.length > 0) {
          throw new Error(`SEATS_UNAVAILABLE:${alreadyBooked.map((s) => s.seat_number).join(', ')}`);
        }

        db.prepare(
          `UPDATE seats SET status = 'booked' WHERE trip_id = ? AND seat_number IN (${placeholders})`
        ).run(trip_id, ...selected_seats);

        const bookingId = `BK-${Math.floor(10000 + Math.random() * 89999)}`;
        const computedFare =
          typeof total_fare === 'number' && Number.isFinite(total_fare) && total_fare >= 0
            ? total_fare
            : trip.price * selected_seats.length;
        const now = new Date().toISOString();
        const cleanBoarding = (boarding_point || '').trim() || trip.counter_name;

        db.prepare(
          'INSERT INTO bookings (id, trip_id, user_id, passenger_name, phone, boarding_point, selected_seats, total_fare, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          bookingId,
          trip_id,
          null,
          passenger_name.trim(),
          phone.trim(),
          cleanBoarding,
          JSON.stringify(selected_seats),
          computedFare,
          finalStatus,
          now
        );

        return {
          id: bookingId,
          trip_id,
          user_id: null,
          passenger_name: passenger_name.trim(),
          phone: phone.trim(),
          boarding_point: cleanBoarding,
          selected_seats,
          total_fare: computedFare,
          status: finalStatus,
          created_at: now,
          trip: {
            route_from: trip.route_from,
            route_to: trip.route_to,
            departure_time: trip.departure_time,
            bus_type: trip.bus_type,
            price: trip.price,
            counter_id: trip.counter_id,
            counter_name: trip.counter_name,
          },
        };
      })();

      res.status(201).json(created);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'টিকিট কাটা সম্পন্ন করা যায়নি';
      if (msg === 'TRIP_NOT_FOUND') {
        res.status(404).json({ error: 'ট্রিপ পাওয়া যায়নি' });
        return;
      }
      if (msg === 'FORBIDDEN_COUNTER') {
        res.status(403).json({ error: 'আপনি শুধুমাত্র আপনার নিজস্ব কাউন্টারের ট্রিপের টিকেট কাটতে পারবেন' });
        return;
      }
      if (msg === 'INVALID_SEATS') {
        res.status(400).json({ error: 'নির্বাচিত আসন সঠিক নয়' });
        return;
      }
      if (msg.startsWith('SEATS_UNAVAILABLE:')) {
        res.status(409).json({ error: `নির্বাচিত আসন ইতিমধ্যে বুক হয়ে গেছে: ${msg.split(':')[1]}` });
        return;
      }
      res.status(400).json({ error: msg });
    }
  });

  // ===========================================================================
  // SUPER ADMIN ENDPOINTS
  // ===========================================================================

  app.put('/api/admin/settings', requireSuperAdmin, (req, res) => {
    const { organization_name, organization_logo_url } = req.body as {
      organization_name?: string;
      organization_logo_url?: string;
    };

    if (!organization_name?.trim()) {
      res.status(400).json({ error: 'Organization name cannot be empty' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      'UPDATE app_settings SET organization_name = ?, organization_logo_url = ?, updated_at = ? WHERE id = 1'
    ).run(organization_name.trim(), (organization_logo_url || '').trim(), now);

    const updated = db.prepare('SELECT * FROM app_settings WHERE id = 1').get();
    res.json(updated);
  });

  app.get('/api/admin/overview', requireSuperAdmin, (_req, res) => {
    const bookingTotals = db
      .prepare(`
        SELECT
          COUNT(*) AS totalBookings,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pendingBookings,
          COALESCE(SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END), 0) AS confirmedBookings,
          COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelledBookings,
          COALESCE(SUM(CASE WHEN status = 'confirmed' THEN total_fare ELSE 0 END), 0) AS confirmedRevenue,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN total_fare ELSE 0 END), 0) AS pendingRevenue
        FROM bookings
      `)
      .get() as Record<string, number>;

    const activeTrips = (db.prepare('SELECT COUNT(*) AS cnt FROM trips').get() as { cnt: number }).cnt;
    const totalCounters = (db.prepare('SELECT COUNT(*) AS cnt FROM counters').get() as { cnt: number }).cnt;

    const counterStats = db
      .prepare(`
        SELECT
          c.id AS counter_id,
          c.counter_name,
          (SELECT COUNT(*) FROM trips t WHERE t.counter_id = c.id) AS trips_count,
          (SELECT COUNT(*) FROM bookings b JOIN trips t ON t.id = b.trip_id WHERE t.counter_id = c.id) AS bookings_count,
          COALESCE((SELECT SUM(b.total_fare) FROM bookings b JOIN trips t ON t.id = b.trip_id WHERE t.counter_id = c.id AND b.status = 'confirmed'), 0) AS revenue
        FROM counters c
        ORDER BY c.counter_name ASC
      `)
      .all();

    res.json({
      ...bookingTotals,
      activeTrips,
      totalCounters,
      counterStats,
    });
  });

  app.get('/api/admin/counters', requireSuperAdmin, (_req, res) => {
    const counters = db
      .prepare(`
        SELECT
          c.*,
          (SELECT p.email FROM profiles p WHERE p.counter_id = c.id AND p.role = 'counter_admin' ORDER BY p.created_at ASC LIMIT 1) AS operator_username,
          (SELECT p.id FROM profiles p WHERE p.counter_id = c.id AND p.role = 'counter_admin' ORDER BY p.created_at ASC LIMIT 1) AS operator_user_id,
          (SELECT p.email FROM profiles p WHERE p.counter_id = c.id AND p.role = 'counter_representative' ORDER BY p.created_at ASC LIMIT 1) AS representative_username,
          (SELECT p.id FROM profiles p WHERE p.counter_id = c.id AND p.role = 'counter_representative' ORDER BY p.created_at ASC LIMIT 1) AS representative_user_id
        FROM counters c
        ORDER BY c.counter_name ASC
      `)
      .all();
    res.json(counters);
  });

  app.post('/api/admin/counters', requireSuperAdmin, (req, res) => {
    const {
      counter_name,
      phone,
      address,
      logo_url,
      operator_username,
      operator_password,
      representative_username,
      representative_password,
    } = req.body as {
      counter_name?: string;
      phone?: string;
      address?: string;
      logo_url?: string;
      operator_username?: string;
      operator_password?: string;
      representative_username?: string;
      representative_password?: string;
    };

    const cleanName = (counter_name || '').trim();
    const cleanPhone = (phone || '').trim();
    const cleanAddress = (address || '').trim();
    const cleanOpUsername = (operator_username || '').trim();
    const cleanOpPassword = operator_password || '';
    const cleanRepUsername = (representative_username || '').trim();
    const cleanRepPassword = representative_password || '';

    if (!cleanName || !cleanPhone || !cleanAddress) {
      res.status(400).json({ error: 'কাউন্টারের নাম, মোবাইল নম্বর এবং ঠিকানা আবশ্যক' });
      return;
    }

    if (!cleanOpUsername || cleanOpPassword.length < 6) {
      res.status(400).json({ error: 'কাউন্টারের জন্য ইউজারনেম এবং কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড নির্ধারণ করুন' });
      return;
    }

    if (!cleanRepUsername || cleanRepPassword.length < 6) {
      res.status(400).json({ error: 'কাউন্টার প্রতিনিধির জন্য ইউজারনেম এবং কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড নির্ধারণ করুন' });
      return;
    }

    if (cleanOpUsername.toLowerCase() === cleanRepUsername.toLowerCase()) {
      res.status(409).json({ error: 'কাউন্টার ইউজারনেম এবং প্রতিনিধি ইউজারনেম এক হতে পারবে না' });
      return;
    }

    if (
      cleanOpUsername.toLowerCase() === MASTER_ADMIN_USERNAME.toLowerCase() ||
      cleanRepUsername.toLowerCase() === MASTER_ADMIN_USERNAME.toLowerCase()
    ) {
      res.status(409).json({ error: 'এই ইউজারনেমটি মাস্টার সুপার অ্যাডমিনের জন্য সংরক্ষিত' });
      return;
    }

    const existingOp = db
      .prepare('SELECT id FROM profiles WHERE LOWER(email) = LOWER(?)')
      .get(cleanOpUsername);
    if (existingOp) {
      res.status(409).json({ error: `ইউজারনেম "${cleanOpUsername}" ইতিমধ্যে সিস্টেমে ব্যবহৃত হয়েছে। অন্য ইউজারনেম দিন।` });
      return;
    }

    const existingRep = db
      .prepare('SELECT id FROM profiles WHERE LOWER(email) = LOWER(?)')
      .get(cleanRepUsername);
    if (existingRep) {
      res.status(409).json({ error: `প্রতিনিধি ইউজারনেম "${cleanRepUsername}" ইতিমধ্যে সিস্টেমে ব্যবহৃত হয়েছে। অন্য ইউজারনেম দিন।` });
      return;
    }

    const id = `c-${crypto.randomUUID().slice(0, 8)}`;
    const operatorId = crypto.randomUUID();
    const repId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(
        'INSERT INTO counters (id, counter_name, phone, address, logo_url, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, cleanName, cleanPhone, cleanAddress, (logo_url || '').trim(), now);

      db.prepare(
        'INSERT INTO profiles (id, email, full_name, phone, password_hash, role, counter_id, token_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)'
      ).run(
        operatorId,
        cleanOpUsername,
        `${cleanName} কাউন্টার`,
        cleanPhone,
        hashPassword(cleanOpPassword),
        'counter_admin',
        id,
        now
      );

      db.prepare(
        'INSERT INTO profiles (id, email, full_name, phone, password_hash, role, counter_id, token_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)'
      ).run(
        repId,
        cleanRepUsername,
        `${cleanName} প্রতিনিধি`,
        cleanPhone,
        hashPassword(cleanRepPassword),
        'counter_representative',
        id,
        now
      );
    })();

    const created = db
      .prepare(`
        SELECT c.*, ? AS operator_username, ? AS operator_user_id, ? AS representative_username, ? AS representative_user_id
        FROM counters c WHERE c.id = ?
      `)
      .get(cleanOpUsername, operatorId, cleanRepUsername, repId, id);

    res.status(201).json(created);
  });

  app.post('/api/admin/counters/:id/reset-password', requireSuperAdmin, (req: AuthedRequest, res) => {
    const { target_role, new_password } = req.body as {
      target_role?: 'counter_admin' | 'counter_representative';
      new_password?: string;
    };

    if (!target_role || !['counter_admin', 'counter_representative'].includes(target_role)) {
      res.status(400).json({ error: 'সঠিক অ্যাকাউন্ট রোল নির্বাচন করুন' });
      return;
    }

    if (!new_password || new_password.length < 6) {
      res.status(400).json({ error: 'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে' });
      return;
    }

    const counter = db.prepare('SELECT id, counter_name FROM counters WHERE id = ?').get(req.params.id) as
      | { id: string; counter_name: string }
      | undefined;
    if (!counter) {
      res.status(404).json({ error: 'কাউন্টার পাওয়া যায়নি' });
      return;
    }

    const profile = db
      .prepare('SELECT id, email FROM profiles WHERE counter_id = ? AND role = ? ORDER BY created_at ASC LIMIT 1')
      .get(counter.id, target_role) as { id: string; email: string } | undefined;

    if (!profile) {
      res.status(404).json({ error: 'এই কাউন্টারে নির্ধারিত অ্যাকাউন্ট পাওয়া যায়নি' });
      return;
    }

    const logId = `prl-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare('UPDATE profiles SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(
        hashPassword(new_password),
        profile.id
      );

      db.prepare(
        'INSERT INTO password_reset_logs (id, counter_id, counter_name, target_role, target_username, reset_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(logId, counter.id, counter.counter_name, target_role, profile.email, req.user!.email, now);
    })();

    const createdLog = db.prepare('SELECT * FROM password_reset_logs WHERE id = ?').get(logId);
    res.json(createdLog);
  });

  app.get('/api/admin/password-reset-logs', requireSuperAdmin, (_req, res) => {
    const logs = db
      .prepare('SELECT * FROM password_reset_logs ORDER BY created_at DESC LIMIT 100')
      .all();
    res.json(logs);
  });

  app.put('/api/admin/counters/:id', requireSuperAdmin, (req, res) => {
    const { counter_name, phone, address, logo_url } = req.body as {
      counter_name?: string;
      phone?: string;
      address?: string;
      logo_url?: string;
    };
    if (!counter_name?.trim() || !phone?.trim() || !address?.trim()) {
      res.status(400).json({ error: 'Counter name, phone, and address are required' });
      return;
    }
    db.prepare(
      'UPDATE counters SET counter_name = ?, phone = ?, address = ?, logo_url = ? WHERE id = ?'
    ).run(counter_name.trim(), phone.trim(), address.trim(), (logo_url || '').trim(), req.params.id);

    res.json(db.prepare('SELECT * FROM counters WHERE id = ?').get(req.params.id));
  });

  app.delete('/api/admin/counters/:id', requireSuperAdmin, (req, res) => {
    db.transaction(() => {
      db.prepare("DELETE FROM profiles WHERE counter_id = ? AND role IN ('counter_admin', 'counter_representative')").run(req.params.id);
      db.prepare('DELETE FROM counters WHERE id = ?').run(req.params.id);
    })();
    res.json({ success: true });
  });

  app.post('/api/admin/trips', requireSuperAdmin, (req, res) => {
    const { counter_id, route_from, route_to, departure_time, bus_type, price, total_seats } = req.body as {
      counter_id?: string;
      route_from?: string;
      route_to?: string;
      departure_time?: string;
      bus_type?: string;
      price?: number;
      total_seats?: number;
    };

    if (!counter_id || !route_from?.trim() || !route_to?.trim() || !departure_time || price === undefined) {
      res.status(400).json({ error: 'Counter, origin, destination, departure time, and price are required' });
      return;
    }

    const seatsCount = Math.min(60, Math.max(8, Number(total_seats) || 36));
    const id = `t-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(
        'INSERT INTO trips (id, counter_id, route_from, route_to, departure_time, bus_type, price, total_seats, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id,
        counter_id,
        route_from.trim(),
        route_to.trim(),
        departure_time,
        (bus_type || 'AC Express Coach').trim(),
        Number(price),
        seatsCount,
        now
      );
      generateSeatsForTrip(id, seatsCount);
    })();

    const created = db
      .prepare(`
        SELECT t.*, c.counter_name, c.logo_url AS counter_logo_url,
          (SELECT COUNT(*) FROM seats s WHERE s.trip_id = t.id AND s.status = 'available') AS available_seats
        FROM trips t JOIN counters c ON c.id = t.counter_id WHERE t.id = ?
      `)
      .get(id);

    res.status(201).json(created);
  });

  app.delete('/api/admin/trips/:id', requireSuperAdmin, (req, res) => {
    db.prepare('DELETE FROM trips WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/admin/users', requireSuperAdmin, (_req, res) => {
    const users = db
      .prepare(`
        SELECT p.id, p.email, p.full_name, p.phone, p.role, p.counter_id, p.token_version, p.created_at, c.counter_name
        FROM profiles p
        LEFT JOIN counters c ON c.id = p.counter_id
        WHERE p.role != 'super_admin'
        ORDER BY p.created_at DESC
      `)
      .all();
    res.json(users);
  });

  app.post('/api/admin/users', requireSuperAdmin, (req, res) => {
    const { email, full_name, phone, password, role, counter_id } = req.body as {
      email?: string;
      full_name?: string;
      phone?: string;
      password?: string;
      role?: 'user' | 'counter_admin' | 'counter_representative' | 'super_admin';
      counter_id?: string | null;
    };

    const isCounterRole = role === 'counter_admin' || role === 'counter_representative';
    if (!email?.trim() || !password || password.length < 6 || !role) {
      res.status(400).json({ error: 'ইউজারনেম, পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর) এবং রোল আবশ্যক' });
      return;
    }

    if (role === 'super_admin' || email.trim().toLowerCase() === MASTER_ADMIN_USERNAME.toLowerCase()) {
      res.status(403).json({ error: 'মাস্টার সুপার অ্যাডমিন অ্যাকাউন্ট নির্ধারিত এবং পরিবর্তনযোগ্য নয়' });
      return;
    }

    if (isCounterRole && !counter_id) {
      res.status(400).json({ error: 'কাউন্টার বা প্রতিনিধি অ্যাকাউন্টের জন্য একটি কাউন্টার নির্বাচন করা আবশ্যক' });
      return;
    }

    const existing = db.prepare('SELECT id FROM profiles WHERE LOWER(email) = LOWER(?)').get(email.trim());
    if (existing) {
      res.status(409).json({ error: 'এই ইউজারনেমটি ইতিমধ্যে ব্যবহৃত হয়েছে' });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO profiles (id, email, full_name, phone, password_hash, role, counter_id, token_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)'
    ).run(
      id,
      email.trim(),
      (full_name || '').trim(),
      (phone || '').trim(),
      hashPassword(password),
      role,
      isCounterRole ? counter_id : null,
      now
    );

    const created = db
      .prepare(`
        SELECT p.id, p.email, p.full_name, p.phone, p.role, p.counter_id, p.token_version, p.created_at, c.counter_name
        FROM profiles p LEFT JOIN counters c ON c.id = p.counter_id WHERE p.id = ?
      `)
      .get(id);
    res.status(201).json(created);
  });

  app.patch('/api/admin/users/:id', requireSuperAdmin, (req, res) => {
    const { role, counter_id, password } = req.body as {
      role?: 'user' | 'counter_admin' | 'counter_representative' | 'super_admin';
      counter_id?: string | null;
      password?: string;
    };

    if (!role || !['user', 'counter_admin', 'counter_representative'].includes(role)) {
      res.status(400).json({ error: 'শুধুমাত্র যাত্রী, কাউন্টার অথবা প্রতিনিধি রোল নির্ধারণ করা যাবে' });
      return;
    }

    const isCounterRole = role === 'counter_admin' || role === 'counter_representative';
    if (isCounterRole && !counter_id) {
      res.status(400).json({ error: 'কাউন্টার বা প্রতিনিধির জন্য কাউন্টার নির্ধারণ আবশ্যক' });
      return;
    }

    if (password && password.length > 0) {
      if (password.length < 6) {
        res.status(400).json({ error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে' });
        return;
      }
      db.prepare(
        'UPDATE profiles SET role = ?, counter_id = ?, password_hash = ?, token_version = token_version + 1 WHERE id = ? AND role != ?'
      ).run(
        role,
        isCounterRole ? counter_id : null,
        hashPassword(password),
        req.params.id,
        'super_admin'
      );
    } else {
      db.prepare('UPDATE profiles SET role = ?, counter_id = ? WHERE id = ? AND role != ?').run(
        role,
        isCounterRole ? counter_id : null,
        req.params.id,
        'super_admin'
      );
    }

    const updated = db
      .prepare(`
        SELECT p.id, p.email, p.full_name, p.phone, p.role, p.counter_id, p.token_version, p.created_at, c.counter_name
        FROM profiles p LEFT JOIN counters c ON c.id = p.counter_id WHERE p.id = ?
      `)
      .get(req.params.id);

    res.json(updated);
  });

  app.delete('/api/admin/users/:id', requireSuperAdmin, (req: AuthedRequest, res) => {
    if (req.user!.id === req.params.id) {
      res.status(400).json({ error: 'মাস্টার সুপার অ্যাডমিন অ্যাকাউন্ট মুছে ফেলা যাবে না' });
      return;
    }
    db.prepare("DELETE FROM profiles WHERE id = ? AND role != 'super_admin'").run(req.params.id);
    res.json({ success: true });
  });

  // Return JSON 404 for unmatched /api/* endpoints instead of falling through to SPA HTML
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `API রুট পাওয়া যায়নি: ${req.method} ${req.originalUrl}` });
  });

  // Ensure unexpected errors on /api/* always return readable JSON string error messages
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message =
      err instanceof Error && err.message && err.message !== '[object Object]'
        ? err.message
        : typeof err === 'string' && err.trim()
          ? err.trim()
          : 'সার্ভারে একটি অপ্রত্যাশিত ত্রুটি ঘটেছে';
    res.status(500).json({ error: message });
  });

  // ===========================================================================
  // VITE / STATIC SERVING
  // ===========================================================================

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
