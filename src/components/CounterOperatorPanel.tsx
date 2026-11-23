import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bus,
  Check,
  Clock,
  Edit3,
  FileText,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Ticket,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import {
  createCounterBooking,
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
import { TicketSlipModal } from './TicketSlipModal';

function toLocalDateTimeInput(isoStr: string): string {
  if (!isoStr) return '';
  return isoStr.slice(0, 16);
}

export function CounterOperatorPanel() {
  const { user, authLoading, settings } = useApp();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [selectedAdminCounter, setSelectedAdminCounter] = useState('');

  const [activeTab, setActiveTab] = useState<'bookings' | 'booking_form' | 'trips'>('bookings');
  const [statusFilter, setStatusFilter] = useState<'all' | BookingStatus>('all');
  const [tripFilterId, setTripFilterId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Ticket Slip Modal
  const [slipBooking, setSlipBooking] = useState<Booking | null>(null);

  // Tab 2: Counter Ticket Booking Form & Visual Seat Layout
  const [selectedTripId, setSelectedTripId] = useState('');
  const [selectedTripSeats, setSelectedTripSeats] = useState<Seat[]>([]);
  const [loadingFormSeats, setLoadingFormSeats] = useState(false);
  const [formSelectedSeats, setFormSelectedSeats] = useState<string[]>([]);
  const [formPassengerName, setFormPassengerName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formBoardingPoint, setFormBoardingPoint] = useState('');
  const [formFare, setFormFare] = useState('');
  const [submittingCounterBooking, setSubmittingCounterBooking] = useState(false);
  const [manualLockMode, setManualLockMode] = useState(false);
  const [togglingFormSeat, setTogglingFormSeat] = useState<string | null>(null);
  const [inspectedSeatNumber, setInspectedSeatNumber] = useState<string | null>(null);

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

  // Interactive Seat Manager Modal (from Trips tab)
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
    setTimeout(() => setNotice(''), 4500);
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
      setSelectedTripId((prev) => {
        if (prev && tData.some((t) => t.id === prev)) return prev;
        return tData[0]?.id || '';
      });
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

  const activeFormTrip = useMemo(
    () => trips.find((t) => t.id === selectedTripId) || null,
    [trips, selectedTripId]
  );

  const loadSeatsForSelectedTrip = useCallback(async (tripId: string) => {
    if (!tripId) {
      setSelectedTripSeats([]);
      return;
    }
    setLoadingFormSeats(true);
    try {
      const seats = await fetchTripSeats(tripId);
      setSelectedTripSeats(seats);
    } catch {
      setSelectedTripSeats([]);
    } finally {
      setLoadingFormSeats(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTripId) {
      loadSeatsForSelectedTrip(selectedTripId);
      setFormSelectedSeats([]);
      setInspectedSeatNumber(null);
    } else {
      setSelectedTripSeats([]);
    }
  }, [selectedTripId, loadSeatsForSelectedTrip]);

  // Keep default boarding point & fare synced with selected trip & seats
  useEffect(() => {
    if (activeFormTrip) {
      setFormBoardingPoint((prev) =>
        prev.trim() ? prev : `${activeFormTrip.counter_name || user?.counter_name || 'প্রধান কাউন্টার'}`
      );
      setFormFare(
        formSelectedSeats.length > 0
          ? String(activeFormTrip.price * formSelectedSeats.length)
          : String(activeFormTrip.price)
      );
    }
  }, [activeFormTrip, formSelectedSeats.length, user?.counter_name]);

  // Pending seats helper per trip
  const getPendingSeatsForTrip = useCallback(
    (tripId: string) => {
      const list: string[] = [];
      bookings.forEach((b) => {
        if (b.trip_id === tripId && b.status === 'pending') {
          list.push(...b.selected_seats);
        }
      });
      return list;
    },
    [bookings]
  );

  const selectedTripPendingSeats = useMemo(
    () => (activeFormTrip ? getPendingSeatsForTrip(activeFormTrip.id) : []),
    [activeFormTrip, getPendingSeatsForTrip]
  );

  const seatBookingLookup = useMemo(() => {
    const map = new Map<string, Booking>();
    if (!activeFormTrip) return map;
    bookings
      .filter((b) => b.trip_id === activeFormTrip.id && b.status !== 'cancelled')
      .forEach((b) => {
        b.selected_seats.forEach((sn) => {
          map.set(sn, b);
        });
      });
    return map;
  }, [bookings, activeFormTrip]);

  const inspectedBooking = useMemo(() => {
    if (!inspectedSeatNumber) return null;
    return seatBookingLookup.get(inspectedSeatNumber) || null;
  }, [inspectedSeatNumber, seatBookingLookup]);

  const handleStatusChange = async (bookingId: string, nextStatus: BookingStatus) => {
    setActionId(bookingId);
    setError('');
    try {
      await updateBookingStatus(bookingId, nextStatus);
      await loadData();
      if (selectedTripId) {
        await loadSeatsForSelectedTrip(selectedTripId);
      }
      if (slipBooking && slipBooking.id === bookingId) {
        setSlipBooking((prev) => (prev ? { ...prev, status: nextStatus } : null));
      }
      showNotice(
        nextStatus === 'confirmed'
          ? 'টিকিট যাচাই করে নিশ্চিত করা হয়েছে এবং সিট লক হয়েছে।'
          : 'বুকিং বাতিল করা হয়েছে এবং সিট পুনরায় খালি করা হয়েছে।'
      );
    } catch (err) {
      setError(extractErrorMessage(err, 'বুকিং স্ট্যাটাস পরিবর্তন করা যায়নি'));
    } finally {
      setActionId(null);
    }
  };

  const handleBookingMapSeatClick = async (seatNumber: string) => {
    if (!activeFormTrip) return;
    const seat = selectedTripSeats.find((s) => s.seat_number === seatNumber);
    if (!seat) return;

    if (manualLockMode) {
      if (togglingFormSeat) return;
      const nextStatus = seat.status === 'booked' ? 'available' : 'booked';
      setTogglingFormSeat(seatNumber);
      setError('');
      try {
        await toggleCounterSeat(activeFormTrip.id, seatNumber, nextStatus);
        await Promise.all([loadSeatsForSelectedTrip(activeFormTrip.id), loadData()]);
        showNotice(`আসন ${seatNumber} ${nextStatus === 'booked' ? 'লক' : 'খালি'} করা হয়েছে।`);
      } catch (err) {
        setError(extractErrorMessage(err, 'আসনের অবস্থা পরিবর্তন করা যায়নি'));
      } finally {
        setTogglingFormSeat(null);
      }
      return;
    }

    if (seat.status === 'booked') {
      setInspectedSeatNumber((prev) => (prev === seatNumber ? null : seatNumber));
      return;
    }

    setInspectedSeatNumber(null);
    setFormSelectedSeats((prev) =>
      prev.includes(seatNumber) ? prev.filter((s) => s !== seatNumber) : [...prev, seatNumber]
    );
  };

  const handleCounterTicketSubmit = async (submitStatus: 'confirmed' | 'pending') => {
    if (!activeFormTrip) {
      setError('অনুগ্রহ করে প্রথমে একটি ট্রিপ নির্বাচন করুন।');
      return;
    }
    if (formSelectedSeats.length === 0) {
      setError('অনুগ্রহ করে সিট ম্যাপ থেকে কমপক্ষে একটি খালি সিট নির্বাচন করুন।');
      return;
    }
    if (!formPassengerName.trim() || !formPhone.trim()) {
      setError('যাত্রীর নাম এবং মোবাইল নম্বর পূরণ করুন।');
      return;
    }

    const parsedFare = Number(formFare);
    const totalFare =
      Number.isFinite(parsedFare) && parsedFare > 0
        ? parsedFare
        : activeFormTrip.price * formSelectedSeats.length;

    setSubmittingCounterBooking(true);
    setError('');
    try {
      const created = await createCounterBooking({
        trip_id: activeFormTrip.id,
        passenger_name: formPassengerName.trim(),
        phone: formPhone.trim(),
        boarding_point:
          formBoardingPoint.trim() || activeFormTrip.counter_name || 'প্রধান কাউন্টার',
        selected_seats: formSelectedSeats,
        status: submitStatus,
        total_fare: totalFare,
      });

      setFormSelectedSeats([]);
      setFormPassengerName('');
      setFormPhone('');
      await Promise.all([loadData(), loadSeatsForSelectedTrip(activeFormTrip.id)]);
      setSlipBooking(created);
      showNotice(
        submitStatus === 'confirmed'
          ? 'কাউন্টার টিকিট নিশ্চিতভাবে কাটা হয়েছে ও স্লিপ প্রস্তুত।'
          : 'বুকিং অপেক্ষমাণ (Pending) হিসেবে সংরক্ষিত হয়েছে।'
      );
    } catch (err) {
      setError(extractErrorMessage(err, 'টিকিট কাটা সম্ভব হয়নি'));
    } finally {
      setSubmittingCounterBooking(false);
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
      if (tripFilterId && b.trip_id !== tripFilterId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          b.id.toLowerCase().includes(q) ||
          b.passenger_name.toLowerCase().includes(q) ||
          b.phone.toLowerCase().includes(q) ||
          b.selected_seats.join(' ').toLowerCase().includes(q) ||
          (b.trip ? `${b.trip.route_from} ${b.trip.route_to}`.toLowerCase().includes(q) : false);
        if (!match) return false;
      }
      return true;
    });
  }, [bookings, statusFilter, tripFilterId, searchQuery]);

  const metrics = useMemo(() => {
    const pendingList = bookings.filter((b) => b.status === 'pending');
    const confirmedList = bookings.filter((b) => b.status === 'confirmed');
    const pendingSeatsCount = pendingList.reduce((acc, b) => acc + b.selected_seats.length, 0);
    const confirmedSeatsCount = confirmedList.reduce((acc, b) => acc + b.selected_seats.length, 0);
    const revenue = confirmedList.reduce((acc, b) => acc + Number(b.total_fare), 0);
    const totalAvailableSeats = trips.reduce(
      (acc, t) => acc + Number(t.available_seats ?? t.total_seats),
      0
    );
    return {
      pending: pendingList.length,
      pendingSeatsCount,
      confirmed: confirmedList.length,
      confirmedSeatsCount,
      revenue,
      tripsCount: trips.length,
      totalAvailableSeats,
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
        requiredRole="counter_admin"
        redirectTo="operator"
        title="কাউন্টার অপারেটর লগইন"
        subtitle="আপনার নির্দিষ্ট বাস কাউন্টারের ট্রিপ, আসন, টিকিট কাটা ও বুকিং যাচাই পরিচালনা করতে কাউন্টার অ্যাকাউন্ট দিয়ে লগইন করুন।"
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

  const seatSummaryCounts = useMemo(() => {
    const total = selectedTripSeats.length;
    const pendingSet = new Set(selectedTripPendingSeats);
    const pendingCount = selectedTripSeats.filter(
      (s) => s.status === 'booked' && pendingSet.has(s.seat_number)
    ).length;
    const confirmedCount = selectedTripSeats.filter(
      (s) => s.status === 'booked' && !pendingSet.has(s.seat_number)
    ).length;
    const availableCount = total - pendingCount - confirmedCount;
    return { total, availableCount, pendingCount, confirmedCount };
  }, [selectedTripSeats, selectedTripPendingSeats]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
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
              : 'এই কাউন্টারের ট্রিপ, সিট ম্যাপ, সরাসরি টিকিট কাটা ও বুকিং যাচাই অনুমোদিত'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isMasterSuperAdmin && (
            <select
              aria-label="কাউন্টার অনুযায়ী ফিল্টার করুন"
              value={selectedAdminCounter}
              onChange={(e) => setSelectedAdminCounter(e.target.value)}
              className="min-h-[44px] px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
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
            onClick={() => {
              setActiveTab('booking_form');
            }}
            className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Ticket className="w-4 h-4" aria-hidden="true" />
            <span>টিকিট কাটুন</span>
          </button>
          <button
            type="button"
            onClick={loadData}
            className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>রিফ্রেশ</span>
          </button>
        </div>
      </div>

      {/* Live Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">বিক্রি হওয়া সিট (নিশ্চিত)</p>
          <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums mt-1">
            {formatBanglaNumber(metrics.confirmedSeatsCount)}টি
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {formatBanglaNumber(metrics.confirmed)}টি নিশ্চিত বুকিং
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">যাচাইয়ের অপেক্ষায়</p>
          <p className="font-mono text-2xl font-bold text-amber-700 tabular-nums mt-1">
            {formatBanglaNumber(metrics.pending)}টি
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {formatBanglaNumber(metrics.pendingSeatsCount)}টি আসন অপেক্ষমাণ
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">নিশ্চিতকৃত আয়</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {formatBDT(metrics.revenue)}
          </p>
          <p className="text-xs text-slate-500 mt-1">যাচাইকৃত টিকিট থেকে</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">কাউন্টার ট্রিপ ও খালি সিট</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {formatBanglaNumber(metrics.tripsCount)}টি
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {formatBanglaNumber(metrics.totalAvailableSeats)}টি আসন খালি আছে
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setActiveTab('bookings')}
            className={`min-h-[40px] px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
              activeTab === 'bookings' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            <span>যাত্রী বুকিং ও যাচাই ({formatBanglaNumber(bookings.length)})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('booking_form')}
            className={`min-h-[40px] px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
              activeTab === 'booking_form' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Ticket className="w-3.5 h-3.5" aria-hidden="true" />
            <span>টিকিট কাটুন ও সিট ম্যাপ</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('trips')}
            className={`min-h-[40px] px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
              activeTab === 'trips' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>ট্রিপ ও সময়সূচি ({formatBanglaNumber(trips.length)})</span>
          </button>
        </div>

        {activeTab === 'bookings' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="যাত্রী, মোবাইল, সিট বা আইডি..."
                aria-label="বুকিং খুঁজুন"
                className="min-h-[42px] pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 w-full sm:w-52"
              />
            </div>

            {trips.length > 0 && (
              <select
                aria-label="ট্রিপ অনুযায়ী ফিল্টার"
                value={tripFilterId}
                onChange={(e) => setTripFilterId(e.target.value)}
                className="min-h-[42px] px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 max-w-[200px]"
              >
                <option value="">সকল ট্রিপ</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.route_from} → {t.route_to} ({formatBanglaDateTime(t.departure_time).time})
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
              {(['all', 'pending', 'confirmed', 'cancelled'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    statusFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {filterLabels[st]}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'trips' && (
          <button
            type="button"
            onClick={() => setShowCreateTrip((prev) => !prev)}
            className="min-h-[42px] px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1.5 transition-colors w-fit"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>{showCreateTrip ? 'ফর্ম বন্ধ করুন' : 'নতুন ট্রিপ যোগ করুন'}</span>
          </button>
        )}
      </div>

      {/* TAB 1: Bookings Verification View */}
      {activeTab === 'bookings' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-900">কোনো বুকিং পাওয়া যায়নি</p>
              <p className="text-xs text-slate-500">
                যাত্রীরা বুকিং করলে অথবা আপনি নিজে কাউন্টার থেকে টিকিট কাটলে তা এখানে দেখা যাবে।
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('booking_form')}
                className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1.5"
              >
                <Ticket className="w-4 h-4" aria-hidden="true" />
                <span>কাউন্টার থেকে টিকিট কাটুন</span>
              </button>
            </div>
          ) : (
            <>
              {/* Mobile Cards (< md) */}
              <div className="md:hidden divide-y divide-slate-200">
                {filteredBookings.map((b) => {
                  const isBusy = actionId === b.id;
                  const dt = b.trip ? formatBanglaDateTime(b.trip.departure_time) : null;
                  return (
                    <div key={b.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                            {b.id}
                          </span>
                          <p className="font-semibold text-slate-900 text-sm mt-0.5 truncate">
                            {b.passenger_name}
                          </p>
                          <p className="text-xs font-mono text-slate-500 tabular-nums">{b.phone}</p>
                        </div>
                        <StatusBadge status={b.status} />
                      </div>

                      {b.trip && (
                        <div className="text-xs text-slate-600 space-y-0.5 bg-slate-50 rounded-lg p-2.5">
                          <p className="font-medium text-slate-900">
                            {b.trip.route_from} → {b.trip.route_to}
                          </p>
                          <p className="tabular-nums">
                            {dt ? `${dt.date} · ${dt.time}` : b.trip.departure_time} ·{' '}
                            {b.boarding_point || 'প্রধান কাউন্টার'}
                          </p>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs pt-1">
                        <div>
                          <span className="text-slate-500">সিট: </span>
                          <span className="font-mono font-bold text-slate-900 tabular-nums">
                            {b.selected_seats.join(', ')}
                          </span>
                        </div>
                        <span className="font-mono text-base font-bold text-blue-700 tabular-nums">
                          {formatBDT(b.total_fare)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {b.status !== 'confirmed' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleStatusChange(b.id, 'confirmed')}
                            className="flex-1 min-h-[44px] px-3 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg inline-flex items-center justify-center gap-1"
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
                            className="flex-1 min-h-[44px] px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:opacity-50 rounded-lg inline-flex items-center justify-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>বাতিল ও সিট ছাড়ুন</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSlipBooking(b)}
                          className="min-h-[44px] px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center justify-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>স্লিপ</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table (>= md) */}
              <div className="hidden md:block overflow-x-auto">
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
                              <button
                                type="button"
                                onClick={() => setSlipBooking(b)}
                                className="min-h-[36px] px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md inline-flex items-center gap-1 transition-colors"
                              >
                                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>স্লিপ</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: Seat Map & Counter Ticket Booking Form */}
      {activeTab === 'booking_form' && (
        <div className="space-y-5">
          {trips.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
              <Bus className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">
                টিকিট কাটার জন্য এখনো কোনো ট্রিপ নেই
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('trips');
                  setShowCreateTrip(true);
                }}
                className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>প্রথম ট্রিপ যোগ করুন</span>
              </button>
            </div>
          ) : (
            <>
              {/* Trip Selector & Live Seat Status Summary */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <label htmlFor="booking-form-trip" className="block text-xs font-semibold text-slate-700">
                    ট্রিপ ও সময়সূচি নির্বাচন করুন
                  </label>
                  <select
                    id="booking-form-trip"
                    value={selectedTripId}
                    onChange={(e) => setSelectedTripId(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  >
                    {trips.map((t) => {
                      const dt = formatBanglaDateTime(t.departure_time);
                      return (
                        <option key={t.id} value={t.id}>
                          {t.route_from} → {t.route_to} · {dt.date} {dt.time} · {formatBDT(t.price)} ({t.bus_type})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {activeFormTrip && (
                  <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
                    <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-slate-500">খালি সিট: </span>
                      <strong className="font-mono text-slate-900">
                        {formatBanglaNumber(seatSummaryCounts.availableCount)}
                      </strong>
                    </div>
                    <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
                      <span>অপেক্ষমাণ: </span>
                      <strong className="font-mono">
                        {formatBanglaNumber(seatSummaryCounts.pendingCount)}
                      </strong>
                    </div>
                    <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-900">
                      <span>কাটা / নিশ্চিত: </span>
                      <strong className="font-mono">
                        {formatBanglaNumber(seatSummaryCounts.confirmedCount)}
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left: Visual Seat Layout */}
                <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-display text-base font-bold text-slate-900">
                        ভিজ্যুয়াল সিট লেআউট ({formatBanglaNumber(seatSummaryCounts.total)} সিট)
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {manualLockMode
                          ? 'লক/আনলক মোড চালু: যেকোনো সিটে ট্যাপ করে খালি বা বুকড করুন'
                          : 'খালি সিটে ট্যাপ করে টিকিট সিলেক্ট করুন, অথবা বুকড/অপেক্ষমাণ সিটে ট্যাপ করে তথ্য দেখুন'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setManualLockMode((prev) => !prev);
                        setInspectedSeatNumber(null);
                      }}
                      className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border inline-flex items-center gap-1.5 transition-colors ${
                        manualLockMode
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {manualLockMode ? (
                        <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      <span>{manualLockMode ? 'সাধারণ বুকিং মোডে ফিরুন' : 'ম্যানুয়াল সিট লক/আনলক'}</span>
                    </button>
                  </div>

                  {loadingFormSeats ? (
                    <div className="h-80 bg-slate-100 rounded-xl animate-pulse" />
                  ) : (
                    <SeatMap
                      seats={selectedTripSeats}
                      selectedSeats={formSelectedSeats}
                      pendingSeats={selectedTripPendingSeats}
                      showPendingLegend
                      allowBookedClick
                      onToggleSeat={handleBookingMapSeatClick}
                    />
                  )}
                </div>

                {/* Right: Inspected Seat Booking Card + Ticket & Seat Booking Form */}
                <div className="lg:col-span-6 space-y-5">
                  {inspectedSeatNumber && (
                    <div className="bg-white border border-slate-300 rounded-xl p-4 sm:p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-slate-500">
                            সিট নম্বর <span className="font-mono text-slate-900">{inspectedSeatNumber}</span> এর তথ্য
                          </p>
                          {inspectedBooking ? (
                            <h3 className="font-display text-base font-bold text-slate-900 mt-0.5">
                              {inspectedBooking.passenger_name} ·{' '}
                              <span className="font-mono text-sm">{inspectedBooking.phone}</span>
                            </h3>
                          ) : (
                            <h3 className="font-display text-base font-bold text-slate-900 mt-0.5">
                              ম্যানুয়ালি লক করা সিট
                            </h3>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setInspectedSeatNumber(null)}
                          aria-label="বন্ধ করুন"
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {inspectedBooking ? (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 rounded-lg p-3">
                            <div>
                              <p className="text-slate-500">
                                আইডি: <strong className="font-mono text-slate-900">{inspectedBooking.id}</strong>
                              </p>
                              <p className="text-slate-600 mt-0.5">
                                সিট: <strong className="font-mono">{inspectedBooking.selected_seats.join(', ')}</strong> · ভাড়া:{' '}
                                <strong className="font-mono text-blue-700">{formatBDT(inspectedBooking.total_fare)}</strong>
                              </p>
                            </div>
                            <StatusBadge status={inspectedBooking.status} />
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {inspectedBooking.status !== 'confirmed' && (
                              <button
                                type="button"
                                disabled={actionId === inspectedBooking.id}
                                onClick={() => handleStatusChange(inspectedBooking.id, 'confirmed')}
                                className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5"
                              >
                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>যাচাই ও নিশ্চিত করুন</span>
                              </button>
                            )}
                            {inspectedBooking.status !== 'cancelled' && (
                              <button
                                type="button"
                                disabled={actionId === inspectedBooking.id}
                                onClick={() => handleStatusChange(inspectedBooking.id, 'cancelled')}
                                className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5"
                              >
                                <X className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>বাতিল ও সিট ছাড়ুন</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSlipBooking(inspectedBooking)}
                              className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 ml-auto"
                            >
                              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>টিকিট স্লিপ</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3 pt-1">
                          <p className="text-xs text-slate-600">
                            এই সিটের বিপরীতে কোনো অনলাইন/যাত্রী বুকিং রেকর্ড নেই।
                          </p>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!activeFormTrip) return;
                              setError('');
                              try {
                                await toggleCounterSeat(activeFormTrip.id, inspectedSeatNumber, 'available');
                                await Promise.all([loadSeatsForSelectedTrip(activeFormTrip.id), loadData()]);
                                setInspectedSeatNumber(null);
                                showNotice(`আসন ${inspectedSeatNumber} পুনরায় খালি করা হয়েছে।`);
                              } catch (err) {
                                setError(extractErrorMessage(err, 'আসন খালি করা যায়নি'));
                              }
                            }}
                            className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg shrink-0"
                          >
                            সিট খালি করুন
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ticket & Seat Booking Form */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                    <div className="border-b border-slate-100 pb-3">
                      <h2 className="font-display text-base font-bold text-slate-900">
                        টিকিট ও সিট বুকিং ফর্ম
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        বাম পাশের ম্যাপ থেকে খালি সিট নির্বাচন করে যাত্রীর তথ্য দিন এবং সরাসরি টিকিট কাটুন।
                      </p>
                    </div>

                    {activeFormTrip && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <div>
                          <span className="text-slate-500">যাত্রার তারিখ ও সময়:</span>
                          <p className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                            {formatBanglaDateTime(activeFormTrip.departure_time).date} ·{' '}
                            {formatBanglaDateTime(activeFormTrip.departure_time).time}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-500">প্রতি সিট ভাড়া:</span>
                          <p className="font-mono font-semibold text-blue-700 tabular-nums mt-0.5">
                            {formatBDT(activeFormTrip.price)}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3.5">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-slate-700">
                            নির্বাচিত সিট নম্বর *
                          </label>
                          {formSelectedSeats.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setFormSelectedSeats([])}
                              className="text-[11px] font-medium text-rose-600 hover:underline"
                            >
                              সব মুছুন
                            </button>
                          )}
                        </div>
                        <div className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 flex flex-wrap items-center gap-1.5">
                          {formSelectedSeats.length === 0 ? (
                            <span className="text-xs text-slate-400">
                              সিট ম্যাপ থেকে খালি সিটে ট্যাপ করুন
                            </span>
                          ) : (
                            formSelectedSeats.map((sn) => (
                              <button
                                key={sn}
                                type="button"
                                onClick={() =>
                                  setFormSelectedSeats((prev) => prev.filter((item) => item !== sn))
                                }
                                className="px-2.5 py-1 rounded bg-blue-700 text-white font-mono text-xs font-semibold inline-flex items-center gap-1"
                              >
                                <span>{sn}</span>
                                <X className="w-3 h-3" aria-hidden="true" />
                              </button>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="cf-name" className="block text-xs font-medium text-slate-700 mb-1">
                            যাত্রীর নাম *
                          </label>
                          <input
                            id="cf-name"
                            type="text"
                            required
                            value={formPassengerName}
                            onChange={(e) => setFormPassengerName(e.target.value)}
                            placeholder="যেমন: মো. করিম উদ্দিন"
                            className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                          />
                        </div>
                        <div>
                          <label htmlFor="cf-phone" className="block text-xs font-medium text-slate-700 mb-1">
                            মোবাইল নম্বর *
                          </label>
                          <input
                            id="cf-phone"
                            type="tel"
                            required
                            value={formPhone}
                            onChange={(e) => setFormPhone(e.target.value)}
                            placeholder="017XXXXXXXX"
                            className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 tabular-nums"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="cf-boarding" className="block text-xs font-medium text-slate-700 mb-1">
                            বোর্ডিং পয়েন্ট / কাউন্টার
                          </label>
                          <input
                            id="cf-boarding"
                            type="text"
                            value={formBoardingPoint}
                            onChange={(e) => setFormBoardingPoint(e.target.value)}
                            placeholder="প্রধান কাউন্টার"
                            className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                          />
                        </div>
                        <div>
                          <label htmlFor="cf-fare" className="block text-xs font-medium text-slate-700 mb-1">
                            মোট ভাড়া (৳ টাকা)
                          </label>
                          <input
                            id="cf-fare"
                            type="number"
                            min="1"
                            required
                            value={formFare}
                            onChange={(e) => setFormFare(e.target.value)}
                            className="w-full min-h-[44px] px-3 py-2 text-sm font-mono font-semibold text-blue-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 tabular-nums"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                        <button
                          type="button"
                          disabled={submittingCounterBooking || formSelectedSeats.length === 0}
                          onClick={() => handleCounterTicketSubmit('confirmed')}
                          className="min-h-[46px] px-4 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-500 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Check className="w-4 h-4" aria-hidden="true" />
                          <span>
                            {submittingCounterBooking ? 'প্রক্রিয়াকরণ হচ্ছে...' : 'নিশ্চিত করে টিকিট কাটুন'}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={submittingCounterBooking || formSelectedSeats.length === 0}
                          onClick={() => handleCounterTicketSubmit('pending')}
                          className="min-h-[46px] px-4 py-2.5 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Clock className="w-4 h-4" aria-hidden="true" />
                          <span>অপেক্ষমাণ (Pending) রাখুন</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: Counter Trips & Schedule Management View */}
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
              const pendingOnTrip = getPendingSeatsForTrip(t.id).length;
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
                        <strong>{formatBanglaNumber(booked)}টি</strong> বুকড
                        {pendingOnTrip > 0
                          ? ` (${formatBanglaNumber(pendingOnTrip)}টি অপেক্ষমাণ)`
                          : ''}{' '}
                        · <strong>{formatBanglaNumber(avail)}টি</strong> খালি (মোট{' '}
                        {formatBanglaNumber(t.total_seats)}টি)
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTripId(t.id);
                        setActiveTab('booking_form');
                      }}
                      className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1.5"
                    >
                      <Ticket className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>টিকিট ও আসন ম্যাপ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openSeatManager(t)}
                      className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5"
                    >
                      <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>দ্রুত লক/আনলক</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditTrip(t)}
                      className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg inline-flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>সম্পাদনা</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTrip(t.id)}
                      className="min-h-[42px] px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg inline-flex items-center gap-1.5 ml-auto"
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

      {/* Interactive Seat Manager Modal (Quick Lock/Unlock) */}
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
                  pendingSeats={getPendingSeatsForTrip(inspectTrip.id)}
                  showPendingLegend
                  allowBookedClick
                  onToggleSeat={handleToggleSeatStatus}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Printable & Actionable Ticket Summary / Slip Modal */}
      {slipBooking && (
        <TicketSlipModal
          booking={slipBooking}
          organizationName={settings.organization_name}
          onClose={() => setSlipBooking(null)}
          busy={actionId === slipBooking.id}
          onConfirm={
            slipBooking.status !== 'confirmed'
              ? () => handleStatusChange(slipBooking.id, 'confirmed')
              : undefined
          }
          onCancelRelease={
            slipBooking.status !== 'cancelled'
              ? () => handleStatusChange(slipBooking.id, 'cancelled')
              : undefined
          }
        />
      )}
    </main>
  );
}
