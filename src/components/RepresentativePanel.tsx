import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bus, Eye, Lock, RefreshCw, Search, Ticket, X } from 'lucide-react';
import {
  extractErrorMessage,
  fetchOperatorBookings,
  fetchOperatorTrips,
  fetchTripSeats,
  isMasterSuperAdminProfile,
} from '../lib/api';
import { formatBanglaDateTime, formatBanglaNumber, formatBDT } from '../lib/format';
import { useApp } from '../context/AppContext';
import type { Booking, BookingStatus, Seat, Trip } from '../types';
import { AuthScreen } from './AuthScreen';
import { SeatMap } from './SeatMap';
import { StatusBadge } from './StatusBadge';

export function RepresentativePanel() {
  const { user, authLoading } = useApp();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);

  const [activeTab, setActiveTab] = useState<'bookings' | 'trips'>('bookings');
  const [statusFilter, setStatusFilter] = useState<'all' | BookingStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [inspectTrip, setInspectTrip] = useState<Trip | null>(null);
  const [inspectSeats, setInspectSeats] = useState<Seat[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);

  const isMasterSuperAdmin = isMasterSuperAdminProfile(user);
  const hasAccess = Boolean(
    user &&
      ((user.role === 'counter_representative' && user.counter_id) || isMasterSuperAdmin)
  );

  const loadData = useCallback(async () => {
    if (!hasAccess || !user) return;
    setLoading(true);
    setError('');
    try {
      const counterParam = isMasterSuperAdmin ? undefined : user.counter_id || undefined;
      const [bData, tData] = await Promise.all([
        fetchOperatorBookings(counterParam),
        fetchOperatorTrips(counterParam),
      ]);
      setBookings(bData);
      setTrips(tData);
    } catch (err) {
      setError(extractErrorMessage(err, 'কাউন্টারের রিপোর্ট লোড করা যায়নি'));
    } finally {
      setLoading(false);
    }
  }, [hasAccess, user, isMasterSuperAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openReadOnlySeatModal = async (trip: Trip) => {
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
    const confirmedList = bookings.filter((b) => b.status === 'confirmed');
    const pendingList = bookings.filter((b) => b.status === 'pending');
    const soldTicketsCount = confirmedList.reduce(
      (sum, b) => sum + b.selected_seats.length,
      0
    );
    const pendingSeatsCount = pendingList.reduce(
      (sum, b) => sum + b.selected_seats.length,
      0
    );
    const confirmedRevenue = confirmedList.reduce(
      (sum, b) => sum + Number(b.total_fare),
      0
    );
    const totalTripSeats = trips.reduce((sum, t) => sum + Number(t.total_seats), 0);
    const totalAvailableSeats = trips.reduce(
      (sum, t) => sum + Number(t.available_seats ?? t.total_seats),
      0
    );

    return {
      soldTicketsCount,
      confirmedBookings: confirmedList.length,
      pendingBookings: pendingList.length,
      pendingSeatsCount,
      confirmedRevenue,
      tripsCount: trips.length,
      bookedSeatsTotal: Math.max(0, totalTripSeats - totalAvailableSeats),
    };
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
        requiredRole="counter_representative"
        redirectTo="representative"
        title="কাউন্টার প্রতিনিধি লগইন"
        subtitle="আপনার নির্ধারিত কাউন্টারের টিকেট বিক্রি ও বুকিং রিপোর্ট দেখতে প্রতিনিধি ইউজারনেম ও পাসওয়ার্ড দিয়ে লগইন করুন।"
      />
    );
  }

  const filterLabels: Record<'all' | BookingStatus, string> = {
    all: 'সবগুলো',
    confirmed: 'নিশ্চিত',
    pending: 'অপেক্ষমাণ',
    cancelled: 'বাতিল',
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>কাউন্টার প্রতিনিধি প্যানেল (শুধুমাত্র দেখার অনুমতি / Read-Only)</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-2">
            {user?.counter_name || 'নির্ধারিত কাউন্টার'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            প্রতিনিধি ইউজারনেম: <strong className="font-mono text-slate-700">{user?.email}</strong> · এই প্যানেল থেকে শুধুমাত্র নির্ধারিত কাউন্টারের টিকেট বিক্রির হিসাব ও বুকিং রিপোর্ট দেখা যাবে। কোনো তথ্য পরিবর্তন অনুমোদিত নয়।
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>রিফ্রেশ</span>
        </button>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">মোট বিক্রি হওয়া টিকেট</p>
          <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums mt-1">
            {formatBanglaNumber(metrics.soldTicketsCount)}টি
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {formatBanglaNumber(metrics.confirmedBookings)}টি নিশ্চিত বুকিং
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">অপেক্ষমাণ টিকেট</p>
          <p className="font-mono text-2xl font-bold text-amber-700 tabular-nums mt-1">
            {formatBanglaNumber(metrics.pendingSeatsCount)}টি
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {formatBanglaNumber(metrics.pendingBookings)}টি অপেক্ষমাণ অনুরোধ
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">নিশ্চিতকৃত বিক্রি (আয়)</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {formatBDT(metrics.confirmedRevenue)}
          </p>
          <p className="text-xs text-slate-500 mt-1">শুধুমাত্র নিশ্চিত টিকেট</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">সক্রিয় ট্রিপ ও আসন</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {formatBanglaNumber(metrics.tripsCount)}টি
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            মোট {formatBanglaNumber(metrics.bookedSeatsTotal)}টি আসন সংরক্ষিত
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('bookings')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
              activeTab === 'bookings' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Ticket className="w-3.5 h-3.5" aria-hidden="true" />
            <span>টিকেট বিক্রি ও বুকিং রিপোর্ট ({formatBanglaNumber(bookings.length)})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('trips')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
              activeTab === 'trips' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>ট্রিপ ও আসন বিবরণী ({formatBanglaNumber(trips.length)})</span>
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
                placeholder="যাত্রী, মোবাইল বা আইডি খুঁজুন..."
                aria-label="বুকিং খুঁজুন"
                className="min-h-[40px] pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 w-56"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['all', 'confirmed', 'pending', 'cancelled'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    statusFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {filterLabels[st]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Read-only Bookings Report Table */}
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
              <p className="text-sm font-semibold text-slate-900">কোনো বুকিং রিপোর্ট পাওয়া যায়নি</p>
              <p className="text-xs text-slate-500 mt-1">
                এই কাউন্টারের অধীনে কোনো টিকেট বুকিং হলে তা এখানে প্রদর্শিত হবে।
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4">বুকিং আইডি</th>
                    <th className="py-3 px-4">যাত্রীর তথ্য</th>
                    <th className="py-3 px-4">রুট ও সময়</th>
                    <th className="py-3 px-4">আসন ও সংখ্যা</th>
                    <th className="py-3 px-4 text-right">মোট ভাড়া</th>
                    <th className="py-3 px-4">অবস্থা</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredBookings.map((b) => {
                    const dt = b.trip ? formatBanglaDateTime(b.trip.departure_time) : null;
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
                                {dt ? `${dt.date} · ${dt.time}` : b.trip.departure_time}
                                {' · '}
                                {b.boarding_point || 'প্রধান কাউন্টার'}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                            {b.selected_seats.join(', ')}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {formatBanglaNumber(b.selected_seats.length)}টি টিকেট
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-sm font-semibold text-slate-900 text-right tabular-nums whitespace-nowrap">
                          {formatBDT(b.total_fare)}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={b.status} />
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

      {/* Read-only Trips View */}
      {activeTab === 'trips' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {trips.map((t) => {
            const dt = formatBanglaDateTime(t.departure_time);
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
                    {dt.date} · {dt.time} · ভাড়া: {formatBDT(t.price)}
                  </p>
                  <p className="text-xs text-slate-600 tabular-nums pt-1">
                    <strong>{formatBanglaNumber(booked)}টি</strong> বুকড ·{' '}
                    <strong>{formatBanglaNumber(avail)}টি</strong> খালি (মোট{' '}
                    {formatBanglaNumber(t.total_seats)}টি)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openReadOnlySeatModal(t)}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Eye className="w-4 h-4" aria-hidden="true" />
                  <span>আসন দেখুন</span>
                </button>
              </div>
            );
          })}
          {trips.length === 0 && (
            <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-10 text-center">
              <Bus className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-900">
                এই কাউন্টারে কোনো ট্রিপ নির্ধারিত নেই
              </p>
            </div>
          )}
        </div>
      )}

      {/* Strictly Read-Only Seat Inspector Modal */}
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
                <p className="text-xs text-slate-500">লাইভ আসন অবস্থা (শুধুমাত্র দেখার জন্য)</p>
              </div>
              <button
                type="button"
                onClick={() => setInspectTrip(null)}
                aria-label="বন্ধ করুন"
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
