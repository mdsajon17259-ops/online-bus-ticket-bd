import React, { useMemo } from 'react';
import { CheckCircle2, DoorOpen, MapPin, ShieldCheck } from 'lucide-react';
import {
  formatBanglaDateTime,
  formatBanglaNumber,
  formatBDT,
  formatShortTicketId,
} from '../lib/format';
import type { TicketPaymentMeta } from '../lib/ticketDownload';
import {
  buildTicketSeatLayout,
  getCoachVisualProfile,
} from '../lib/ticketVisuals';
import type { Booking } from '../types';

interface ConfirmedETicketCardProps {
  booking: Booking;
  organizationName: string;
  organizationLogoUrl?: string;
  paymentMeta?: TicketPaymentMeta | null;
}

const SEAT_COLS = ['A', 'B', 'C', 'D'] as const;

export function ConfirmedETicketCard({
  booking,
  organizationName,
  organizationLogoUrl,
  paymentMeta,
}: ConfirmedETicketCardProps) {
  const shortId = formatShortTicketId(booking.id);
  const tripDt = booking.trip ? formatBanglaDateTime(booking.trip.departure_time) : null;
  const createdDt = formatBanglaDateTime(booking.created_at);

  const resolvedMethod =
    booking.payment_method?.trim() || paymentMeta?.method || 'অনলাইন / কাউন্টার পেমেন্ট';
  const resolvedTrxId = booking.trx_id?.trim() || paymentMeta?.reference || '';

  const coachProfile = useMemo(
    () => getCoachVisualProfile(booking.trip?.bus_type),
    [booking.trip?.bus_type]
  );

  const seatLayout = useMemo(
    () => buildTicketSeatLayout(booking.selected_seats, booking.trip?.total_seats),
    [booking.selected_seats, booking.trip?.total_seats]
  );

  const isConfirmed = booking.status === 'confirmed';
  const statusLabel = isConfirmed
    ? 'অনুমোদিত / Confirmed'
    : booking.status === 'cancelled'
      ? 'বাতিল / Cancelled'
      : 'যাচাই চলমান / Pending';
  const statusBadgeClass = isConfirmed
    ? 'bg-emerald-600 text-white border-emerald-400/40'
    : booking.status === 'cancelled'
      ? 'bg-rose-600 text-white border-rose-400/40'
      : 'bg-amber-500 text-slate-950 border-amber-300/40';

  const hasCustomLogo =
    Boolean(organizationLogoUrl) &&
    organizationLogoUrl !== '/src/assets/images/default_org_logo_1794840144839.jpg';

  const renderSeatTile = (rowNum: number, colIndex: number) => {
    const col = SEAT_COLS[colIndex];
    const seatNumber = `${col}${rowNum}`;
    const linearIndex = (rowNum - 1) * 4 + (colIndex + 1);
    const isThisTicketSeat = seatLayout.bookedSeatSet.has(seatNumber);

    if (linearIndex > seatLayout.totalSeats && !isThisTicketSeat) {
      return <div key={seatNumber} className="h-7" aria-hidden="true" />;
    }

    return (
      <div
        key={seatNumber}
        aria-label={
          isThisTicketSeat
            ? `আসন ${seatNumber} - আপনার নির্ধারিত আসন`
            : `আসন ${seatNumber}`
        }
        className={`h-7 rounded-md border font-mono text-[11px] tabular-nums flex items-center justify-center transition-colors ${
          isThisTicketSeat
            ? 'bg-emerald-600 border-emerald-700 text-white font-bold shadow-xs'
            : 'bg-slate-50 border-slate-200 text-slate-400 font-medium'
        }`}
      >
        {seatNumber}
      </div>
    );
  };

  return (
    <article
      className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm text-left"
      aria-label={`ই-টিকিট ${shortId}`}
    >
      {/* Top Ticket Header Bar */}
      <header className="bg-gradient-to-r from-slate-900 via-blue-950 to-blue-800 px-4 sm:px-5 py-3.5 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {hasCustomLogo ? (
            <img
              src={organizationLogoUrl}
              alt={organizationName}
              className="w-10 h-10 rounded-xl object-cover bg-white border border-white/25 shrink-0"
            />
          ) : (
            <span className="w-10 h-10 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-white" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="font-display text-base sm:text-lg font-bold tracking-tight text-white truncate">
              {organizationName || 'দেশ ভ্রমণ / Desh Travels'}
            </h3>
            <p className="text-[11px] font-medium text-blue-100 tracking-wide truncate">
              অনলাইন বাস ই-টিকিট • E-TICKET
            </p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold shrink-0 ${statusBadgeClass}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{statusLabel}</span>
        </span>
      </header>

      {/* Two-Side Split Boarding Pass Body */}
      <div className="grid grid-cols-1 md:grid-cols-12">
        {/* LEFT SIDE: Clean Non-Overlapping Passenger & Trip Details */}
        <div className="md:col-span-7 p-4 sm:p-5 space-y-3.5 bg-white min-w-0">
          {/* Booking ID & Counter/Bus Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-dashed border-slate-200">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-500">টিকিট / বুকিং আইডি</p>
              <p className="font-mono text-base font-bold text-slate-900 tabular-nums mt-0.5 break-words">
                {shortId}
              </p>
            </div>
            <div className="min-w-0 sm:text-right">
              <p className="text-[11px] font-medium text-slate-500">কাউন্টার ও বাসের ধরন</p>
              <p className="text-xs font-semibold text-blue-700 mt-0.5 break-words leading-snug">
                {booking.trip
                  ? `${booking.trip.counter_name} · ${booking.trip.bus_type}`
                  : 'নির্ধারিত কাউন্টার'}
              </p>
            </div>
          </div>

          {/* Route & Journey Date/Time */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <MapPin className="w-3.5 h-3.5 text-blue-700 shrink-0" aria-hidden="true" />
              <span>যাত্রার রুট ও সময়সূচি</span>
            </div>
            <p className="font-display text-lg font-bold text-slate-900 break-words">
              {booking.trip
                ? `${booking.trip.route_from} → ${booking.trip.route_to}`
                : 'নির্ধারিত রুট'}
            </p>
            <p className="text-xs text-slate-600 tabular-nums">
              {tripDt
                ? `যাত্রার তারিখ ও সময়: ${tripDt.date} · ${tripDt.time}`
                : 'কাউন্টার সময়সূচি অনুযায়ী'}
            </p>
          </div>

          {/* Passenger, Boarding & Destination Grid */}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <div className="min-w-0">
              <dt className="text-slate-500">যাত্রীর নাম</dt>
              <dd className="font-semibold text-slate-900 text-sm mt-0.5 break-words">
                {booking.passenger_name}
              </dd>
            </div>

            <div className="min-w-0">
              <dt className="text-slate-500">মোবাইল নম্বর</dt>
              <dd className="font-mono font-semibold text-slate-900 text-sm tabular-nums mt-0.5 break-words">
                {booking.phone}
              </dd>
            </div>

            <div className="min-w-0">
              <dt className="text-slate-500">বোর্ডিং পয়েন্ট</dt>
              <dd className="font-semibold text-slate-800 mt-0.5 break-words">
                {booking.boarding_point || 'প্রধান কাউন্টার'}
              </dd>
            </div>

            <div className="min-w-0">
              <dt className="text-slate-500">গন্তব্য / নামার স্থান</dt>
              <dd className="font-semibold text-slate-800 mt-0.5 break-words">
                {booking.trip?.route_to || 'নির্ধারিত গন্তব্য'}
              </dd>
            </div>
          </dl>

          {/* Dedicated Single Clean Payment Section Below */}
          <div className="pt-2.5 border-t border-dashed border-slate-200 text-xs">
            <p className="text-slate-500">পেমেন্ট মাধ্যম ও TrxID</p>
            <p className="font-medium text-slate-900 mt-0.5 break-words">
              <span>{resolvedMethod}</span>
              {resolvedTrxId ? (
                <>
                  {' · '}
                  <span className="font-mono font-semibold text-blue-700 tabular-nums">
                    TrxID: {resolvedTrxId}
                  </span>
                </>
              ) : null}
            </p>
          </div>

          {/* Selected Seats & Total Fare */}
          <div className="pt-3 border-t border-dashed border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-500">
                নির্বাচিত আসন ({formatBanglaNumber(booking.selected_seats.length)}টি)
              </p>
              <span className="inline-block mt-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 font-mono text-sm font-bold text-emerald-800 tabular-nums break-words">
                {booking.selected_seats.join(', ')}
              </span>
            </div>

            <div className="text-right shrink-0">
              <p className="text-[11px] font-medium text-slate-500">মোট ভাড়া</p>
              <p className="font-mono text-xl font-bold text-blue-700 tabular-nums mt-0.5">
                {formatBDT(booking.total_fare)}
              </p>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 pt-0.5 leading-relaxed">
            টিকিট ইস্যু: {createdDt.date} · {createdDt.time} — যাত্রার অন্তত ২০ মিনিট পূর্বে কাউন্টারে উপস্থিত থাকুন।
          </p>
        </div>

        {/* RIGHT SIDE: Bus Seat Map (Door & Steering Icons + Exact Booked Seat Green Highlight) */}
        <div className="md:col-span-5 relative border-t md:border-t-0 md:border-l border-dashed border-slate-300 bg-gradient-to-b from-slate-50 via-blue-50/35 to-slate-50 p-4 sm:p-5 flex flex-col justify-between gap-3 min-w-0">
          {/* Ticket Perforation Cutout Notches */}
          <span
            aria-hidden="true"
            className="hidden md:block absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-slate-100 border border-slate-200"
          />
          <span
            aria-hidden="true"
            className="hidden md:block absolute -bottom-2.5 -left-2.5 w-5 h-5 rounded-full bg-slate-100 border border-slate-200"
          />
          <span
            aria-hidden="true"
            className="md:hidden absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-slate-100 border border-slate-200"
          />
          <span
            aria-hidden="true"
            className="md:hidden absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-slate-100 border border-slate-200"
          />

          {/* Top Coach Tier + Selected Seat Legend */}
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-bold tracking-wider uppercase text-slate-700 truncate">
              {coachProfile.tierLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono font-bold text-emerald-700 shrink-0 tabular-nums">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" aria-hidden="true" />
              <span>{booking.selected_seats.join(', ')}</span>
            </span>
          </div>

          {/* Compact Bus Cabin Seat Map */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5">
            {/* Cabin Top: Door Icon (Left) & Steering Wheel Icon (Right) */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-dashed border-slate-200 text-[11px] font-medium text-slate-600">
              <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-200">
                <DoorOpen className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden="true" />
                <span>প্রবেশ</span>
              </div>

              <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-700">
                <svg
                  viewBox="0 0 24 24"
                  className="w-3.5 h-3.5 text-slate-700 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="2" />
                  <path d="M12 14v7" />
                  <path d="M10.2 10.8 4.2 8.5" />
                  <path d="M13.8 10.8 19.8 8.5" />
                </svg>
                <span>চালক</span>
              </div>
            </div>

            {/* 2+2 Seat Rows */}
            <div className="space-y-1.5" role="group" aria-label="বাসের আসন বিন্যাস">
              {seatLayout.rows.map((rowNum) => (
                <div
                  key={rowNum}
                  className="grid grid-cols-[1fr_1fr_18px_1fr_1fr] items-center gap-1.5"
                >
                  {renderSeatTile(rowNum, 0)}
                  {renderSeatTile(rowNum, 1)}
                  <span className="text-[10px] font-mono text-slate-300 tabular-nums text-center">
                    {rowNum}
                  </span>
                  {renderSeatTile(rowNum, 2)}
                  {renderSeatTile(rowNum, 3)}
                </div>
              ))}
            </div>
          </div>

          {/* Verification Seal */}
          <p className="text-[10px] font-bold tracking-wider uppercase text-center text-slate-500 tabular-nums">
            DESH TRAVELS • VERIFIED E-TICKET · {shortId}
          </p>
        </div>
      </div>
    </article>
  );
}
