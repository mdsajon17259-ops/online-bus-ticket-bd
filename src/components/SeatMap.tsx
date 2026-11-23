import React from 'react';
import { Check, Clock, Lock } from 'lucide-react';
import { formatBanglaNumber } from '../lib/format';
import type { Seat } from '../types';

interface SeatMapProps {
  seats: Seat[];
  selectedSeats: string[];
  pendingSeats?: string[];
  showPendingLegend?: boolean;
  onToggleSeat?: (seatNumber: string) => void;
  readOnly?: boolean;
  allowBookedClick?: boolean;
}

export function SeatMap({
  seats,
  selectedSeats,
  pendingSeats = [],
  showPendingLegend = false,
  onToggleSeat,
  readOnly = false,
  allowBookedClick = false,
}: SeatMapProps) {
  const seatLookup = new Map<string, Seat>();
  seats.forEach((s) => seatLookup.set(s.seat_number, s));

  const pendingSet = new Set(pendingSeats);

  const maxRow = seats.reduce((max, s) => {
    const rowNum = parseInt(s.seat_number.slice(1), 10);
    return Number.isNaN(rowNum) ? max : Math.max(max, rowNum);
  }, 0);

  const rows = Array.from({ length: maxRow }, (_, i) => i + 1);
  const displayPendingLegend = showPendingLegend || pendingSet.size > 0;

  const renderSeatButton = (seatNumber: string) => {
    const seat = seatLookup.get(seatNumber);
    if (!seat) {
      return <div key={seatNumber} className="w-11 h-11" aria-hidden="true" />;
    }

    const isBooked = seat.status === 'booked';
    const isPending = isBooked && pendingSet.has(seatNumber);
    const isConfirmedBooked = isBooked && !isPending;
    const isSelected = !isBooked && selectedSeats.includes(seatNumber);
    const isDisabled = readOnly || (isBooked && !allowBookedClick);

    let stateClasses =
      'bg-white border-slate-300 text-slate-800 hover:border-blue-700 hover:bg-blue-50 cursor-pointer';
    if (isPending && allowBookedClick && !readOnly) {
      stateClasses =
        'bg-amber-50 border-amber-400 text-amber-900 hover:bg-amber-100 cursor-pointer';
    } else if (isPending) {
      stateClasses = readOnly
        ? 'bg-amber-50 border-amber-400 text-amber-900 cursor-default'
        : 'bg-amber-50 border-amber-400 text-amber-900 cursor-not-allowed';
    } else if (isConfirmedBooked && allowBookedClick && !readOnly) {
      stateClasses =
        'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100 cursor-pointer';
    } else if (isConfirmedBooked && (displayPendingLegend || readOnly)) {
      stateClasses = readOnly
        ? 'bg-rose-50 border-rose-300 text-rose-800 cursor-default'
        : 'bg-rose-50 border-rose-300 text-rose-800 cursor-not-allowed';
    } else if (isConfirmedBooked) {
      stateClasses =
        'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed';
    } else if (isSelected) {
      stateClasses =
        'bg-blue-700 border-blue-700 text-white shadow-sm cursor-pointer';
    } else if (readOnly) {
      stateClasses = 'bg-white border-slate-300 text-slate-700 cursor-default';
    }

    const statusLabel = isPending
      ? 'যাচাইয়ের অপেক্ষায় (অপেক্ষমাণ)'
      : isConfirmedBooked
        ? 'কাটা / নিশ্চিত বুকড'
        : isSelected
          ? 'নির্বাচিত'
          : 'খালি আছে';

    return (
      <button
        key={seatNumber}
        type="button"
        disabled={isDisabled}
        onClick={() => !isDisabled && onToggleSeat?.(seatNumber)}
        aria-label={`আসন ${seatNumber} - ${statusLabel}`}
        aria-pressed={isSelected}
        className={`relative min-w-[44px] min-h-[44px] rounded-lg border text-xs font-mono font-medium tabular-nums flex flex-col items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-1 ${stateClasses}`}
      >
        <span>{seatNumber}</span>
        {isPending && <Clock className="w-2.5 h-2.5 mt-0.5 text-amber-700" aria-hidden="true" />}
        {isConfirmedBooked && <Lock className="w-2.5 h-2.5 mt-0.5 opacity-80" aria-hidden="true" />}
        {isSelected && <Check className="w-2.5 h-2.5 mt-0.5" aria-hidden="true" />}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded border border-slate-300 bg-white inline-block" aria-hidden="true" />
          <span>খালি সিট</span>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded border border-blue-700 bg-blue-700 inline-flex items-center justify-center text-white" aria-hidden="true">
              <Check className="w-3 h-3" />
            </span>
            <span>নির্বাচিত</span>
          </div>
        )}
        {displayPendingLegend && (
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded border border-amber-400 bg-amber-50 inline-flex items-center justify-center text-amber-800" aria-hidden="true">
              <Clock className="w-3 h-3" />
            </span>
            <span>যাচাইয়ের অপেক্ষায়</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-5 h-5 rounded border inline-flex items-center justify-center ${
              displayPendingLegend || allowBookedClick || readOnly
                ? 'border-rose-300 bg-rose-50 text-rose-700'
                : 'border-slate-200 bg-slate-100 text-slate-400'
            }`}
            aria-hidden="true"
          >
            <Lock className="w-2.5 h-2.5" />
          </span>
          <span>কাটা / নিশ্চিত</span>
        </div>
      </div>

      {/* Coach Cabin Grid (2+2 layout) */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 max-w-[340px] mx-auto">
        {/* Front Door & Driver Cabin */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-dashed border-slate-300 text-[11px] font-medium text-slate-500">
          <span className="px-2 py-1 rounded bg-white border border-slate-200">প্রবেশ দরজা</span>
          <span className="px-2 py-1 rounded bg-slate-200/70 text-slate-700">চালকের আসন</span>
        </div>

        {/* Rows */}
        <div className="space-y-2.5">
          {rows.map((rowNum) => (
            <div key={rowNum} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {renderSeatButton(`A${rowNum}`)}
                {renderSeatButton(`B${rowNum}`)}
              </div>
              <span className="text-[11px] font-mono text-slate-400 tabular-nums w-5 text-center">
                {formatBanglaNumber(rowNum)}
              </span>
              <div className="flex items-center gap-2">
                {renderSeatButton(`C${rowNum}`)}
                {renderSeatButton(`D${rowNum}`)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
