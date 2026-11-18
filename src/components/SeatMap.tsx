import React from 'react';
import { Check, Lock } from 'lucide-react';
import type { Seat } from '../types';

interface SeatMapProps {
  seats: Seat[];
  selectedSeats: string[];
  onToggleSeat?: (seatNumber: string) => void;
  readOnly?: boolean;
}

export function SeatMap({
  seats,
  selectedSeats,
  onToggleSeat,
  readOnly = false,
}: SeatMapProps) {
  // Organize seats into rows of 4 (A, B | aisle | C, D)
  const seatLookup = new Map<string, Seat>();
  seats.forEach((s) => seatLookup.set(s.seat_number, s));

  const maxRow = seats.reduce((max, s) => {
    const rowNum = parseInt(s.seat_number.slice(1), 10);
    return Number.isNaN(rowNum) ? max : Math.max(max, rowNum);
  }, 0);

  const rows = Array.from({ length: maxRow }, (_, i) => i + 1);

  const renderSeatButton = (seatNumber: string) => {
    const seat = seatLookup.get(seatNumber);
    if (!seat) {
      return <div key={seatNumber} className="w-11 h-11" aria-hidden="true" />;
    }

    const isBooked = seat.status === 'booked';
    const isSelected = selectedSeats.includes(seatNumber);

    let stateClasses =
      'bg-white border-slate-300 text-slate-800 hover:border-blue-700 hover:bg-blue-50 cursor-pointer';
    if (isBooked) {
      stateClasses =
        'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed';
    } else if (isSelected) {
      stateClasses =
        'bg-blue-700 border-blue-700 text-white shadow-sm cursor-pointer';
    } else if (readOnly) {
      stateClasses = 'bg-white border-slate-300 text-slate-700 cursor-default';
    }

    return (
      <button
        key={seatNumber}
        type="button"
        disabled={isBooked || readOnly}
        onClick={() => !isBooked && !readOnly && onToggleSeat?.(seatNumber)}
        aria-label={`Seat ${seatNumber} - ${isBooked ? 'Booked' : isSelected ? 'Selected' : 'Available'}`}
        aria-pressed={isSelected}
        className={`relative min-w-[44px] min-h-[44px] rounded-lg border text-xs font-mono font-medium tabular-nums flex flex-col items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-1 ${stateClasses}`}
      >
        <span>{seatNumber}</span>
        {isBooked && <Lock className="w-2.5 h-2.5 mt-0.5 opacity-70" aria-hidden="true" />}
        {isSelected && <Check className="w-2.5 h-2.5 mt-0.5" aria-hidden="true" />}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-5 text-xs text-slate-600 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded border border-slate-300 bg-white inline-block" aria-hidden="true" />
          <span>Available</span>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded border border-blue-700 bg-blue-700 inline-flex items-center justify-center text-white" aria-hidden="true">
              <Check className="w-3 h-3" />
            </span>
            <span>Selected</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded border border-slate-200 bg-slate-100 inline-flex items-center justify-center text-slate-400" aria-hidden="true">
            <Lock className="w-2.5 h-2.5" />
          </span>
          <span>Booked</span>
        </div>
      </div>

      {/* Coach Cabin Grid */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 max-w-[340px] mx-auto">
        {/* Front Driver & Entry Door Row */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-dashed border-slate-300 text-[11px] font-medium text-slate-500">
          <span className="px-2 py-1 rounded bg-white border border-slate-200">Entry Door</span>
          <span className="px-2 py-1 rounded bg-slate-200/70 text-slate-700">Driver Cabin</span>
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
                {rowNum}
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
