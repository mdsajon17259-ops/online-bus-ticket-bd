import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'aurora-transit-local-session-secret-key';

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
    bus_type TEXT NOT NULL DEFAULT 'AC Express Coach',
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
    passenger_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    boarding_point TEXT NOT NULL DEFAULT '',
    selected_seats TEXT NOT NULL,
    total_fare REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    created_at TEXT NOT NULL
  );
`);

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
  if (existing) return;

  const now = new Date().toISOString();
  const seed = db.transaction(() => {
    db.prepare(
      'INSERT INTO app_settings (id, organization_name, organization_logo_url, updated_at) VALUES (1, ?, ?, ?)'
    ).run('Aurora Transit Network', '/src/assets/images/default_org_logo_1794840144839.jpg', now);

    const c1 = 'c-aurora-central';
    const c2 = 'c-pacific-express';
    const c3 = 'c-sierra-coach';

    const insertCounter = db.prepare(
      'INSERT INTO counters (id, counter_name, phone, address, logo_url, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insertCounter.run(
      c1,
      'Aurora Central Terminal',
      '+1 (415) 890-2100',
      '720 Market Transit Plaza, Bay 1-4, San Francisco',
      '/src/assets/images/counter_emblem_one_1794840145454.jpg',
      now
    );
    insertCounter.run(
      c2,
      'Pacific Express Counter',
      '+1 (415) 890-4420',
      '210 Embarcadero Coach Hub, Gate B, San Francisco',
      '/src/assets/images/default_org_logo_1794840144839.jpg',
      now
    );
    insertCounter.run(
      c3,
      'Sierra Coach Lines',
      '+1 (916) 704-1180',
      '405 Capitol Station Concourse, Sacramento',
      '/src/assets/images/counter_emblem_one_1794840145454.jpg',
      now
    );

    const insertProfile = db.prepare(
      'INSERT INTO profiles (id, email, full_name, password_hash, role, counter_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    insertProfile.run(
      'u-super-admin',
      'admin@auroratransit.com',
      'Maya Lin (Master Admin)',
      hashPassword('Admin123!'),
      'super_admin',
      null,
      now
    );
    insertProfile.run(
      'u-op-central',
      'central@auroratransit.com',
      'Daniel Brooks',
      hashPassword('Operator123!'),
      'counter_admin',
      c1,
      now
    );
    insertProfile.run(
      'u-op-pacific',
      'pacific@auroratransit.com',
      'Nadia Patel',
      hashPassword('Operator123!'),
      'counter_admin',
      c2,
      now
    );
    insertProfile.run(
      'u-op-sierra',
      'sierra@auroratransit.com',
      'Carlos Rivera',
      hashPassword('Operator123!'),
      'counter_admin',
      c3,
      now
    );
    insertProfile.run(
      'u-passenger',
      'passenger@auroratransit.com',
      'Elena Vance',
      hashPassword('User123!'),
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
      { id: 't-sf-la-1', counter: c1, from: 'San Francisco', to: 'Los Angeles', dt: formatDateOffset(0, '08:30'), type: 'AC Business Sleeper', price: 54, seats: 36 },
      { id: 't-sf-la-2', counter: c2, from: 'San Francisco', to: 'Los Angeles', dt: formatDateOffset(0, '11:15'), type: 'Executive Double-Decker', price: 62, seats: 36 },
      { id: 't-sf-la-3', counter: c1, from: 'San Francisco', to: 'Los Angeles', dt: formatDateOffset(0, '21:00'), type: 'Night Luxury Coach', price: 68, seats: 32 },
      { id: 't-sf-sac-1', counter: c3, from: 'San Francisco', to: 'Sacramento', dt: formatDateOffset(0, '09:45'), type: 'AC Express Shuttle', price: 28, seats: 36 },
      { id: 't-la-sd-1', counter: c2, from: 'Los Angeles', to: 'San Diego', dt: formatDateOffset(0, '14:00'), type: 'Coastal Panorama AC', price: 32, seats: 36 },
      { id: 't-sf-la-tom', counter: c1, from: 'San Francisco', to: 'Los Angeles', dt: formatDateOffset(1, '09:00'), type: 'AC Business Sleeper', price: 54, seats: 36 },
      { id: 't-sf-sac-tom', counter: c3, from: 'San Francisco', to: 'Sacramento', dt: formatDateOffset(1, '13:30'), type: 'AC Express Shuttle', price: 29, seats: 36 },
      { id: 't-sac-tahoe', counter: c3, from: 'Sacramento', to: 'Lake Tahoe', dt: formatDateOffset(2, '07:45'), type: 'Mountain Alpine Coach', price: 38, seats: 32 },
    ];

    for (const t of seededTrips) {
      insertTrip.run(t.id, t.counter, t.from, t.to, t.dt, t.type, t.price, t.seats, now);
      generateSeatsForTrip(t.id, t.seats);
    }

    // Reserve realistic seats and seed sample bookings
    const markBooked = db.prepare('UPDATE seats SET status = ? WHERE trip_id = ? AND seat_number = ?');
    const insertBooking = db.prepare(
      'INSERT INTO bookings (id, trip_id, passenger_name, phone, boarding_point, selected_seats, total_fare, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    const b1Seats = ['A1', 'B1'];
    for (const s of b1Seats) markBooked.run('booked', 't-sf-la-1', s);
    insertBooking.run('BK-10421', 't-sf-la-1', 'Jordan Vance', '4155550192', 'Market Transit Plaza Bay 2', JSON.stringify(b1Seats), 108, 'confirmed', now);

    const b2Seats = ['C3', 'D3'];
    for (const s of b2Seats) markBooked.run('booked', 't-sf-la-1', s);
    insertBooking.run('BK-10422', 't-sf-la-1', 'Priya Nair', '4155550144', 'Market Transit Plaza Bay 2', JSON.stringify(b2Seats), 108, 'pending', now);

    const b3Seats = ['A2', 'B2', 'C2'];
    for (const s of b3Seats) markBooked.run('booked', 't-sf-la-2', s);
    insertBooking.run('BK-10423', 't-sf-la-2', 'Marcus Chen', '6505550188', 'Embarcadero Gate B', JSON.stringify(b3Seats), 186, 'pending', now);

    const b4Seats = ['D1'];
    for (const s of b4Seats) markBooked.run('booked', 't-sf-sac-1', s);
    insertBooking.run('BK-10424', 't-sf-sac-1', 'Sophia Alvarez', '9165550137', 'Market Transit Plaza Bay 4', JSON.stringify(b4Seats), 28, 'confirmed', now);
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
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user.role !== 'super_admin') {
    res.status(403).json({ error: 'Forbidden: Super Admin access required' });
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

  app.post('/api/bookings', (req, res) => {
    const { trip_id, passenger_name, phone, boarding_point, selected_seats } = req.body as {
      trip_id?: string;
      passenger_name?: string;
      phone?: string;
      boarding_point?: string;
      selected_seats?: string[];
    };

    if (!trip_id || !passenger_name?.trim() || !phone?.trim() || !Array.isArray(selected_seats) || selected_seats.length === 0) {
      res.status(400).json({ error: 'Trip, passenger name, phone, and at least one seat are required' });
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
          'INSERT INTO bookings (id, trip_id, passenger_name, phone, boarding_point, selected_seats, total_fare, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          bookingId,
          trip_id,
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

  // ===========================================================================
  // AUTHENTICATION ENDPOINTS
  // ===========================================================================

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const row = db
      .prepare(`
        SELECT p.*, c.counter_name
        FROM profiles p
        LEFT JOIN counters c ON c.id = p.counter_id
        WHERE LOWER(p.email) = LOWER(?)
      `)
      .get(email.trim()) as (AuthUser & { password_hash: string; full_name: string; counter_name: string | null }) | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password' });
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
        role: row.role,
        counter_id: row.counter_id,
        counter_name: row.counter_name,
      },
    });
  });

  app.post('/api/auth/register', (req, res) => {
    const { email, password, full_name } = req.body as { email?: string; password?: string; full_name?: string };
    if (!email?.trim() || !password || password.length < 6) {
      res.status(400).json({ error: 'Valid email and password (min 6 characters) are required' });
      return;
    }

    const existing = db.prepare('SELECT id FROM profiles WHERE LOWER(email) = LOWER(?)').get(email.trim());
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO profiles (id, email, full_name, password_hash, role, counter_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, email.trim().toLowerCase(), (full_name || '').trim(), hashPassword(password), 'user', null, now);

    const authUser: AuthUser = {
      id,
      email: email.trim().toLowerCase(),
      role: 'user',
      counter_id: null,
    };

    res.status(201).json({
      token: signToken(authUser),
      user: {
        ...authUser,
        full_name: (full_name || '').trim(),
        counter_name: null,
      },
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const row = db
      .prepare(`
        SELECT p.id, p.email, p.full_name, p.role, p.counter_id, p.created_at, c.counter_name
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
    const targetCounterId =
      req.user!.role === 'super_admin' && typeof req.query.counter_id === 'string' && req.query.counter_id
        ? req.query.counter_id
        : req.user!.counter_id;

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
    const targetCounterId =
      req.user!.role === 'super_admin'
        ? (typeof req.query.counter_id === 'string' && req.query.counter_id ? req.query.counter_id : null)
        : req.user!.counter_id;

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

    const id = `c-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO counters (id, counter_name, phone, address, logo_url, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, counter_name.trim(), phone.trim(), address.trim(), (logo_url || '').trim(), now);

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
    db.prepare('DELETE FROM counters WHERE id = ?').run(req.params.id);
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
        SELECT p.id, p.email, p.full_name, p.role, p.counter_id, p.created_at, c.counter_name
        FROM profiles p
        LEFT JOIN counters c ON c.id = p.counter_id
        ORDER BY p.created_at DESC
      `)
      .all();
    res.json(users);
  });

  app.post('/api/admin/users', requireSuperAdmin, (req, res) => {
    const { email, full_name, password, role, counter_id } = req.body as {
      email?: string;
      full_name?: string;
      password?: string;
      role?: 'user' | 'counter_admin' | 'super_admin';
      counter_id?: string | null;
    };

    if (!email?.trim() || !password || password.length < 6 || !role) {
      res.status(400).json({ error: 'Email, password (min 6 chars), and role are required' });
      return;
    }

    if (role === 'counter_admin' && !counter_id) {
      res.status(400).json({ error: 'Counter Operator accounts must be assigned to a counter' });
      return;
    }

    const existing = db.prepare('SELECT id FROM profiles WHERE LOWER(email) = LOWER(?)').get(email.trim());
    if (existing) {
      res.status(409).json({ error: 'Email already exists' });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO profiles (id, email, full_name, password_hash, role, counter_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      email.trim().toLowerCase(),
      (full_name || '').trim(),
      hashPassword(password),
      role,
      role === 'counter_admin' ? counter_id : null,
      now
    );

    const created = db
      .prepare(`
        SELECT p.id, p.email, p.full_name, p.role, p.counter_id, p.created_at, c.counter_name
        FROM profiles p LEFT JOIN counters c ON c.id = p.counter_id WHERE p.id = ?
      `)
      .get(id);
    res.status(201).json(created);
  });

  app.patch('/api/admin/users/:id', requireSuperAdmin, (req, res) => {
    const { role, counter_id } = req.body as {
      role?: 'user' | 'counter_admin' | 'super_admin';
      counter_id?: string | null;
    };

    if (!role || !['user', 'counter_admin', 'super_admin'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    if (role === 'counter_admin' && !counter_id) {
      res.status(400).json({ error: 'Counter Operator role requires a counter assignment' });
      return;
    }

    db.prepare('UPDATE profiles SET role = ?, counter_id = ? WHERE id = ?').run(
      role,
      role === 'counter_admin' ? counter_id : null,
      req.params.id
    );

    const updated = db
      .prepare(`
        SELECT p.id, p.email, p.full_name, p.role, p.counter_id, p.created_at, c.counter_name
        FROM profiles p LEFT JOIN counters c ON c.id = p.counter_id WHERE p.id = ?
      `)
      .get(req.params.id);

    res.json(updated);
  });

  app.delete('/api/admin/users/:id', requireSuperAdmin, (req: AuthedRequest, res) => {
    if (req.user!.id === req.params.id) {
      res.status(400).json({ error: 'You cannot delete your own active Super Admin account' });
      return;
    }
    db.prepare('DELETE FROM profiles WHERE id = ?').run(req.params.id);
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
