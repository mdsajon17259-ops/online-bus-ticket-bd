import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bus, Check, Eye, RefreshCw, Search, X } from 'lucide-react';
import {
  fetchCounters,
  fetchOperatorBookings,
  fetchOperatorTrips,
  fetchTripSeats,
  updateBookingStatus,
} from '../lib/api';
import { useApp } from '../context/AppContext';
import type { Booking, BookingStatus, Counter, Seat, Trip } from '../types';
import { AuthScreen } from './AuthScreen';
import { SeatMap } from './SeatMap';
import { StatusBadge } from './StatusBadge';

export function CounterOperatorPanel() {
  const { user, authLoading } = useApp();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [selectedAdminCounter, setSelectedAdminCounter] = useState('');

  const [activeTab, setActiveTab] = useState<'bookings' | 'trips'>('bookings');
  const [statusFilter, setStatusFilter] = useState<'all' | BookingStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Seat inspection modal
  const [inspectTrip, setInspectTrip] = useState<Trip | null>(null);
  const [inspectSeats, setInspectSeats] = useState<Seat[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);

  const hasAccess = user && (user.role === 'counter_admin' || user.role === 'super_admin');

  const loadData = useCallback(async () => {
    if (!hasAccess) return;
    setLoading(true);
    setError('');
    try {
      const counterParam = user?.role === 'super_admin' ? selectedAdminCounter || undefined : undefined;
      const [bData, tData] = await Promise.all([
        fetchOperatorBookings(counterParam),
        fetchOperatorTrips(counterParam),
      ]);
      setBookings(bData);
      setTrips(tData);
      if (user?.role === 'super_admin') {
        const cData = await fetchCounters();
        setCounters(cData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load counter data');
    } finally {
      setLoading(false);
    }
  }, [hasAccess, user?.role, selectedAdminCounter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusChange = async (bookingId: string, nextStatus: BookingStatus) => {
    setActionId(bookingId);
    setError('');
    try {
      await updateBookingStatus(bookingId, nextStatus);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update booking');
    } finally {
      setActionId(null);
    }
  };

  const openSeatInspector = async (trip: Trip) => {
    setInspectTrip(trip);
    setLoadingSeats(true);
    try {
      const seats = await fetchTripSeats(trip.id);
      setInspectSeats(seats);
    } catch {
      setInspectSeats([]);
    } finally {
      setLoadingSeats(false);
    }
  };

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          b.id.toLowerCase().includes(q) ||
          b.passenger_name.toLowerCase().includes(q) ||
          b.phone.toLowerCase().includes(q) ||
          (b.trip ? `${b.trip.route_from} ${b.trip.route_to}`.toLowerCase().includes(q) : false);
        if (!match) return false;
      }
      return true;
    });
  }, [bookings, statusFilter, searchQuery]);

  const metrics = useMemo(() => {
    const pending = bookings.filter((b) => b.status === 'pending').length;
    const confirmed = bookings.filter((b) => b.status === 'confirmed').length;
    const revenue = bookings
      .filter((b) => b.status === 'confirmed')
      .reduce((acc, b) => acc + Number(b.total_fare), 0);
    return { pending, confirmed, revenue, tripsCount: trips.length };
  }, [bookings, trips]);

  if (authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="h-40 rounded-xl bg-white border border-slate-200 animate-pulse" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <AuthScreen
        requiredRole="counter_admin"
        redirectTo="operator"
        title="Counter Operator Sign In"
        subtitle="Sign in with a Counter Operator account to manage reservations and seat availability for your terminal."
      />
    );
  }

  const counterTitle =
    user.role === 'super_admin'
      ? selectedAdminCounter
        ? counters.find((c) => c.id === selectedAdminCounter)?.counter_name || 'Selected Counter'
        : 'All Counters (Admin View)'
      : user.counter_name || 'Assigned Counter';

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold text-blue-700">Counter Operator Dispatch</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5">
            {counterTitle}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Signed in as {user.email} · Access restricted to assigned counter trips and bookings
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {user.role === 'super_admin' && (
            <select
              aria-label="Filter by counter"
              value={selectedAdminCounter}
              onChange={(e) => setSelectedAdminCounter(e.target.value)}
              className="min-h-[40px] px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            >
              <option value="">All Counters</option>
              {counters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.counter_name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={loadData}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Pending Requests</p>
          <p className="font-mono text-2xl font-bold text-amber-700 tabular-nums mt-1">
            {metrics.pending}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Confirmed Bookings</p>
          <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums mt-1">
            {metrics.confirmed}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Confirmed Revenue</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
            ${metrics.revenue.toFixed(2)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Counter Trips</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {metrics.tripsCount}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Workspace Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('bookings')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'bookings' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Passenger Bookings ({bookings.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('trips')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'trips' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Counter Trips & Seats ({trips.length})
          </button>
        </div>

        {activeTab === 'bookings' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search passenger, phone, ID..."
                aria-label="Search bookings"
                className="min-h-[40px] pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 w-56"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['all', 'pending', 'confirmed', 'cancelled'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                    statusFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bookings View */}
      {activeTab === 'bookings' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-semibold text-slate-900">No bookings found</p>
              <p className="text-xs text-slate-500 mt-1">
                Passenger booking requests for your counter will appear here in real time.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4">Booking ID</th>
                    <th className="py-3 px-4">Passenger</th>
                    <th className="py-3 px-4">Route & Departure</th>
                    <th className="py-3 px-4">Seats</th>
                    <th className="py-3 px-4 text-right">Fare</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredBookings.map((b) => {
                    const isBusy = actionId === b.id;
                    const dep = b.trip ? new Date(b.trip.departure_time) : null;
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {b.id}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{b.passenger_name}</div>
                          <div className="text-xs font-mono text-slate-500 tabular-nums">
                            {b.phone}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {b.trip && (
                            <>
                              <div className="font-medium text-slate-900">
                                {b.trip.route_from} → {b.trip.route_to}
                              </div>
                              <div className="text-xs text-slate-500 tabular-nums">
                                {dep && !Number.isNaN(dep.getTime())
                                  ? `${dep.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${dep.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                  : b.trip.departure_time}
                                {' · '}
                                {b.boarding_point || 'Main Terminal'}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-800 tabular-nums">
                          {b.selected_seats.join(', ')}
                        </td>
                        <td className="py-3 px-4 font-mono text-sm font-semibold text-slate-900 text-right tabular-nums whitespace-nowrap">
                          ${Number(b.total_fare).toFixed(2)}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={b.status} />
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {b.status !== 'confirmed' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleStatusChange(b.id, 'confirmed')}
                                className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-md inline-flex items-center gap-1 transition-colors"
                              >
                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Confirm</span>
                              </button>
                            )}
                            {b.status !== 'cancelled' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleStatusChange(b.id, 'cancelled')}
                                className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:opacity-50 rounded-md inline-flex items-center gap-1 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Cancel</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Counter Trips & Live Seat Occupancy View */}
      {activeTab === 'trips' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {trips.map((t) => {
            const dep = new Date(t.departure_time);
            const avail = t.available_seats ?? t.total_seats;
            const booked = t.total_seats - avail;
            return (
              <div
                key={t.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">
                    {t.counter_name} · {t.bus_type}
                  </p>
                  <p className="font-display text-lg font-semibold text-slate-900">
                    {t.route_from} → {t.route_to}
                  </p>
                  <p className="text-xs font-mono text-slate-600 tabular-nums">
                    {dep.toLocaleDateString([], { month: 'short', day: 'numeric' })} at{' '}
                    {dep.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-xs text-slate-600 tabular-nums pt-1">
                    <strong>{booked}</strong> booked · <strong>{avail}</strong> available ({t.total_seats} total)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openSeatInspector(t)}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Eye className="w-4 h-4" aria-hidden="true" />
                  <span>Inspect Seats</span>
                </button>
              </div>
            );
          })}
          {trips.length === 0 && (
            <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-10 text-center">
              <Bus className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-900">No trips assigned to this counter</p>
            </div>
          )}
        </div>
      )}

      {/* Seat Inspector Modal */}
      {inspectTrip && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  {inspectTrip.route_from} → {inspectTrip.route_to}
                </h2>
                <p className="text-xs text-slate-500">Live Cabin Seat Status</p>
              </div>
              <button
                type="button"
                onClick={() => setInspectTrip(null)}
                aria-label="Close seat map"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              {loadingSeats ? (
                <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
              ) : (
                <SeatMap seats={inspectSeats} selectedSeats={[]} readOnly />
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
