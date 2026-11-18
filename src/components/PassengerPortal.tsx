import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bus,
  Calendar,
  CheckCircle2,
  MapPin,
  Phone,
  Search,
  Ticket,
  User,
  X,
} from 'lucide-react';
import {
  createBooking,
  fetchCounters,
  fetchTripSeats,
  fetchTrips,
  lookupBookings,
} from '../lib/api';
import { useApp } from '../context/AppContext';
import type { Booking, Counter, Seat, Trip } from '../types';
import { SeatMap } from './SeatMap';
import { StatusBadge } from './StatusBadge';

function formatDeparture(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { time: iso, date: '' };
  return {
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    date: d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
  };
}

export function PassengerPortal({ mode }: { mode: 'book' | 'lookup' }) {
  const { settings, setActivePanel } = useApp();

  // Search filters
  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');
  const [travelDate, setTravelDate] = useState('');
  const [selectedCounterId, setSelectedCounterId] = useState('');

  // Data state
  const [counters, setCounters] = useState<Counter[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [tripsError, setTripsError] = useState('');

  // Seat selection & booking modal state
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [tripSeats, setTripSeats] = useState<Seat[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);

  // Passenger form
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [boardingPoint, setBoardingPoint] = useState('');
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [confirmedReceipt, setConfirmedReceipt] = useState<Booking | null>(null);

  // Booking lookup state
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResults, setLookupResults] = useState<Booking[] | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const [heroImgFailed, setHeroImgFailed] = useState(false);

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
        setTripsError(err instanceof Error ? err.message : 'Could not load schedules');
      } finally {
        setLoadingTrips(false);
      }
    },
    [fromCity, toCity, travelDate, selectedCounterId]
  );

  useEffect(() => {
    fetchCounters()
      .then(setCounters)
      .catch(() => setCounters([]));
    loadTrips({ from: '', to: '', date: '', counter_id: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadTrips();
  };

  const handleSelectCounter = (counterId: string) => {
    const next = selectedCounterId === counterId ? '' : counterId;
    setSelectedCounterId(next);
    loadTrips({ from: fromCity, to: toCity, date: travelDate, counter_id: next });
  };

  const handleClearFilters = () => {
    setFromCity('');
    setToCity('');
    setTravelDate('');
    setSelectedCounterId('');
    loadTrips({ from: '', to: '', date: '', counter_id: '' });
  };

  const openSeatSelection = async (trip: Trip) => {
    setActiveTrip(trip);
    setSelectedSeats([]);
    setBookingError('');
    setConfirmedReceipt(null);
    setBoardingPoint(
      counters.find((c) => c.id === trip.counter_id)?.address || `${trip.route_from} Central Counter`
    );
    setLoadingSeats(true);
    try {
      const seats = await fetchTripSeats(trip.id);
      setTripSeats(seats);
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Unable to fetch seat map');
    } finally {
      setLoadingSeats(false);
    }
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

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip) return;
    if (selectedSeats.length === 0) {
      setBookingError('Please select at least one available seat.');
      return;
    }

    setSubmittingBooking(true);
    setBookingError('');
    try {
      const booking = await createBooking({
        trip_id: activeTrip.id,
        passenger_name: passengerName,
        phone: passengerPhone,
        boarding_point: boardingPoint,
        selected_seats: selectedSeats,
      });
      setConfirmedReceipt(booking);
      setPassengerName('');
      setPassengerPhone('');
      setSelectedSeats([]);
      // Refresh seats and trips list so availability updates in real time
      const [freshSeats] = await Promise.all([fetchTripSeats(activeTrip.id), loadTrips()]);
      setTripSeats(freshSeats);
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Failed to submit booking');
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
      setLookupError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLookupLoading(false);
    }
  };

  if (mode === 'lookup') {
    return (
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-slate-900 tracking-tight">
            Check Booking Status
          </h1>
          <p className="mt-2 text-sm text-slate-600 max-w-xl">
            Enter your phone number or booking reference ID to verify real-time operator confirmation and seat assignments.
          </p>
        </div>

        <form
          onSubmit={handleLookupSubmit}
          className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row gap-3 mb-8"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              placeholder="Phone number (e.g. 4155550144) or Booking ID (e.g. BK-10422)"
              aria-label="Phone number or Booking ID"
              className="w-full min-h-[44px] pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 focus:bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={lookupLoading}
            className="min-h-[44px] px-6 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {lookupLoading ? 'Searching...' : 'Find Ticket'}
          </button>
        </form>

        {lookupError && (
          <div className="mb-6 p-4 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-700">
            {lookupError}
          </div>
        )}

        {lookupResults === null ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <Ticket className="w-8 h-8 text-slate-400 mx-auto mb-3" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Instant Reservation Lookup
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Bookings remain in Pending status until verified by the counter operator. Try searching{' '}
              <button
                type="button"
                onClick={() => setLookupQuery('4155550144')}
                className="text-blue-700 font-medium underline underline-offset-2"
              >
                4155550144
              </button>{' '}
              or{' '}
              <button
                type="button"
                onClick={() => setLookupQuery('BK-10421')}
                className="text-blue-700 font-medium underline underline-offset-2"
              >
                BK-10421
              </button>
              .
            </p>
          </div>
        ) : lookupResults.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <p className="text-sm font-medium text-slate-900">No bookings matched "{lookupQuery}"</p>
            <p className="text-xs text-slate-500 mt-1">
              Double-check your phone number or booking reference code.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {lookupResults.map((b) => {
              const dt = b.trip ? formatDeparture(b.trip.departure_time) : { time: '', date: '' };
              return (
                <div
                  key={b.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                        {b.id}
                      </span>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <StatusBadge status={b.status} />
                    </div>
                    {b.trip && (
                      <p className="font-display text-lg font-semibold text-slate-900">
                        {b.trip.route_from} to {b.trip.route_to}
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
                          <span className="tabular-nums">{dt.date} at {dt.time}</span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Boarding: {b.boarding_point || 'Main Terminal Counter'}
                    </p>
                  </div>

                  <div className="sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 shrink-0">
                    <p className="text-xs text-slate-500">Seats</p>
                    <p className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                      {b.selected_seats.join(', ')}
                    </p>
                    <p className="font-mono text-lg font-bold text-slate-900 tabular-nums mt-1">
                      ${Number(b.total_fare).toFixed(2)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="pb-16">
      {/* Hero & Search Section */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Left Column: Headline + Search Form */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
              <div>
                <p className="text-xs font-semibold text-blue-700 tracking-wide mb-2">
                  {settings.organization_name}
                </p>
                <h1 className="font-display text-3xl sm:text-4xl lg:text-[42px] font-bold text-slate-900 leading-[1.12] tracking-tight [text-wrap:balance]">
                  Intercity coach booking across verified counters.
                </h1>
                <p className="mt-3 text-base text-slate-600 max-w-xl leading-relaxed">
                  Compare schedules, choose your exact cabin seat, and submit reservations directly to your departure counter.
                </p>
              </div>

              {/* Search Bar */}
              <form
                onSubmit={handleSearchSubmit}
                className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="search-from" className="block text-xs font-medium text-slate-600 mb-1.5">
                      From
                    </label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                      <input
                        id="search-from"
                        type="text"
                        value={fromCity}
                        onChange={(e) => setFromCity(e.target.value)}
                        placeholder="San Francisco"
                        className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="search-to" className="block text-xs font-medium text-slate-600 mb-1.5">
                      To
                    </label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                      <input
                        id="search-to"
                        type="text"
                        value={toCity}
                        onChange={(e) => setToCity(e.target.value)}
                        placeholder="Los Angeles"
                        className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="search-date" className="block text-xs font-medium text-slate-600 mb-1.5">
                      Departure Date
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
                    <span>Popular routes:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFromCity('San Francisco');
                        setToCity('Los Angeles');
                        loadTrips({ from: 'San Francisco', to: 'Los Angeles', date: travelDate, counter_id: selectedCounterId });
                      }}
                      className="text-blue-700 hover:underline font-medium"
                    >
                      SF to LA
                    </button>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFromCity('San Francisco');
                        setToCity('Sacramento');
                        loadTrips({ from: 'San Francisco', to: 'Sacramento', date: travelDate, counter_id: selectedCounterId });
                      }}
                      className="text-blue-700 hover:underline font-medium"
                    >
                      SF to Sacramento
                    </button>
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    {(fromCity || toCity || travelDate || selectedCounterId) && (
                      <button
                        type="button"
                        onClick={handleClearFilters}
                        className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg transition-colors"
                      >
                        Reset
                      </button>
                    )}
                    <button
                      type="submit"
                      className="min-h-[44px] px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
                    >
                      <Search className="w-4 h-4" aria-hidden="true" />
                      <span>Search Trips</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Right Column: Hero Coach Photograph */}
            <div className="lg:col-span-5">
              {!heroImgFailed ? (
                <div className="h-60 sm:h-72 lg:h-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                  <img
                    src="/src/assets/images/hero_express_coach_1794840144861.jpg"
                    alt="Express intercity coach bus"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="h-60 sm:h-72 lg:h-full rounded-xl border border-slate-200 bg-gradient-to-br from-slate-900 to-blue-900 text-white p-8 flex flex-col justify-end">
                  <Bus className="w-10 h-10 mb-3 text-blue-300" />
                  <p className="font-display text-xl font-semibold">{settings.organization_name}</p>
                  <p className="text-sm text-slate-300 mt-1">Direct Counter Dispatch & Seat Selection</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-10">
        {/* Available Bus Counters / Operators Directory */}
        <section aria-labelledby="counters-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-4 mb-4">
            <div>
              <h2 id="counters-heading" className="font-display text-xl font-bold text-slate-900">
                Available Bus Counters
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                Select a counter operator to filter trips departing from their terminal.
              </p>
            </div>
            {selectedCounterId && (
              <button
                type="button"
                onClick={() => handleSelectCounter(selectedCounterId)}
                className="text-xs font-semibold text-blue-700 hover:underline"
              >
                Show all counters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {counters.map((counter) => {
              const isSelected = selectedCounterId === counter.id;
              return (
                <button
                  key={counter.id}
                  type="button"
                  onClick={() => handleSelectCounter(counter.id)}
                  className={`text-left p-4 rounded-xl border transition-colors flex items-start gap-3.5 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                    isSelected
                      ? 'bg-blue-50/70 border-blue-700'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="w-11 h-11 rounded-lg border border-slate-200 bg-white flex items-center justify-center shrink-0 overflow-hidden">
                    {counter.logo_url ? (
                      <img
                        src={counter.logo_url}
                        alt={counter.counter_name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Bus className="w-5 h-5 text-blue-700" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm font-semibold text-slate-900 truncate">
                      {counter.counter_name}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{counter.address}</p>
                    <p className="text-xs font-mono text-slate-600 mt-1.5 tabular-nums flex items-center gap-1.5">
                      <Phone className="w-3 h-3 text-slate-400" aria-hidden="true" />
                      <span>{counter.phone}</span>
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Search Results & Schedules */}
        <section aria-labelledby="trips-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-4 mb-4">
            <div>
              <h2 id="trips-heading" className="font-display text-xl font-bold text-slate-900">
                Available Departures
              </h2>
              <p className="text-sm text-slate-600 mt-0.5 tabular-nums">
                {loadingTrips
                  ? 'Loading schedules...'
                  : `${trips.length} ${trips.length === 1 ? 'trip' : 'trips'} available`}
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
          ) : trips.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <Bus className="w-8 h-8 text-slate-400 mx-auto mb-3" aria-hidden="true" />
              <h3 className="font-display text-base font-semibold text-slate-900">
                No scheduled buses match your filters
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Try clearing the date or switching departure cities to see all available routes.
              </p>
              <button
                type="button"
                onClick={handleClearFilters}
                className="mt-4 min-h-[44px] px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
              >
                View All Schedules
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {trips.map((trip) => {
                const { time, date } = formatDeparture(trip.departure_time);
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
                          <span className="font-semibold text-rose-700">Sold out</span>
                        ) : (
                          <span>
                            <strong className="font-semibold text-emerald-700">{avail}</strong> of{' '}
                            {trip.total_seats} seats available
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-5 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 shrink-0">
                      <div className="md:text-right">
                        <span className="block text-[11px] text-slate-500">Fare per seat</span>
                        <span className="font-mono text-xl font-bold text-slate-900 tabular-nums">
                          ${Number(trip.price).toFixed(2)}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={soldOut}
                        onClick={() => openSeatSelection(trip)}
                        className="min-h-[44px] px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        {soldOut ? 'Full' : 'Select Seats'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Interactive Seat Selection & Passenger Booking Modal/Drawer */}
      {activeTrip && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="seat-modal-title"
        >
          <div className="bg-white w-full sm:max-w-4xl max-h-[92vh] rounded-t-2xl sm:rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <h2 id="seat-modal-title" className="font-display text-lg font-bold text-slate-900 truncate">
                  {activeTrip.route_from} to {activeTrip.route_to}
                </h2>
                <p className="text-xs text-slate-500 tabular-nums truncate">
                  {activeTrip.counter_name} · {activeTrip.bus_type} ·{' '}
                  {formatDeparture(activeTrip.departure_time).date}{' '}
                  {formatDeparture(activeTrip.departure_time).time}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTrip(null)}
                aria-label="Close seat selection"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto p-5 sm:p-6">
              {confirmedReceipt ? (
                <div className="max-w-lg mx-auto py-4 space-y-6">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-display text-xl font-bold text-slate-900">
                        Booking Request Submitted
                      </h3>
                      <p className="text-sm text-slate-600 mt-1">
                        Your seats are held with <strong className="font-semibold text-amber-700">Pending</strong> status until confirmed by the {activeTrip.counter_name} operator.
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Booking Reference</span>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {confirmedReceipt.id}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Passenger</span>
                      <span className="font-medium text-slate-900">{confirmedReceipt.passenger_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Phone</span>
                      <span className="font-mono text-slate-900 tabular-nums">{confirmedReceipt.phone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Boarding Point</span>
                      <span className="text-slate-900 text-right">{confirmedReceipt.boarding_point}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Selected Seats</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {confirmedReceipt.selected_seats.join(', ')}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200">
                      <span className="font-semibold text-slate-900">Total Fare</span>
                      <span className="font-mono text-base font-bold text-blue-700 tabular-nums">
                        ${Number(confirmedReceipt.total_fare).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setLookupQuery(confirmedReceipt.id);
                        setActiveTrip(null);
                        setActivePanel('bookings');
                      }}
                      className="min-h-[44px] px-5 py-2 text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      Track Booking Status
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTrip(null)}
                      className="min-h-[44px] px-5 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  {/* Left: Interactive Seat Map */}
                  <div className="md:col-span-6">
                    <h3 className="font-display text-sm font-semibold text-slate-900 mb-3">
                      01. Choose Your Seats (max 6)
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

                  {/* Right: Passenger Information Form */}
                  <div className="md:col-span-6">
                    <h3 className="font-display text-sm font-semibold text-slate-900 mb-3">
                      02. Passenger Information
                    </h3>

                    <form onSubmit={handleBookingSubmit} className="space-y-4">
                      <div>
                        <label htmlFor="p-name" className="block text-xs font-medium text-slate-600 mb-1.5">
                          Full Name
                        </label>
                        <div className="relative">
                          <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                          <input
                            id="p-name"
                            type="text"
                            required
                            value={passengerName}
                            onChange={(e) => setPassengerName(e.target.value)}
                            placeholder="Elena Vance"
                            className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="p-phone" className="block text-xs font-medium text-slate-600 mb-1.5">
                          Phone Number
                        </label>
                        <div className="relative">
                          <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                          <input
                            id="p-phone"
                            type="tel"
                            required
                            value={passengerPhone}
                            onChange={(e) => setPassengerPhone(e.target.value)}
                            placeholder="415-555-0199"
                            className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 tabular-nums"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="p-boarding" className="block text-xs font-medium text-slate-600 mb-1.5">
                          Boarding Point
                        </label>
                        <input
                          id="p-boarding"
                          type="text"
                          required
                          value={boardingPoint}
                          onChange={(e) => setBoardingPoint(e.target.value)}
                          placeholder="Central Terminal Bay 2"
                          className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                        />
                      </div>

                      {/* Selection Summary */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">Selected Seats</span>
                          <span className="font-mono font-semibold text-slate-900 tabular-nums">
                            {selectedSeats.length > 0 ? selectedSeats.join(', ') : 'None selected'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">Ticket Price</span>
                          <span className="font-mono text-slate-900 tabular-nums">
                            ${Number(activeTrip.price).toFixed(2)} x {selectedSeats.length}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                          <span className="font-semibold text-slate-900">Total Fare</span>
                          <span className="font-mono text-lg font-bold text-blue-700 tabular-nums">
                            ${totalFare.toFixed(2)}
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
                        {submittingBooking ? 'Submitting Request...' : 'Confirm Booking Request'}
                      </button>
                    </form>
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
