import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bus,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  MapPin,
  Phone,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Ticket,
  TrainFront,
  User,
  X,
} from 'lucide-react';
import {
  createBooking,
  extractErrorMessage,
  fetchCounters,
  fetchTripSeats,
  fetchTrips,
  lookupBookings,
} from '../lib/api';
import {
  BANGLADESH_DISTRICTS,
  formatBanglaDateTime,
  formatBanglaNumber,
  formatBDT,
} from '../lib/format';
import {
  downloadTicketPng,
  getTicketPaymentMeta,
  saveTicketPaymentMeta,
  type TicketPaymentMeta,
} from '../lib/ticketDownload';
import { useApp } from '../context/AppContext';
import type { Booking, Counter, Seat, Trip } from '../types';
import { SeatMap } from './SeatMap';
import { StatusBadge } from './StatusBadge';
import { TicketSlipModal } from './TicketSlipModal';

const PAYMENT_METHODS = [
  { id: 'বিকাশ (bKash)', label: 'বিকাশ (bKash)', short: 'bKash' },
  { id: 'নগদ (Nagad)', label: 'নগদ (Nagad)', short: 'Nagad' },
] as const;

const CUSTOM_BRAND_LOGO = '/src/assets/images/desh_travels_logo_1795618756599.jpg';

function parseCombinedRouteQuery(raw: string): { from?: string; to?: string; text: string } {
  const cleaned = raw.trim();
  if (!cleaned) return { text: '' };
  const match = cleaned.match(/^(.+?)\s+(?:টু|থেকে|to|->|→|-)\s+(.+)$/i);
  if (match) {
    return {
      from: match[1].trim(),
      to: match[2].trim(),
      text: cleaned,
    };
  }
  return { text: cleaned };
}

export function PassengerPortal({ mode }: { mode: 'book' | 'lookup' }) {
  const { settings, setActivePanel, passengerView, setPassengerView } = useApp();
  const [homeLogoError, setHomeLogoError] = useState(false);

  // Search filters (Bus View)
  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');
  const [travelDate, setTravelDate] = useState('');
  const [placeQuery, setPlaceQuery] = useState('');
  const [selectedCounterId, setSelectedCounterId] = useState('');

  // Data state
  const [counters, setCounters] = useState<Counter[]>([]);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [tripsError, setTripsError] = useState('');

  // Train iframe state
  const [trainIframeKey, setTrainIframeKey] = useState(0);

  // Seat selection & booking modal state
  const [modalCounter, setModalCounter] = useState<Counter | null>(null);
  const [modalTrips, setModalTrips] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [tripSeats, setTripSeats] = useState<Seat[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);

  // Direct Passenger Info + Payment (No Login Required)
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [boardingPoint, setBoardingPoint] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('বিকাশ (bKash)');
  const [paymentRef, setPaymentRef] = useState('');
  const [copiedPaymentNum, setCopiedPaymentNum] = useState(false);

  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [confirmedReceipt, setConfirmedReceipt] = useState<Booking | null>(null);
  const [confirmedPaymentMeta, setConfirmedPaymentMeta] = useState<TicketPaymentMeta | null>(null);

  // Booking lookup state
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResults, setLookupResults] = useState<Booking[] | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [slipBooking, setSlipBooking] = useState<Booking | null>(null);

  const loadTrips = useCallback(
    async (opts?: { from?: string; to?: string; date?: string; counter_id?: string }) => {
      setLoadingTrips(true);
      setTripsError('');
      try {
        const data = await fetchTrips({
          from: opts?.from ?? fromCity,
          to: opts?.to ?? toCity,
          date: opts?.date ?? travelDate,
          counter_id: opts?.counter_id ?? selectedCounterId,
        });
        setTrips(data);
      } catch (err) {
        setTripsError(extractErrorMessage(err, 'বাসের সময়সূচি লোড করা যায়নি'));
      } finally {
        setLoadingTrips(false);
      }
    },
    [fromCity, toCity, travelDate, selectedCounterId]
  );

  const loadInitialBusData = useCallback(async () => {
    setLoadingTrips(true);
    setTripsError('');
    try {
      const [cData, tData] = await Promise.all([fetchCounters(), fetchTrips()]);
      setCounters(cData);
      setAllTrips(tData);
      setTrips(tData);
    } catch (err) {
      setTripsError(extractErrorMessage(err, 'কাউন্টার ও বাসের তথ্য লোড করা যায়নি'));
    } finally {
      setLoadingTrips(false);
    }
  }, []);

  useEffect(() => {
    loadInitialBusData();
  }, [loadInitialBusData]);

  const parsedPlace = useMemo(() => parseCombinedRouteQuery(placeQuery), [placeQuery]);
  const effectiveFrom = (fromCity.trim() || parsedPlace.from || '').trim();
  const effectiveTo = (toCity.trim() || parsedPlace.to || '').trim();

  const displayedTrips = useMemo(() => {
    const q = parsedPlace.text.toLowerCase();
    return trips.filter((t) => {
      if (effectiveFrom && !t.route_from.toLowerCase().includes(effectiveFrom.toLowerCase())) {
        return false;
      }
      if (effectiveTo && !t.route_to.toLowerCase().includes(effectiveTo.toLowerCase())) {
        return false;
      }
      if (travelDate && !t.departure_time.startsWith(travelDate)) {
        return false;
      }
      if (selectedCounterId && t.counter_id !== selectedCounterId) {
        return false;
      }
      if (q && !parsedPlace.from && !parsedPlace.to) {
        const hay = `${t.counter_name || ''} ${t.route_from} ${t.route_to} ${t.bus_type}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [trips, effectiveFrom, effectiveTo, travelDate, selectedCounterId, parsedPlace]);

  // Keep all Admin-added counters in exact serial order (০১, ০২, ০৩...)
  const serialCounters = useMemo(() => {
    const hasRouteOrPlaceFilter = Boolean(
      effectiveFrom || effectiveTo || travelDate || parsedPlace.text
    );
    const matchingCounterIds = new Set(displayedTrips.map((t) => t.counter_id));

    return counters
      .map((counter, idx) => {
        const counterAllTrips = allTrips.filter((t) => t.counter_id === counter.id);
        const counterMatchingTrips = displayedTrips.filter((t) => t.counter_id === counter.id);
        return {
          counter,
          serial: idx + 1,
          counterAllTrips,
          counterMatchingTrips,
        };
      })
      .filter(({ counter }) => {
        if (!hasRouteOrPlaceFilter) return true;
        if (matchingCounterIds.has(counter.id)) return true;
        if (parsedPlace.text && !parsedPlace.from && !parsedPlace.to) {
          const q = parsedPlace.text.toLowerCase();
          return (
            counter.counter_name.toLowerCase().includes(q) ||
            counter.address.toLowerCase().includes(q)
          );
        }
        return false;
      });
  }, [counters, allTrips, displayedTrips, effectiveFrom, effectiveTo, travelDate, parsedPlace]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadTrips({
      from: effectiveFrom,
      to: effectiveTo,
      date: travelDate,
      counter_id: selectedCounterId,
    });
  };

  const handleClearFilters = () => {
    setFromCity('');
    setToCity('');
    setTravelDate('');
    setPlaceQuery('');
    setSelectedCounterId('');
    loadTrips({ from: '', to: '', date: '', counter_id: '' });
  };

  const loadSeatsForModalTrip = async (trip: Trip) => {
    setActiveTrip(trip);
    setSelectedSeats([]);
    setBookingError('');
    setBoardingPoint(
      counters.find((c) => c.id === trip.counter_id)?.address ||
        `${trip.route_from} কেন্দ্রীয় কাউন্টার`
    );
    setLoadingSeats(true);
    try {
      const seats = await fetchTripSeats(trip.id);
      setTripSeats(seats);
    } catch (err) {
      setBookingError(extractErrorMessage(err, 'আসনের তালিকা লোড করা যায়নি'));
    } finally {
      setLoadingSeats(false);
    }
  };

  const openSeatSelection = async (trip: Trip, counterObj?: Counter | null, siblingTrips?: Trip[]) => {
    const cObj = counterObj || counters.find((c) => c.id === trip.counter_id) || null;
    setModalCounter(cObj);
    setModalTrips(
      siblingTrips && siblingTrips.length > 0
        ? siblingTrips
        : allTrips.filter((t) => t.counter_id === trip.counter_id)
    );
    setBookingModalOpen(true);
    setConfirmedReceipt(null);
    setConfirmedPaymentMeta(null);
    setPaymentRef('');
    await loadSeatsForModalTrip(trip);
  };

  const openCounterBooking = async (counter: Counter, matchingTrips: Trip[], fallbackTrips: Trip[]) => {
    const candidateTrips = matchingTrips.length > 0 ? matchingTrips : fallbackTrips;
    setModalCounter(counter);
    setModalTrips(candidateTrips);
    setBookingModalOpen(true);
    setConfirmedReceipt(null);
    setConfirmedPaymentMeta(null);
    setBookingError('');
    setSelectedSeats([]);
    setPaymentRef('');

    if (candidateTrips.length > 0) {
      await loadSeatsForModalTrip(candidateTrips[0]);
    } else {
      setActiveTrip(null);
      setTripSeats([]);
      setLoadingSeats(false);
    }
  };

  const closeBookingModal = () => {
    setBookingModalOpen(false);
    setActiveTrip(null);
    setModalCounter(null);
    setModalTrips([]);
    setConfirmedReceipt(null);
    setBookingError('');
  };

  const toggleSeat = (seatNumber: string) => {
    setSelectedSeats((prev) =>
      prev.includes(seatNumber)
        ? prev.filter((s) => s !== seatNumber)
        : prev.length >= 6
          ? prev
          : [...prev, seatNumber]
    );
  };

  const totalFare = useMemo(() => {
    if (!activeTrip) return 0;
    return activeTrip.price * selectedSeats.length;
  }, [activeTrip, selectedSeats]);

  const counterPaymentNumber = useMemo(() => {
    const raw = modalCounter?.phone?.trim() || '';
    return raw || '01711-004422';
  }, [modalCounter]);

  const handleCopyPaymentNumber = async () => {
    const cleanNum = counterPaymentNumber.replace(/[^0-9+]/g, '') || counterPaymentNumber;
    try {
      await navigator.clipboard.writeText(cleanNum);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = cleanNum;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(textarea);
      }
    }
    setCopiedPaymentNum(true);
    setTimeout(() => setCopiedPaymentNum(false), 2200);
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip) return;
    if (selectedSeats.length === 0) {
      setBookingError('অনুগ্রহ করে কমপক্ষে একটি খালি আসন নির্বাচন করুন।');
      return;
    }
    const finalName = passengerName.trim();
    const cleanedDigits = passengerPhone.replace(/[\s\-()]/g, '').replace(/^\+?88/, '');
    if (!finalName) {
      setBookingError('অনুগ্রহ করে যাত্রীর নাম লিখুন।');
      return;
    }
    if (!/^01[3-9]\d{8}$/.test(cleanedDigits)) {
      setBookingError('অনুগ্রহ করে সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।');
      return;
    }
    const finalTrxId = paymentRef.trim();
    if (!finalTrxId || finalTrxId.length < 4) {
      setBookingError('অনুগ্রহ করে পেমেন্ট ট্রানজেকশন আইডি (TrxID) লিখুন।');
      return;
    }

    setSubmittingBooking(true);
    setBookingError('');
    try {
      const rawBooking = await createBooking({
        trip_id: activeTrip.id,
        passenger_name: finalName,
        phone: cleanedDigits,
        boarding_point: boardingPoint.trim() || modalCounter?.address || 'প্রধান কাউন্টার',
        selected_seats: selectedSeats,
        payment_method: paymentMethod,
        trx_id: finalTrxId,
      });

      const booking: Booking = {
        ...rawBooking,
        payment_method: rawBooking.payment_method || paymentMethod,
        trx_id: rawBooking.trx_id || finalTrxId,
        trip: rawBooking.trip || {
          route_from: activeTrip.route_from,
          route_to: activeTrip.route_to,
          departure_time: activeTrip.departure_time,
          bus_type: activeTrip.bus_type,
          price: activeTrip.price,
          counter_id: activeTrip.counter_id,
          counter_name: activeTrip.counter_name || modalCounter?.counter_name || 'কাউন্টার',
        },
      };

      const payMeta: TicketPaymentMeta = {
        method: paymentMethod,
        reference: finalTrxId,
      };
      saveTicketPaymentMeta(booking.id, payMeta);
      setConfirmedPaymentMeta(payMeta);
      setConfirmedReceipt(booking);
      setSelectedSeats([]);

      try {
        downloadTicketPng(booking, settings.organization_name, payMeta);
      } catch {
        // Manual download button remains immediately available on screen
      }

      const [freshSeats, freshAllTrips] = await Promise.all([
        fetchTripSeats(activeTrip.id),
        fetchTrips(),
      ]);
      setTripSeats(freshSeats);
      setAllTrips(freshAllTrips);
      await loadTrips();
    } catch (err) {
      setBookingError(extractErrorMessage(err, 'বুকিং অনুরোধ পাঠানো যায়নি'));
    } finally {
      setSubmittingBooking(false);
    }
  };

  const handleLookupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupQuery.trim()) return;
    setLookupLoading(true);
    setLookupError('');
    try {
      const data = await lookupBookings(lookupQuery.trim());
      setLookupResults(data);
    } catch (err) {
      setLookupError(extractErrorMessage(err, 'টিকেট খোঁজা সম্ভব হয়নি'));
    } finally {
      setLookupLoading(false);
    }
  };

  const renderBookingCard = (b: Booking) => {
    const dt = b.trip ? formatBanglaDateTime(b.trip.departure_time) : { time: '', date: '' };
    const localPayMeta = getTicketPaymentMeta(b.id);
    const resolvedMethod = b.payment_method?.trim() || localPayMeta?.method || '';
    const resolvedTrxId = b.trx_id?.trim() || localPayMeta?.reference || '';
    const effectivePayMeta = resolvedMethod
      ? { method: resolvedMethod, reference: resolvedTrxId || undefined }
      : null;

    return (
      <div
        key={b.id}
        className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
              {b.id}
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <StatusBadge status={b.status} />
          </div>
          {b.trip && (
            <p className="font-display text-lg font-semibold text-slate-900">
              {b.trip.route_from} থেকে {b.trip.route_to}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600">
            <span>{b.passenger_name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{b.phone}</span>
            {b.trip && (
              <>
                <span aria-hidden="true">·</span>
                <span>{b.trip.counter_name}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{dt.date} · {dt.time}</span>
              </>
            )}
          </div>
          <p className="text-xs text-slate-500">
            বোর্ডিং পয়েন্ট: {b.boarding_point || 'প্রধান কাউন্টার'}
            {effectivePayMeta
              ? ` · পেমেন্ট: ${effectivePayMeta.method}${
                  effectivePayMeta.reference ? ` (TrxID: ${effectivePayMeta.reference})` : ''
                }`
              : ''}
          </p>
        </div>

        <div className="sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 shrink-0 space-y-2">
          <div>
            <p className="text-xs text-slate-500">আসন নম্বর</p>
            <p className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
              {b.selected_seats.join(', ')}
            </p>
            <p className="font-mono text-lg font-bold text-slate-900 tabular-nums mt-0.5">
              {formatBDT(b.total_fare)}
            </p>
          </div>
          <div className="flex flex-wrap sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => downloadTicketPng(b, settings.organization_name, effectivePayMeta)}
              className="min-h-[42px] px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>টিকিট ডাউনলোড করুন</span>
            </button>
            <button
              type="button"
              onClick={() => setSlipBooking(b)}
              className="min-h-[42px] px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>টিকিট স্লিপ</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (mode === 'lookup') {
    return (
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900 tracking-tight">
            টিকেট ও বুকিং স্ট্যাটাস যাচাই
          </h1>
          <p className="mt-2 text-sm text-slate-600 max-w-xl">
            আপনার মোবাইল নম্বর অথবা বুকিং রেফারেন্স কোড দিয়ে কাউন্টার অপারেটরের অনুমোদন, আসনের অবস্থা ও অনলাইন টিকিট ডাউনলোড করুন।
          </p>
        </div>

        <form
          onSubmit={handleLookupSubmit}
          className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row gap-3"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              placeholder="মোবাইল নম্বর (যেমন: 01819334455) বা বুকিং আইডি (যেমন: BK-10421)"
              aria-label="মোবাইল নম্বর বা বুকিং আইডি"
              className="w-full min-h-[44px] pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 focus:bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={lookupLoading}
            className="min-h-[44px] px-6 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {lookupLoading ? 'খোঁজা হচ্ছে...' : 'টিকেট খুঁজুন'}
          </button>
        </form>

        {lookupError && (
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-700">
            {lookupError}
          </div>
        )}

        {lookupResults !== null && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-900">অনুসন্ধানের ফলাফল</h2>
              <button
                type="button"
                onClick={() => setLookupResults(null)}
                className="text-xs font-medium text-slate-500 hover:text-slate-900"
              >
                পরিষ্কার করুন
              </button>
            </div>
            {lookupResults.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                <p className="text-sm font-medium text-slate-900">
                  «{lookupQuery}» এর সাথে কোনো বুকিং পাওয়া যায়নি
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  সঠিক মোবাইল নম্বর বা বুকিং রেফারেন্স কোড দিয়ে আবার চেষ্টা করুন।
                </p>
              </div>
            ) : (
              <div className="space-y-4">{lookupResults.map(renderBookingCard)}</div>
            )}
          </section>
        )}

        {lookupResults === null && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <Ticket className="w-8 h-8 text-slate-400 mx-auto mb-3" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              তাৎক্ষণিক বুকিং যাচাই ও টিকিট ডাউনলোড
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              কাউন্টার অপারেটর যাচাই করার আগ পর্যন্ত বুকিং «অপেক্ষমাণ» অবস্থায় থাকে। পরীক্ষামূলকভাবে{' '}
              <button
                type="button"
                onClick={() => setLookupQuery('01819334455')}
                className="text-blue-700 font-medium underline underline-offset-2"
              >
                01819334455
              </button>{' '}
              অথবা{' '}
              <button
                type="button"
                onClick={() => setLookupQuery('BK-10421')}
                className="text-blue-700 font-medium underline underline-offset-2"
              >
                BK-10421
              </button>{' '}
              লিখে খুঁজুন।
            </p>
          </div>
        )}

        {slipBooking && (
          <TicketSlipModal
            booking={slipBooking}
            organizationName={settings.organization_name}
            onClose={() => setSlipBooking(null)}
          />
        )}
      </main>
    );
  }

  // --------------------------------------------------------------------------
  // VIEW 1: HOME SCREEN (Brand Logo + Larger 2-Column Cards + Verification/Trust)
  // --------------------------------------------------------------------------
  if (passengerView === 'home') {
    const resolvedLogoUrl =
      settings.organization_logo_url &&
      settings.organization_logo_url !== '/src/assets/images/default_org_logo_1794840144839.jpg'
        ? settings.organization_logo_url
        : CUSTOM_BRAND_LOGO;

    return (
      <main className="px-4 sm:px-6 pt-5 sm:pt-8 pb-10">
        <div className="w-full max-w-lg sm:max-w-xl mx-auto space-y-5 sm:space-y-6">
          {/* Compact Custom Brand Logo & Title Header */}
          <div className="flex flex-col items-center text-center gap-2.5">
            {!homeLogoError ? (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white border border-slate-200 shadow-xs p-1.5 overflow-hidden flex items-center justify-center">
                <img
                  src={resolvedLogoUrl}
                  alt={settings.organization_name}
                  referrerPolicy="no-referrer"
                  onError={() => setHomeLogoError(true)}
                  className="w-full h-full object-contain rounded-xl"
                />
              </div>
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-blue-700 text-white shadow-xs flex items-center justify-center">
                <Bus className="w-9 h-9" aria-hidden="true" />
              </div>
            )}

            <div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {settings.organization_name}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                লগইন ছাড়াই সরাসরি বাস ও ট্রেন টিকিট সেবা
              </p>
            </div>
          </div>

          {/* 2 Side-by-Side Clean Large Cards */}
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            {/* Card 1: বাস টিকিট */}
            <button
              type="button"
              onClick={() => setPassengerView('bus')}
              className="group min-h-[172px] sm:min-h-[212px] bg-white border border-slate-200 hover:border-blue-700 shadow-xs hover:shadow-md rounded-2xl p-6 sm:p-7 flex flex-col items-center justify-center gap-4 text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
            >
              <span className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center group-hover:bg-blue-700 group-hover:text-white transition-colors">
                <Bus className="w-9 h-9 sm:w-11 sm:h-11" aria-hidden="true" />
              </span>
              <span className="font-display text-lg sm:text-2xl font-bold text-slate-900">
                বাস টিকিট
              </span>
            </button>

            {/* Card 2: ট্রেন টিকিট */}
            <button
              type="button"
              onClick={() => setPassengerView('train')}
              className="group min-h-[172px] sm:min-h-[212px] bg-white border border-slate-200 hover:border-emerald-700 shadow-xs hover:shadow-md rounded-2xl p-6 sm:p-7 flex flex-col items-center justify-center gap-4 text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
            >
              <span className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-700 group-hover:text-white transition-colors">
                <TrainFront className="w-9 h-9 sm:w-11 sm:h-11" aria-hidden="true" />
              </span>
              <span className="font-display text-lg sm:text-2xl font-bold text-slate-900">
                ট্রেন টিকিট
              </span>
            </button>
          </div>

          {/* Quick Ticket Verification Action */}
          <button
            type="button"
            onClick={() => setActivePanel('bookings')}
            className="w-full min-h-[52px] px-4 py-3 bg-white border border-slate-200 hover:border-blue-700 hover:bg-blue-50/40 rounded-xl flex items-center justify-between gap-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-lg bg-slate-100 text-blue-700 flex items-center justify-center shrink-0">
                <Search className="w-5 h-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <span className="block font-display text-sm sm:text-base font-bold text-slate-900">
                  টিকিট যাচাই
                </span>
                <span className="block text-xs text-slate-500 truncate">
                  মোবাইল নম্বর বা বুকিং আইডি দিয়ে স্ট্যাটাস দেখুন ও ডাউনলোড করুন
                </span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          </button>

          {/* Compact 3-Item Trust Strip */}
          <div className="grid grid-cols-3 bg-white border border-slate-200 rounded-xl divide-x divide-slate-200">
            <div className="px-2 py-3 flex flex-col sm:flex-row items-center justify-center gap-1.5 text-center">
              <CheckCircle2 className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-700">সহজ বুকিং</span>
            </div>
            <div className="px-2 py-3 flex flex-col sm:flex-row items-center justify-center gap-1.5 text-center">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-700">নির্ভুল তথ্য</span>
            </div>
            <div className="px-2 py-3 flex flex-col sm:flex-row items-center justify-center gap-1.5 text-center">
              <Ticket className="w-4 h-4 text-slate-700 shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-700">একসাথে বাস ও ট্রেন</span>
            </div>
          </div>

          {/* Small Support Note Above Footer */}
          <p className="text-center text-xs text-slate-500 pt-1">
            টিকিট বা আসন সংক্রান্ত যেকোনো সহায়তার জন্য সংশ্লিষ্ট বাস কাউন্টারে যোগাযোগ করুন।
          </p>
        </div>
      </main>
    );
  }

  // --------------------------------------------------------------------------
  // VIEW 2: TRAIN TICKET IN-APP PORTAL (Same Window / No target="_blank")
  // --------------------------------------------------------------------------
  if (passengerView === 'train') {
    return (
      <main className="flex flex-col min-h-[calc(100vh-112px)] bg-white">
        {/* In-App Navigation Bar with Back Button */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-6 py-2.5">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setPassengerView('home')}
                className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>ফিরে যান (Back)</span>
              </button>
              <div className="min-w-0">
                <h1 className="font-display text-sm sm:text-base font-bold text-slate-900 truncate">
                  ট্রেন টিকিট / Train · বাংলাদেশ রেলওয়ে
                </h1>
                <p className="text-[11px] font-mono text-slate-500 truncate">
                  https://eticket.railway.gov.bd
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTrainIframeKey((k) => k + 1)}
                className="min-h-[40px] px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>রিলোড</span>
              </button>
              {/* Same-window fallback link (explicitly no target="_blank") */}
              <a
                href="https://eticket.railway.gov.bd"
                className="min-h-[40px] px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                <span>একই উইন্ডোতে সরাসরি খুলুন</span>
              </a>
            </div>
          </div>
        </div>

        {/* Embedded In-App View */}
        <div className="flex-1 w-full bg-slate-100">
          <iframe
            key={trainIframeKey}
            src="https://eticket.railway.gov.bd"
            title="বাংলাদেশ রেলওয়ে ই-টিকিট পোর্টাল"
            className="w-full h-[calc(100vh-140px)] min-h-[620px] border-0 bg-white block"
            allow="payment; geolocation; clipboard-write"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </main>
    );
  }

  // --------------------------------------------------------------------------
  // VIEW 3: BUS TICKET FLOW (Serial Counters + Route Search + Seat Map + Download)
  // --------------------------------------------------------------------------
  return (
    <main className="pb-16">
      <datalist id="bd-districts">
        {BANGLADESH_DISTRICTS.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>

      {/* Top Bar + Route/Place Search */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPassengerView('home')}
                className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>ফিরে যান</span>
              </button>
              <div>
                <p className="text-xs font-semibold text-blue-700">বাস টিকিট / Bus</p>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                  অনুমোদিত বাস কাউন্টার ও রুট অনুসন্ধান
                </h1>
              </div>
            </div>
          </div>

          {/* Route & Place Search Form */}
          <form
            onSubmit={handleSearchSubmit}
            className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label htmlFor="bus-place-query" className="block text-xs font-medium text-slate-600 mb-1.5">
                  রুট বা স্থান খুঁজুন (যেমন: সিলেট টু চট্টগ্রাম)
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="bus-place-query"
                    type="text"
                    value={placeQuery}
                    onChange={(e) => setPlaceQuery(e.target.value)}
                    placeholder="সিলেট টু চট্টগ্রাম বা কাউন্টার..."
                    className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="search-from" className="block text-xs font-medium text-slate-600 mb-1.5">
                  কোথা থেকে (যাত্রা শুরু)
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="search-from"
                    type="text"
                    list="bd-districts"
                    value={fromCity}
                    onChange={(e) => setFromCity(e.target.value)}
                    placeholder="যেমন: সিলেট"
                    className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="search-to" className="block text-xs font-medium text-slate-600 mb-1.5">
                  কোথায় যাবেন (গন্তব্য)
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="search-to"
                    type="text"
                    list="bd-districts"
                    value={toCity}
                    onChange={(e) => setToCity(e.target.value)}
                    placeholder="যেমন: চট্টগ্রাম"
                    className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="search-date" className="block text-xs font-medium text-slate-600 mb-1.5">
                  যাত্রার তারিখ
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="search-date"
                    type="date"
                    value={travelDate}
                    onChange={(e) => setTravelDate(e.target.value)}
                    className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 tabular-nums"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>জনপ্রিয় রুট:</span>
                {[
                  { from: 'সিলেট', to: 'চট্টগ্রাম' },
                  { from: 'ঢাকা', to: 'চট্টগ্রাম' },
                  { from: 'ঢাকা', to: 'কক্সবাজার' },
                  { from: 'ঢাকা', to: 'সিলেট' },
                ].map((r, i) => (
                  <React.Fragment key={`${r.from}-${r.to}`}>
                    {i > 0 && <span aria-hidden="true">·</span>}
                    <button
                      type="button"
                      onClick={() => {
                        setPlaceQuery('');
                        setFromCity(r.from);
                        setToCity(r.to);
                        loadTrips({ from: r.from, to: r.to, date: travelDate, counter_id: selectedCounterId });
                      }}
                      className="text-blue-700 hover:underline font-medium"
                    >
                      {r.from} → {r.to}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                {(fromCity || toCity || travelDate || placeQuery || selectedCounterId) && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg transition-colors"
                  >
                    সব কাউন্টার দেখুন
                  </button>
                )}
                <button
                  type="submit"
                  className="min-h-[44px] px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  <Search className="w-4 h-4" aria-hidden="true" />
                  <span>বাস খুঁজুন</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* Main Content Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-10">
        {/* Serial-Ordered Counters Directory */}
        <section aria-labelledby="counters-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-4 mb-5">
            <div>
              <h2 id="counters-heading" className="font-display text-xl font-bold text-slate-900">
                সিরিয়াল অনুযায়ী সকল বাস কাউন্টার ({formatBanglaNumber(serialCounters.length)}টি)
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                অ্যাডমিন কর্তৃক যুক্ত সকল বাস কাউন্টার সিরিয়াল অনুযায়ী দেওয়া হয়েছে। প্রতিটি কাউন্টারের নিচে থাকা «টিকিট কাটুন» বাটনে চাপ দিয়ে সিট বাছাই করুন।
              </p>
            </div>
          </div>

          {serialCounters.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
              <Bus className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-900">
                এই রুট বা অনুসন্ধানের সাথে কোনো কাউন্টার পাওয়া যায়নি
              </p>
              <button
                type="button"
                onClick={handleClearFilters}
                className="min-h-[44px] px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
              >
                সকল কাউন্টার দেখুন
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {serialCounters.map(({ counter, serial, counterAllTrips, counterMatchingTrips }) => {
                const relevantTrips =
                  counterMatchingTrips.length > 0 ? counterMatchingTrips : counterAllTrips;
                const minPrice =
                  relevantTrips.length > 0
                    ? Math.min(...relevantTrips.map((t) => Number(t.price)))
                    : null;
                const routeSamples = Array.from(
                  new Set(relevantTrips.map((t) => `${t.route_from} → ${t.route_to}`))
                ).slice(0, 2);

                return (
                  <article
                    key={counter.id}
                    className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
                  >
                    <div className="space-y-3">
                      {/* Serial & Counter Identity */}
                      <div className="flex items-start gap-3.5">
                        <div className="w-12 h-12 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center shrink-0 overflow-hidden">
                          {counter.logo_url ? (
                            <img
                              src={counter.logo_url}
                              alt={counter.counter_name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Bus className="w-6 h-6 text-blue-700" aria-hidden="true" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-mono font-semibold text-blue-700 tabular-nums">
                            কাউন্টার #{formatBanglaNumber(serial).padStart(2, '০')}
                          </p>
                          <h3 className="font-display text-lg font-bold text-slate-900 truncate">
                            {counter.counter_name}
                          </h3>
                        </div>
                      </div>

                      {/* Counter Details */}
                      <div className="space-y-1.5 text-xs text-slate-600 pt-1 border-t border-slate-100">
                        <p className="flex items-start gap-2">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>{counter.address}</span>
                        </p>
                        <p className="flex items-center gap-2 font-mono tabular-nums">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                          <span>{counter.phone}</span>
                        </p>
                        <p className="text-slate-600 pt-1">
                          {relevantTrips.length > 0 ? (
                            <>
                              <span className="font-medium text-slate-800">
                                {routeSamples.join(' · ')}
                              </span>
                              {minPrice !== null && (
                                <span className="text-slate-500 tabular-nums">
                                  {' '}· শুরু {formatBDT(minPrice)} থেকে
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-400">নতুন কাউন্টার · ট্রিপ যুক্ত হচ্ছে</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* "টিকিট কাটুন" Button under each counter's details */}
                    <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          openCounterBooking(counter, counterMatchingTrips, counterAllTrips)
                        }
                        className="w-full min-h-[44px] px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2 transition-colors"
                      >
                        <Ticket className="w-4 h-4" aria-hidden="true" />
                        <span>টিকিট কাটুন</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Filtered Schedules List */}
        <section aria-labelledby="trips-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-4 mb-4">
            <div>
              <h2 id="trips-heading" className="font-display text-xl font-bold text-slate-900">
                উপলব্ধ বাস ও সময়সূচি
              </h2>
              <p className="text-sm text-slate-600 mt-0.5 tabular-nums">
                {loadingTrips
                  ? 'বাসের সময়সূচি লোড হচ্ছে...'
                  : `মোট ${formatBanglaNumber(displayedTrips.length)}টি ট্রিপ পাওয়া গেছে`}
              </p>
            </div>
          </div>

          {tripsError && (
            <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-700 mb-4">
              {tripsError}
            </div>
          )}

          {loadingTrips ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : displayedTrips.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <Bus className="w-8 h-8 text-slate-400 mx-auto mb-3" aria-hidden="true" />
              <h3 className="font-display text-base font-semibold text-slate-900">
                এই রুটে কোনো নির্ধারিত ট্রিপ পাওয়া যায়নি
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                অন্য রুট বা তারিখ লিখে খুঁজুন অথবা সব ট্রিপ দেখুন।
              </p>
              <button
                type="button"
                onClick={handleClearFilters}
                className="mt-4 min-h-[44px] px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
              >
                সকল ট্রিপ দেখুন
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {displayedTrips.map((trip) => {
                const { time, date } = formatBanglaDateTime(trip.departure_time);
                const avail = trip.available_seats ?? trip.total_seats;
                const soldOut = avail <= 0;

                return (
                  <article
                    key={trip.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-300 transition-colors"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                        <span className="font-medium text-slate-800">{trip.counter_name}</span>
                        <span aria-hidden="true">·</span>
                        <span>{trip.bus_type}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{date}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                          {time}
                        </span>
                        <span className="font-display text-base sm:text-lg font-semibold text-slate-900 flex items-center gap-2">
                          <span>{trip.route_from}</span>
                          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                          <span>{trip.route_to}</span>
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 tabular-nums">
                        {soldOut ? (
                          <span className="font-semibold text-rose-700">সকল আসন বুকড</span>
                        ) : (
                          <span>
                            মোট {formatBanglaNumber(trip.total_seats)}টি আসনের মধ্যে{' '}
                            <strong className="font-semibold text-emerald-700">
                              {formatBanglaNumber(avail)}টি
                            </strong>{' '}
                            খালি আছে
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-5 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 shrink-0">
                      <div className="md:text-right">
                        <span className="block text-[11px] text-slate-500">প্রতি আসন ভাড়া</span>
                        <span className="font-mono text-xl font-bold text-slate-900 tabular-nums">
                          {formatBDT(trip.price)}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={soldOut}
                        onClick={() => openSeatSelection(trip)}
                        className="min-h-[44px] px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        {soldOut ? 'আসন নেই' : 'টিকিট কাটুন'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Visual Seat Selection, Passenger Details, Payment & Downloadable Online Ticket Modal */}
      {bookingModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="seat-modal-title"
        >
          <div className="bg-white w-full sm:max-w-4xl max-h-[92vh] rounded-t-2xl sm:rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <h2 id="seat-modal-title" className="font-display text-lg font-bold text-slate-900 truncate">
                  {activeTrip
                    ? `${activeTrip.route_from} থেকে ${activeTrip.route_to}`
                    : modalCounter?.counter_name || 'টিকিট বুকিং'}
                </h2>
                {activeTrip ? (
                  <p className="text-xs text-slate-500 tabular-nums truncate">
                    {activeTrip.counter_name || modalCounter?.counter_name} · {activeTrip.bus_type} ·{' '}
                    {formatBanglaDateTime(activeTrip.departure_time).date}{' '}
                    {formatBanglaDateTime(activeTrip.departure_time).time}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 truncate">{modalCounter?.address}</p>
                )}
              </div>
              <button
                type="button"
                onClick={closeBookingModal}
                aria-label="বন্ধ করুন"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto p-5 sm:p-6">
              {!activeTrip ? (
                <div className="max-w-md mx-auto py-8 text-center space-y-4">
                  <Bus className="w-10 h-10 text-slate-400 mx-auto" aria-hidden="true" />
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    এই কাউন্টারে এখনো কোনো ট্রিপ নির্ধারিত হয়নি
                  </h3>
                  <p className="text-sm text-slate-600">
                    কাউন্টার অপারেটর বা অ্যাডমিন নতুন ট্রিপ ও সময়সূচি যুক্ত করলে এখান থেকেই সিট ম্যাপ দেখে টিকিট কাটা যাবে।
                  </p>
                  <button
                    type="button"
                    onClick={closeBookingModal}
                    className="min-h-[44px] px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg"
                  >
                    ফিরে যান
                  </button>
                </div>
              ) : confirmedReceipt ? (
                /* Instant Digital Ticket & Download View */
                <div className="max-w-lg mx-auto py-2 space-y-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-display text-xl font-bold text-slate-900">
                        ডিজিটাল টিকিট প্রস্তুত হয়েছে
                      </h3>
                      <p className="text-sm text-slate-600 mt-1">
                        আপনার পেমেন্ট ও TrxID কাউন্টার মাস্টারের কাছে যাচাইয়ের জন্য পাঠানো হয়েছে। নিচে থেকে আপনার টিকিট সংরক্ষণ বা ডাউনলোড করুন।
                      </p>
                    </div>
                  </div>

                  {/* Clean Printable/Downloadable Digital Ticket Card */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-dashed border-slate-300">
                      <div>
                        <span className="text-[11px] text-slate-500 block">Ticket ID / PNR</span>
                        <span className="font-mono text-base font-bold text-slate-900 tabular-nums">
                          {confirmedReceipt.id}
                        </span>
                      </div>
                      <StatusBadge status={confirmedReceipt.status} />
                    </div>

                    <div className="pb-2 border-b border-dashed border-slate-300">
                      <p className="text-xs font-semibold text-blue-700">
                        {confirmedReceipt.trip?.counter_name || activeTrip.counter_name}
                      </p>
                      <p className="font-display text-base font-bold text-slate-900 mt-0.5">
                        {activeTrip.route_from} → {activeTrip.route_to}
                      </p>
                      <p className="text-xs text-slate-600 tabular-nums mt-0.5">
                        {formatBanglaDateTime(activeTrip.departure_time).date} ·{' '}
                        {formatBanglaDateTime(activeTrip.departure_time).time} · {activeTrip.bus_type}
                      </p>
                    </div>

                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">যাত্রীর নাম</span>
                      <span className="font-semibold text-slate-900 text-right">
                        {confirmedReceipt.passenger_name}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">মোবাইল নম্বর</span>
                      <span className="font-mono text-slate-900 tabular-nums">
                        {confirmedReceipt.phone}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">বোর্ডিং পয়েন্ট</span>
                      <span className="text-slate-900 text-right">
                        {confirmedReceipt.boarding_point}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">নির্বাচিত আসন</span>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {confirmedReceipt.selected_seats.join(', ')}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">পেমেন্ট মাধ্যম ও TrxID</span>
                      <span className="text-slate-900 text-right">
                        {confirmedReceipt.payment_method || confirmedPaymentMeta?.method}
                        {confirmedReceipt.trx_id || confirmedPaymentMeta?.reference ? (
                          <span className="font-mono font-semibold text-blue-700 block sm:inline sm:ml-1.5">
                            TrxID: {confirmedReceipt.trx_id || confirmedPaymentMeta?.reference}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="flex justify-between pt-3 border-t border-dashed border-slate-300">
                      <span className="font-semibold text-slate-900">মোট ভাড়া</span>
                      <span className="font-mono text-lg font-bold text-blue-700 tabular-nums">
                        {formatBDT(confirmedReceipt.total_fare)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        downloadTicketPng(
                          confirmedReceipt,
                          settings.organization_name,
                          confirmedPaymentMeta
                        )
                      }
                      className="w-full min-h-[48px] px-5 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <Download className="w-4 h-4" aria-hidden="true" />
                      <span>টিকিট ডাউনলোড করুন (Download Ticket)</span>
                    </button>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Printer className="w-4 h-4" aria-hidden="true" />
                        <span>প্রিন্ট করুন</span>
                      </button>

                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          type="button"
                          onClick={async () => {
                            const idToCheck = confirmedReceipt.id;
                            setLookupQuery(idToCheck);
                            closeBookingModal();
                            setActivePanel('bookings');
                            setLookupLoading(true);
                            setLookupError('');
                            try {
                              const found = await lookupBookings(idToCheck);
                              setLookupResults(found);
                            } catch (err) {
                              setLookupError(extractErrorMessage(err, 'টিকেট খোঁজা সম্ভব হয়নি'));
                            } finally {
                              setLookupLoading(false);
                            }
                          }}
                          className="min-h-[44px] px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                          টিকিট যাচাই-এ দেখুন
                        </button>
                        <button
                          type="button"
                          onClick={closeBookingModal}
                          className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
                        >
                          সম্পন্ন
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Counter Trip Selector when counter has multiple trips */}
                  {modalTrips.length > 1 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                      <label htmlFor="modal-trip-select" className="block text-xs font-semibold text-slate-700">
                        এই কাউন্টারের ট্রিপ ও সময়সূচি নির্বাচন করুন ({formatBanglaNumber(modalTrips.length)}টি ট্রিপ)
                      </label>
                      <select
                        id="modal-trip-select"
                        value={activeTrip.id}
                        onChange={(e) => {
                          const nextTrip = modalTrips.find((t) => t.id === e.target.value);
                          if (nextTrip) loadSeatsForModalTrip(nextTrip);
                        }}
                        className="w-full min-h-[44px] px-3 py-2 text-sm font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                      >
                        {modalTrips.map((t) => {
                          const dt = formatBanglaDateTime(t.departure_time);
                          return (
                            <option key={t.id} value={t.id}>
                              {t.route_from} → {t.route_to} · {dt.date} {dt.time} · {formatBDT(t.price)} ({t.bus_type})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    {/* Left: Interactive Visual Seat Map */}
                    <div className="md:col-span-6">
                      <h3 className="font-display text-sm font-semibold text-slate-900 mb-3">
                        ০১. ভিজ্যুয়াল সিট ম্যাপ থেকে আসন নির্বাচন করুন (সর্বোচ্চ ৬টি)
                      </h3>
                      {loadingSeats ? (
                        <div className="h-80 rounded-xl bg-slate-100 animate-pulse" />
                      ) : (
                        <SeatMap
                          seats={tripSeats}
                          selectedSeats={selectedSeats}
                          onToggleSeat={toggleSeat}
                        />
                      )}
                    </div>

                    {/* Right: Fast Guest Passenger Info + bKash/Nagad Payment + Instant Ticket */}
                    <div className="md:col-span-6">
                      <h3 className="font-display text-sm font-semibold text-slate-900 mb-3">
                        ০২. যাত্রীর তথ্য ও দ্রুত পেমেন্ট (লগইন ছাড়াই)
                      </h3>

                      <form onSubmit={handleBookingSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="p-name" className="block text-xs font-medium text-slate-600 mb-1">
                              যাত্রীর পূর্ণ নাম *
                            </label>
                            <div className="relative">
                              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                              <input
                                id="p-name"
                                type="text"
                                required
                                value={passengerName}
                                onChange={(e) => setPassengerName(e.target.value)}
                                placeholder="রাশেদুল করিম"
                                className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                              />
                            </div>
                          </div>

                          <div>
                            <label htmlFor="p-phone" className="block text-xs font-medium text-slate-600 mb-1">
                              ১১ সংখ্যার মোবাইল নম্বর *
                            </label>
                            <div className="relative">
                              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                              <input
                                id="p-phone"
                                type="tel"
                                required
                                value={passengerPhone}
                                onChange={(e) => setPassengerPhone(e.target.value)}
                                placeholder="01711000000"
                                className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 tabular-nums"
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          <label htmlFor="p-boarding" className="block text-xs font-medium text-slate-600 mb-1">
                            বোর্ডিং পয়েন্ট / কাউন্টার *
                          </label>
                          <input
                            id="p-boarding"
                            type="text"
                            required
                            value={boardingPoint}
                            onChange={(e) => setBoardingPoint(e.target.value)}
                            placeholder="প্রধান কাউন্টার"
                            className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                          />
                        </div>

                        {/* Fast Payment Method & Copy Number Box */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                            <CreditCard className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
                            <span>পেমেন্ট মাধ্যম নির্বাচন করুন (bKash / Nagad)</span>
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {PAYMENT_METHODS.map((pm) => {
                              const selected = paymentMethod === pm.id;
                              return (
                                <button
                                  key={pm.id}
                                  type="button"
                                  onClick={() => setPaymentMethod(pm.id)}
                                  className={`min-h-[44px] px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg border transition-colors ${
                                    selected
                                      ? 'bg-blue-700 text-white border-blue-700'
                                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  {pm.label}
                                </button>
                              );
                            })}
                          </div>

                          {/* Counter Payment Number + Copy Button + Total Fare */}
                          <div className="bg-white border border-blue-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <div className="min-w-0">
                              <p className="text-[11px] text-slate-500">
                                {paymentMethod} সেন্ড মানি / পেমেন্ট নম্বর
                              </p>
                              <p className="font-mono text-base font-bold text-slate-900 tabular-nums mt-0.5">
                                {counterPaymentNumber}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={handleCopyPaymentNumber}
                              className={`min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-lg border inline-flex items-center justify-center gap-1.5 transition-colors shrink-0 ${
                                copiedPaymentNum
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                              }`}
                            >
                              {copiedPaymentNum ? (
                                <>
                                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>কপি হয়েছে</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>নম্বর কপি করুন</span>
                                </>
                              )}
                            </button>
                          </div>

                          <div className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded-lg px-3 py-2">
                            <span className="text-slate-600 font-medium">পরিশোধযোগ্য মোট ভাড়া</span>
                            <span className="font-mono text-base font-bold text-blue-700 tabular-nums">
                              {formatBDT(totalFare)}
                            </span>
                          </div>

                          <div>
                            <label htmlFor="p-pay-ref" className="block text-xs font-medium text-slate-700 mb-1">
                              ট্রানজেকশন আইডি / TrxID লিখুন *
                            </label>
                            <input
                              id="p-pay-ref"
                              type="text"
                              required
                              value={paymentRef}
                              onChange={(e) => setPaymentRef(e.target.value)}
                              placeholder="যেমন: BKH9X4M2K8"
                              className="w-full min-h-[44px] px-3 py-2 text-sm font-mono uppercase bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                            />
                          </div>
                        </div>

                        {/* Selection Summary */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600">নির্বাচিত আসন</span>
                            <span className="font-mono font-semibold text-slate-900 tabular-nums">
                              {selectedSeats.length > 0 ? selectedSeats.join(', ') : 'নির্বাচিত হয়নি'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600">টিকেট মূল্য</span>
                            <span className="font-mono text-slate-900 tabular-nums">
                              {formatBDT(activeTrip.price)} × {formatBanglaNumber(selectedSeats.length)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                            <span className="font-semibold text-slate-900">সর্বমোট ভাড়া</span>
                            <span className="font-mono text-lg font-bold text-blue-700 tabular-nums">
                              {formatBDT(totalFare)}
                            </span>
                          </div>
                        </div>

                        {bookingError && (
                          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                            {bookingError}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={submittingBooking || selectedSeats.length === 0}
                          className="w-full min-h-[48px] px-5 py-3 bg-blue-700 hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-colors"
                        >
                          {submittingBooking
                            ? 'টিকিট তৈরি হচ্ছে...'
                            : 'টিকিট নিশ্চিত ও ডাউনলোড করুন'}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
