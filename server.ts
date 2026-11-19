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
  role: 'user' | 'counter_admin' | 'super_admin';
  counter_id: string | null;
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
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'counter_admin', 'super_admin')),
    counter_id TEXT REFERENCES counters(id) ON DELETE SET NULL,
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
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    created_at TEXT NOT NULL
  );
`);

// Safely add new columns if upgrading an existing SQLite database
const profileCols = db.prepare('PRAGMA table_info(profiles)').all() as Array<{ name: string }>;
if (!profileCols.some((c) => c.name === 'phone')) {
  db.exec("ALTER TABLE profiles ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
}
const bookingCols = db.prepare('PRAGMA table_info(bookings)').all() as Array<{ name: string }>;
if (!bookingCols.some((c) => c.name === 'user_id')) {
  db.exec('ALTER TABLE bookings ADD COLUMN user_id TEXT DEFAULT NULL');
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
    return { id: data.id, email: data.email, role: data.role, counter_id: data.counter_id };
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
    ).run('দেশ ভ্রমণ / Desh Travels', '/src/assets/images/default_org_logo_1794840144839.jpg', now);

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

// Express Auth Middleware
function attachUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const user = verifyToken(token);
    if (user) {
      // Fetch latest role and counter_id from DB in case admin reassigned it
      const row = db
        .prepare('SELECT id, email, role, counter_id FROM profiles WHERE id = ?')
        .get(user.id) as AuthUser | undefined;
      if (row) {
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
    res.status(403).json({ error: 'Forbidden: Counter Operator access required' });
    return;
  }
  if (req.user.role === 'counter_admin' && !req.user.counter_id) {
    res.status(403).json({ error: 'Operator account is not assigned to any counter' });
    return;
  }
  next();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '6mb' }));
  app.use(attachUser);

  // ===========================================================================
  // PUBLIC ENDPOINTS
  // ===========================================================================

  app.get('/api/settings', (_req, res) => {
    const settings = db.prepare('SELECT * FROM app_settings WHERE id = 1').get();
    res.json(settings);
  });

  app.get('/api/counters', (_req, res) => {
    const counters = db.prepare('SELECT * FROM counters ORDER BY counter_name ASC').all();
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

  app.post('/api/bookings', requireAuth, (req: AuthedRequest, res) => {
    const { trip_id, passenger_name, phone, boarding_point, selected_seats } = req.body as {
      trip_id?: string;
      passenger_name?: string;
      phone?: string;
      boarding_point?: string;
      selected_seats?: string[];
    };

    if (!trip_id || !passenger_name?.trim() || !phone?.trim() || !Array.isArray(selected_seats) || selected_seats.length === 0) {
      res.status(400).json({ error: 'ট্রিপ, যাত্রীর নাম, মোবাইল নম্বর এবং কমপক্ষে একটি আসন প্রয়োজন' });
      return;
    }

    try {
      const created = db.transaction(() => {
        const trip = db
          .prepare('SELECT t.*, c.counter_name FROM trips t JOIN counters c ON c.id = t.counter_id WHERE t.id = ?')
          .get(trip_id) as { id: string; price: number; route_from: string; route_to: string; departure_time: string; bus_type: string; counter_id: string; counter_name: string } | undefined;

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

        db.prepare(
          'INSERT INTO bookings (id, trip_id, user_id, passenger_name, phone, boarding_point, selected_seats, total_fare, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          bookingId,
          trip_id,
          req.user!.id,
          passenger_name.trim(),
          phone.trim(),
          (boarding_point || '').trim(),
          JSON.stringify(selected_seats),
          totalFare,
          'pending',
          now
        );

        return {
          id: bookingId,
          trip_id,
          user_id: req.user!.id,
          passenger_name: passenger_name.trim(),
          phone: phone.trim(),
          boarding_point: (boarding_point || '').trim(),
          selected_seats,
          total_fare: totalFare,
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
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) {
      res.json([]);
      return;
    }

    const rows = db
      .prepare(`
        SELECT b.*, t.route_from, t.route_to, t.departure_time, t.bus_type, t.price, t.counter_id, c.counter_name
        FROM bookings b
        JOIN trips t ON t.id = b.trip_id
        JOIN counters c ON c.id = t.counter_id
        WHERE LOWER(b.id) = LOWER(?) OR replace(replace(b.phone, '-', ''), ' ', '') LIKE ?
        ORDER BY b.created_at DESC
      `)
      .all(query, `%${query.replace(/[\s-]/g, '')}%`) as Array<Record<string, unknown>>;

    res.json(
      rows.map((r) => ({
        id: r.id,
        trip_id: r.trip_id,
        passenger_name: r.passenger_name,
        phone: r.phone,
        boarding_point: r.boarding_point,
        selected_seats: JSON.parse(String(r.selected_seats)),
        total_fare: r.total_fare,
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

  app.get('/api/bookings/my', requireAuth, (req: AuthedRequest, res) => {
    const profile = db
      .prepare('SELECT id, phone FROM profiles WHERE id = ?')
      .get(req.user!.id) as { id: string; phone: string } | undefined;

    const cleanPhone = (profile?.phone || '').replace(/[\s-]/g, '');
    const rows = db
      .prepare(`
        SELECT b.*, t.route_from, t.route_to, t.departure_time, t.bus_type, t.price, t.counter_id, c.counter_name
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

  // ===========================================================================
  // AUTHENTICATION ENDPOINTS
  // ===========================================================================

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    const identifier = (email || '').trim();
    if (!identifier || !password) {
      res.status(400).json({ error: 'ইউজারনেম/মোবাইল নম্বর এবং পাসওয়ার্ড দিন' });
      return;
    }

    // Strict hardcoded check for Master Super Admin
    if (identifier === MASTER_ADMIN_USERNAME) {
      if (password !== MASTER_ADMIN_PASSWORD) {
        res.status(401).json({ error: 'ভুল ইউজারনেম বা পাসওয়ার্ড' });
        return;
      }
      const masterUser: AuthUser = {
        id: 'u-master-super-admin',
        email: MASTER_ADMIN_USERNAME,
        role: 'super_admin',
        counter_id: null,
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
      res.status(401).json({ error: 'ভুল ইউজারনেম বা পাসওয়ার্ড' });
      return;
    }

    const authUser: AuthUser = {
      id: row.id,
      email: row.email,
      role: row.role,
      counter_id: row.counter_id,
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
      },
    });
  });

  app.post('/api/auth/register', (req, res) => {
    const { email, password, full_name, phone } = req.body as {
      email?: string;
      password?: string;
      full_name?: string;
      phone?: string;
    };
    const cleanName = (full_name || '').trim();
    const cleanPhone = (phone || '').trim();
    const normalizedPhone = cleanPhone.replace(/[\s-]/g, '');
    const identifier = (email || '').trim().toLowerCase() || normalizedPhone;

    if (!cleanName || !cleanPhone || !password || password.length < 4) {
      res.status(400).json({ error: 'পূর্ণ নাম, মোবাইল নম্বর এবং কমপক্ষে ৪ অক্ষরের পাসওয়ার্ড দিন' });
      return;
    }

    if (identifier.toLowerCase() === MASTER_ADMIN_USERNAME.toLowerCase()) {
      res.status(409).json({ error: 'এই ইউজারনেমটি সংরক্ষিত' });
      return;
    }

    const existing = db
      .prepare(
        "SELECT id FROM profiles WHERE LOWER(email) = LOWER(?) OR (phone != '' AND replace(replace(phone, '-', ''), ' ', '') = ?)"
      )
      .get(identifier, normalizedPhone);
    if (existing) {
      res.status(409).json({ error: 'এই মোবাইল নম্বর বা ইমেইল দিয়ে ইতিমধ্যে অ্যাকাউন্ট রয়েছে। অনুগ্রহ করে লগইন করুন।' });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO profiles (id, email, full_name, phone, password_hash, role, counter_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, identifier, cleanName, cleanPhone, hashPassword(password), 'user', null, now);

    const authUser: AuthUser = {
      id,
      email: identifier,
      role: 'user',
      counter_id: null,
    };

    res.status(201).json({
      token: signToken(authUser),
      user: {
        ...authUser,
        full_name: cleanName,
        phone: cleanPhone,
        counter_name: null,
      },
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const row = db
      .prepare(`
        SELECT p.id, p.email, p.full_name, p.phone, p.role, p.counter_id, p.created_at, c.counter_name
        FROM profiles p
        LEFT JOIN counters c ON c.id = p.counter_id
        WHERE p.id = ?
      `)
      .get(req.user!.id);
    res.json(row);
  });

  // ===========================================================================
  // COUNTER OPERATOR ENDPOINTS (Strictly scoped to req.user.counter_id)
  // ===========================================================================

  app.get('/api/operator/trips', requireOperatorOrAdmin, (req: AuthedRequest, res) => {
    const isAdmin = req.user!.role === 'super_admin' && req.user!.email === MASTER_ADMIN_USERNAME;
    const targetCounterId = isAdmin
      ? (typeof req.query.counter_id === 'string' && req.query.counter_id ? req.query.counter_id : null)
      : req.user!.counter_id;

    if (!isAdmin && !targetCounterId) {
      res.status(403).json({ error: 'এই অপারেটর অ্যাকাউন্টের সাথে কোনো কাউন্টার যুক্ত নেই' });
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

  app.get('/api/operator/bookings', requireOperatorOrAdmin, (req: AuthedRequest, res) => {
    const isAdmin = req.user!.role === 'super_admin' && req.user!.email === MASTER_ADMIN_USERNAME;
    const targetCounterId = isAdmin
      ? (typeof req.query.counter_id === 'string' && req.query.counter_id ? req.query.counter_id : null)
      : req.user!.counter_id;

    if (!isAdmin && !targetCounterId) {
      res.status(403).json({ error: 'এই অপারেটর অ্যাকাউন্টের সাথে কোনো কাউন্টার যুক্ত নেই' });
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

  app.post('/api/admin/counters', requireSuperAdmin, (req, res) => {
    const {
      counter_name,
      phone,
      address,
      logo_url,
      operator_username,
      operator_password,
    } = req.body as {
      counter_name?: string;
      phone?: string;
      address?: string;
      logo_url?: string;
      operator_username?: string;
      operator_password?: string;
    };

    const cleanName = (counter_name || '').trim();
    const cleanPhone = (phone || '').trim();
    const cleanAddress = (address || '').trim();
    const cleanUsername = (operator_username || '').trim();
    const cleanPassword = operator_password || '';

    if (!cleanName || !cleanPhone || !cleanAddress) {
      res.status(400).json({ error: 'কাউন্টারের নাম, মোবাইল নম্বর এবং ঠিকানা আবশ্যক' });
      return;
    }

    if (!cleanUsername || cleanPassword.length < 4) {
      res.status(400).json({ error: 'কাউন্টারের জন্য ইউজারনেম এবং কমপক্ষে ৪ অক্ষরের পাসওয়ার্ড নির্ধারণ করুন' });
      return;
    }

    if (cleanUsername.toLowerCase() === MASTER_ADMIN_USERNAME.toLowerCase()) {
      res.status(409).json({ error: 'এই ইউজারনেমটি মাস্টার সুপার অ্যাডমিনের জন্য সংরক্ষিত' });
      return;
    }

    const existingUser = db
      .prepare('SELECT id FROM profiles WHERE LOWER(email) = LOWER(?)')
      .get(cleanUsername);
    if (existingUser) {
      res.status(409).json({ error: 'এই কাউন্টার ইউজারনেমটি ইতিমধ্যে ব্যবহৃত হয়েছে। অন্য ইউজারনেম দিন।' });
      return;
    }

    const id = `c-${crypto.randomUUID().slice(0, 8)}`;
    const operatorId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(
        'INSERT INTO counters (id, counter_name, phone, address, logo_url, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, cleanName, cleanPhone, cleanAddress, (logo_url || '').trim(), now);

      db.prepare(
        'INSERT INTO profiles (id, email, full_name, phone, password_hash, role, counter_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        operatorId,
        cleanUsername,
        `${cleanName} অপারেটর`,
        cleanPhone,
        hashPassword(cleanPassword),
        'counter_admin',
        id,
        now
      );
    })();

    res.status(201).json(db.prepare('SELECT * FROM counters WHERE id = ?').get(id));
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
      db.prepare("DELETE FROM profiles WHERE counter_id = ? AND role = 'counter_admin'").run(req.params.id);
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
        SELECT p.id, p.email, p.full_name, p.phone, p.role, p.counter_id, p.created_at, c.counter_name
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
      role?: 'user' | 'counter_admin' | 'super_admin';
      counter_id?: string | null;
    };

    if (!email?.trim() || !password || password.length < 4 || !role) {
      res.status(400).json({ error: 'ইউজারনেম, পাসওয়ার্ড (কমপক্ষে ৪ অক্ষর) এবং রোল আবশ্যক' });
      return;
    }

    if (role === 'super_admin' || email.trim().toLowerCase() === MASTER_ADMIN_USERNAME.toLowerCase()) {
      res.status(403).json({ error: 'মাস্টার সুপার অ্যাডমিন অ্যাকাউন্ট নির্ধারিত এবং পরিবর্তনযোগ্য নয়' });
      return;
    }

    if (role === 'counter_admin' && !counter_id) {
      res.status(400).json({ error: 'কাউন্টার অপারেটরের জন্য একটি কাউন্টার নির্বাচন করা আবশ্যক' });
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
      'INSERT INTO profiles (id, email, full_name, phone, password_hash, role, counter_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      email.trim(),
      (full_name || '').trim(),
      (phone || '').trim(),
      hashPassword(password),
      role,
      role === 'counter_admin' ? counter_id : null,
      now
    );

    const created = db
      .prepare(`
        SELECT p.id, p.email, p.full_name, p.phone, p.role, p.counter_id, p.created_at, c.counter_name
        FROM profiles p LEFT JOIN counters c ON c.id = p.counter_id WHERE p.id = ?
      `)
      .get(id);
    res.status(201).json(created);
  });

  app.patch('/api/admin/users/:id', requireSuperAdmin, (req, res) => {
    const { role, counter_id, password } = req.body as {
      role?: 'user' | 'counter_admin' | 'super_admin';
      counter_id?: string | null;
      password?: string;
    };

    if (!role || !['user', 'counter_admin'].includes(role)) {
      res.status(400).json({ error: 'শুধুমাত্র যাত্রী অথবা কাউন্টার অপারেটর রোল নির্ধারণ করা যাবে' });
      return;
    }

    if (role === 'counter_admin' && !counter_id) {
      res.status(400).json({ error: 'কাউন্টার অপারেটরের জন্য কাউন্টার নির্ধারণ আবশ্যক' });
      return;
    }

    if (password && password.trim().length >= 4) {
      db.prepare('UPDATE profiles SET role = ?, counter_id = ?, password_hash = ? WHERE id = ? AND role != ?').run(
        role,
        role === 'counter_admin' ? counter_id : null,
        hashPassword(password.trim()),
        req.params.id,
        'super_admin'
      );
    } else {
      db.prepare('UPDATE profiles SET role = ?, counter_id = ? WHERE id = ? AND role != ?').run(
        role,
        role === 'counter_admin' ? counter_id : null,
        req.params.id,
        'super_admin'
      );
    }

    const updated = db
      .prepare(`
        SELECT p.id, p.email, p.full_name, p.phone, p.role, p.counter_id, p.created_at, c.counter_name
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
