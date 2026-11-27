export type UserRole =
  | 'user'
  | 'counter_admin'
  | 'counter_representative'
  | 'super_admin';

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';

export type SeatStatus = 'available' | 'booked';

export interface AppSettings {
  id: number;
  organization_name: string;
  organization_logo_url: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
  role: UserRole;
  counter_id: string | null;
  counter_name?: string | null;
  token_version?: number;
  created_at?: string;
}

export interface Counter {
  id: string;
  counter_name: string;
  phone: string;
  address: string;
  logo_url: string;
  operator_username?: string | null;
  operator_user_id?: string | null;
  representative_username?: string | null;
  representative_user_id?: string | null;
  created_at?: string;
}

export interface PasswordResetLog {
  id: string;
  counter_id: string | null;
  counter_name: string;
  target_role: 'counter_admin' | 'counter_representative';
  target_username: string;
  reset_by: string;
  created_at: string;
}

export interface Trip {
  id: string;
  counter_id: string;
  route_from: string;
  route_to: string;
  departure_time: string;
  bus_type: string;
  price: number;
  total_seats: number;
  counter?: Counter;
  counter_name?: string;
  counter_logo_url?: string;
  available_seats?: number;
}

export interface Seat {
  id: string;
  trip_id: string;
  seat_number: string;
  status: SeatStatus;
}

export interface Booking {
  id: string;
  trip_id: string;
  user_id?: string | null;
  passenger_name: string;
  phone: string;
  boarding_point: string;
  selected_seats: string[];
  total_fare: number;
  payment_method?: string | null;
  trx_id?: string | null;
  status: BookingStatus;
  created_at: string;
  trip?: {
    route_from: string;
    route_to: string;
    departure_time: string;
    bus_type: string;
    price: number;
    total_seats?: number;
    counter_id: string;
    counter_name: string;
    counter_phone?: string;
  };
}

export interface AdminOverview {
  totalBookings: number;
  pendingBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  confirmedRevenue: number;
  pendingRevenue: number;
  activeTrips: number;
  totalCounters: number;
  counterStats: Array<{
    counter_id: string;
    counter_name: string;
    trips_count: number;
    bookings_count: number;
    revenue: number;
  }>;
}
