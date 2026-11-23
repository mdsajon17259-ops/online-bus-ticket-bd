import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bus, Check, Edit3, Plus, RefreshCw, Search, Settings2, Trash2, X } from 'lucide-react';
import {
  createCounterTrip,
  deleteCounterTrip,
  extractErrorMessage,
  fetchCounters,
  fetchOperatorBookings,
  fetchOperatorTrips,
  fetchTripSeats,
  isMasterSuperAdminProfile,
  toggleCounterSeat,
  updateBookingStatus,
  updateCounterTrip,
} from '../lib/api';
import {
  BANGLADESH_DISTRICTS,
  formatBanglaDateTime,
  formatBanglaNumber,
  formatBDT,
} from '../lib/format';
import { useApp } from '../context/AppContext';
import type { Booking, BookingStatus, Counter, Seat, Trip } from '../types';
import { AuthScreen } from './AuthScreen';
import { SeatMap } from './SeatMap';
import { StatusBadge } from './StatusBadge';

function toLocalDateTimeInput(isoStr: string): string {
  if (!isoStr) return '';
  return isoStr.slice(0, 16);
}

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
  const [notice, setNotice] = useState('');

  // Create Trip Form (strictly scoped to current counter)
  const [showCreateTrip, setShowCreateTrip] = useState(false);
  const [newFrom, setNewFrom] = useState('');
  const [newTo, setNewTo] = useState('');
  const [newDeparture, setNewDeparture] = useState('');
  const [newBusType, setNewBusType] = useState('এসি বিজনেস ক্লাস কোচ');
  const [newPrice, setNewPrice] = useState('1200');
  const [newSeats, setNewSeats] = useState('36');
  const [savingTrip, setSavingTrip] = useState(false);

  // Edit Trip Modal
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [editFrom, setEditFrom] = useState('');
  const [editTo, setEditTo] = useState('');
  const [editDeparture, setEditDeparture] = useState('');
  const [editBusType, setEditBusType] = useState('');
  const [editPrice, setEditPrice] = useState('');

  // Interactive Seat Manager Modal
  const [inspectTrip, setInspectTrip] = useState<Trip | null>(null);
  const [inspectSeats, setInspectSeats] = useState<Seat[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [togglingSeat, setTogglingSeat] = useState<string | null>(null);

  const isMasterSuperAdmin = isMasterSuperAdminProfile(user);
  const hasAccess = Boolean(
    user && ((user.role === 'counter_admin' && user.counter_id) || isMasterSuperAdmin)
  );

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const loadData = useCallback(async () => {
    if (!hasAccess || !user) return;
    setLoading(true);
    setError('');
    try {
      const counterParam = isMasterSuperAdmin
        ? selectedAdminCounter || undefined
        : user.counter_id || undefined;
      const [bData, tData] = await Promise.all([
        fetchOperatorBookings(counterParam),
        fetchOperatorTrips(counterParam),
      ]);
      setBookings(bData);
      setTrips(tData);
      if (isMasterSuperAdmin) {
        const cData = await fetchCounters();
        setCounters(cData);
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'কাউন্টারের তথ্য লোড করা যায়নি'));
    } finally {
      setLoading(false);
    }
  }, [hasAccess, user, isMasterSuperAdmin, selectedAdminCounter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusChange = async (bookingId: string, nextStatus: BookingStatus) => {
    setActionId(bookingId);
    setError('');
    try {
      await updateBookingStatus(bookingId, nextStatus);
      await loadData();
      showNotice('বুকিংয়ের অবস্থা আপডেট করা হয়েছে।');
    } catch (err) {
      setError(extractErrorMessage(err, 'বুকিং স্ট্যাটাস পরিবর্তন করা যায়নি'));
    } finally {
      setActionId(null);
    }
  };

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCounter = isMasterSuperAdmin
      ? selectedAdminCounter || counters[0]?.id
      : user?.counter_id || undefined;
    if (!targetCounter) {
      setError('ট্রিপ যোগ করার জন্য একটি কাউন্টার নির্বাচন করুন');
      return;
    }

    setSavingTrip(true);
    setError('');
    try {
      await createCounterTrip({
        counter_id: targetCounter,
        route_from: newFrom,
        route_to: newTo,
        departure_time: newDeparture,
        bus_type: newBusType,
        price: Number(newPrice),
        total_seats: Number(newSeats),
      });
      setNewFrom('');
      setNewTo('');
      setNewDeparture('');
      setShowCreateTrip(false);
      await loadData();
      showNotice('নতুন ট্রিপ সফলভাবে যোগ করা হয়েছে।');
    } catch (err) {
      setError(extractErrorMessage(err, 'ট্রিপ যোগ করা যায়নি'));
    } finally {
      setSavingTrip(false);
    }
  };

  const openEditTrip = (trip: Trip) => {
    setEditingTrip(trip);
    setEditFrom(trip.route_from);
    setEditTo(trip.route_to);
    setEditDeparture(toLocalDateTimeInput(trip.departure_time));
    setEditBusType(trip.bus_type);
    setEditPrice(String(trip.price));
  };

  const handleSaveTripEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrip) return;
    setSavingTrip(true);
    setError('');
    try {
      await updateCounterTrip(editingTrip.id, {
        route_from: editFrom,
        route_to: editTo,
        departure_time: editDeparture,
        bus_type: editBusType,
        price: Number(editPrice),
      });
      setEditingTrip(null);
      await loadData();
      showNotice('ট্রিপের তথ্য ও ভাড়া আপডেট করা হয়েছে।');
    } catch (err) {
      setError(extractErrorMessage(err, 'ট্রিপ আপডেট করা যায়নি'));
    } finally {
      setSavingTrip(false);
    }
  };

  const handleDeleteTrip = async (tripId: string) => {
    setError('');
    try {
      await deleteCounterTrip(tripId);
      await loadData();
      showNotice('ট্রিপটি মুছে ফেলা হয়েছে।');
    } catch (err) {
      setError(extractErrorMessage(err, 'ট্রিপ মুছে ফেলা যায়নি'));
    }
  };

  const openSeatManager = async (trip: Trip) => {
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

  const handleToggleSeatStatus = async (seatNumber: string) => {
    if (!inspectTrip || togglingSeat) return;
    const seat = inspectSeats.find((s) => s.seat_number === seatNumber);
    if (!seat) return;
    const nextStatus = seat.status === 'booked' ? 'available' : 'booked';
    setTogglingSeat(seatNumber);
    setError('');
    try {
      await toggleCounterSeat(inspectTrip.id, seatNumber, nextStatus);
      const updatedSeats = await fetchTripSeats(inspectTrip.id);
      setInspectSeats(updatedSeats);
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err, 'আসনের অবস্থা পরিবর্তন করা যায়নি'));
    } finally {
      setTogglingSeat(null);
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
        title="কাউন্টার অপারেটর লগইন"
        subtitle="আপনার নির্দিষ্ট বাস কাউন্টারের ট্রিপ, আসন ও বুকিং পরিচালনা করতে কাউন্টার অ্যাকাউন্ট দিয়ে লগইন করুন।"
      />
    );
  }

  const counterTitle = isMasterSuperAdmin
    ? selectedAdminCounter
      ? counters.find((c) => c.id === selectedAdminCounter)?.counter_name || 'নির্বাচিত কাউন্টার'
      : 'সকল কাউন্টার (অ্যাডমিন ভিউ)'
    : user?.counter_name || 'নির্ধারিত কাউন্টার';

  const filterLabels: Record<'all' | BookingStatus, string> = {
    all: 'সবগুলো',
    pending: 'অপেক্ষমাণ',
    confirmed: 'নিশ্চিত',
    cancelled: 'বাতিল',
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <datalist id="counter-bd-districts">
        {BANGLADESH_DISTRICTS.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>

      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold text-blue-700">
            {isMasterSuperAdmin ? 'কাউন্টার পরিচালনা (সুপার অ্যাডমিন)' : 'কাউন্টার কন্ট্রোল প্যানেল (পূর্ণ কাউন্টার ক্ষমতা)'}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5">
            {counterTitle}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            ইউজারনেম: <strong className="font-mono text-slate-700">{user?.email}</strong> ·{' '}
            {isMasterSuperAdmin
              ? 'সব কাউন্টার পর্যবেক্ষণ ও সম্পাদনা অনুমোদিত'
              : 'শুধুমাত্র এই কাউন্টারের ট্রিপ, ভাড়া, আসন ও বুকিং যোগ/সম্পাদনা ও পরিচালনা অনুমোদিত'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isMasterSuperAdmin && (
            <select
              aria-label="কাউন্টার অনুযায়ী ফিল্টার করুন"
              value={selectedAdminCounter}
              onChange={(e) => setSelectedAdminCounter(e.target.value)}
              className="min-h-[40px] px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            >
              <option value="">সকল কাউন্টার</option>
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
            <span>রিফ্রেশ</span>
          </button>
        </div>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">অপেক্ষমাণ অনুরোধ</p>
          <p className="font-mono text-2xl font-bold text-amber-700 tabular-nums mt-1">
            {formatBanglaNumber(metrics.pending)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">নিশ্চিত বুকিং</p>
          <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums mt-1">
            {formatBanglaNumber(metrics.confirmed)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">নিশ্চিতকৃত আয়</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {formatBDT(metrics.revenue)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">কাউন্টার ট্রিপ</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {formatBanglaNumber(metrics.tripsCount)}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
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
            যাত্রী বুকিং ({formatBanglaNumber(bookings.length)})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('trips')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'trips' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ট্রিপ ও আসন ব্যবস্থাপনা ({formatBanglaNumber(trips.length)})
          </button>
        </div>

        {activeTab === 'bookings' ? (
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
              {(['all', 'pending', 'confirmed', 'cancelled'] as const).map((st) => (
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
        ) : (
          <button
            type="button"
            onClick={() => setShowCreateTrip((prev) => !prev)}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1.5 transition-colors w-fit"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>{showCreateTrip ? 'ফর্ম বন্ধ করুন' : 'নতুন ট্রিপ যোগ করুন'}</span>
          </button>
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
              <p className="text-sm font-semibold text-slate-900">কোনো বুকিং পাওয়া যায়নি</p>
              <p className="text-xs text-slate-500 mt-1">
                যাত্রীরা আপনার কাউন্টারের বাসে বুকিং করলে তা এখানে তাৎক্ষণিক প্রদর্শিত হবে।
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
                    <th className="py-3 px-4">আসন</th>
                    <th className="py-3 px-4 text-right">মোট ভাড়া</th>
                    <th className="py-3 px-4">অবস্থা</th>
                    <th className="py-3 px-4 text-right">পদক্ষেপ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredBookings.map((b) => {
                    const isBusy = actionId === b.id;
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
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-800 tabular-nums">
                          {b.selected_seats.join(', ')}
                        </td>
                        <td className="py-3 px-4 font-mono text-sm font-semibold text-slate-900 text-right tabular-nums whitespace-nowrap">
                          {formatBDT(b.total_fare)}
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
                                <span>নিশ্চিত করুন</span>
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
                                <span>বাতিল</span>
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

      {/* Counter Trips & Interactive Seat Management View */}
      {activeTab === 'trips' && (
        <div className="space-y-6">
          {showCreateTrip && (
            <form
              onSubmit={handleCreateTrip}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
            >
              <h2 className="font-display text-base font-bold text-slate-900">
                কাউন্টারে নতুন ট্রিপ যুক্ত করুন
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  list="counter-bd-districts"
                  value={newFrom}
                  onChange={(e) => setNewFrom(e.target.value)}
                  placeholder="যাত্রা শুরু (যেমন: ঢাকা)"
                  className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
                <input
                  type="text"
                  required
                  list="counter-bd-districts"
                  value={newTo}
                  onChange={(e) => setNewTo(e.target.value)}
                  placeholder="গন্তব্য (যেমন: চট্টগ্রাম)"
                  className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
                <input
                  type="datetime-local"
                  required
                  value={newDeparture}
                  onChange={(e) => setNewDeparture(e.target.value)}
                  className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 tabular-nums"
                />
                <input
                  type="text"
                  required
                  value={newBusType}
                  onChange={(e) => setNewBusType(e.target.value)}
                  placeholder="বাসের ধরন"
                  className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
                <input
                  type="number"
                  min="50"
                  step="10"
                  required
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="টিকেট ভাড়া (৳)"
                  className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 tabular-nums"
                />
                <input
                  type="number"
                  min="8"
                  max="60"
                  step="4"
                  required
                  value={newSeats}
                  onChange={(e) => setNewSeats(e.target.value)}
                  placeholder="মোট আসন (৮–৬০)"
                  className="min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 tabular-nums"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTrip(false)}
                  className="min-h-[40px] px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={savingTrip}
                  className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg"
                >
                  {savingTrip ? 'সংরক্ষণ হচ্ছে...' : 'ট্রিপ সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {trips.map((t) => {
              const dt = formatBanglaDateTime(t.departure_time);
              const avail = t.available_seats ?? t.total_seats;
              const booked = t.total_seats - avail;
              return (
                <div
                  key={t.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500">
                        {t.counter_name} · {t.bus_type}
                      </p>
                      <p className="font-display text-lg font-semibold text-slate-900">
                        {t.route_from} → {t.route_to}
                      </p>
                      <p className="text-xs font-mono text-slate-600 tabular-nums">
                        {dt.date} · {dt.time}
                      </p>
                      <p className="text-xs font-semibold text-blue-700 tabular-nums">
                        ভাড়া: {formatBDT(t.price)}
                      </p>
                      <p className="text-xs text-slate-600 tabular-nums pt-1">
                        <strong>{formatBanglaNumber(booked)}টি</strong> বুকড ·{' '}
                        <strong>{formatBanglaNumber(avail)}টি</strong> খালি (মোট{' '}
                        {formatBanglaNumber(t.total_seats)}টি)
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => openSeatManager(t)}
                      className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5"
                    >
                      <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>আসন পরিচালনা</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditTrip(t)}
                      className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg inline-flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>ট্রিপ সম্পাদনা</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTrip(t.id)}
                      className="min-h-[40px] px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg inline-flex items-center gap-1.5 ml-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>মুছুন</span>
                    </button>
                  </div>
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
        </div>
      )}

      {/* Edit Trip Modal */}
      {editingTrip && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveTripEdit}
            className="bg-white rounded-2xl border border-slate-200 w-full max-w-md p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-900">
                কাউন্টার ট্রিপ সম্পাদনা করুন
              </h2>
              <button
                type="button"
                onClick={() => setEditingTrip(null)}
                aria-label="বন্ধ করুন"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">যাত্রা শুরু</label>
                  <input
                    type="text"
                    required
                    list="counter-bd-districts"
                    value={editFrom}
                    onChange={(e) => setEditFrom(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">গন্তব্য</label>
                  <input
                    type="text"
                    required
                    list="counter-bd-districts"
                    value={editTo}
                    onChange={(e) => setEditTo(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">যাত্রার সময়</label>
                <input
                  type="datetime-local"
                  required
                  value={editDeparture}
                  onChange={(e) => setEditDeparture(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">বাসের ধরন</label>
                <input
                  type="text"
                  required
                  value={editBusType}
                  onChange={(e) => setEditBusType(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">টিকেট ভাড়া (৳)</label>
                <input
                  type="number"
                  min="50"
                  step="10"
                  required
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 tabular-nums"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTrip(null)}
                className="min-h-[42px] px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                বাতিল
              </button>
              <button
                type="submit"
                disabled={savingTrip}
                className="min-h-[42px] px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg"
              >
                {savingTrip ? 'আপডেট হচ্ছে...' : 'পরিবর্তন সংরক্ষণ'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Interactive Seat Manager Modal */}
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
                <p className="text-xs text-slate-500">
                  আসন পরিবর্তন করতে যেকোনো আসনে ক্লিক করুন (খালি ↔ বুকড)
                </p>
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
                <SeatMap
                  seats={inspectSeats}
                  selectedSeats={[]}
                  allowBookedClick
                  onToggleSeat={handleToggleSeatStatus}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
