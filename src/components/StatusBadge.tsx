import React from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { BookingStatus } from '../types';

export function StatusBadge({ status }: { status: BookingStatus }) {
  if (status === 'confirmed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>অনুমোদিত / Confirmed</span>
      </span>
    );
  }

  if (status === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 whitespace-nowrap">
        <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>বাতিল / Cancelled</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>যাচাই চলমান / Pending</span>
    </span>
  );
}
