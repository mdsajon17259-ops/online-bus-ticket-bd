import React from 'react';
import { Check, Download, Printer, Ticket, X } from 'lucide-react';
import { formatBanglaDateTime, formatBanglaNumber, formatBDT } from '../lib/format';
import { downloadTicketPng, getTicketPaymentMeta } from '../lib/ticketDownload';
import type { Booking } from '../types';
import { StatusBadge } from './StatusBadge';

interface TicketSlipModalProps {
  booking: Booking;
  organizationName: string;
  onClose: () => void;
  onConfirm?: () => void;
  onCancelRelease?: () => void;
  busy?: boolean;
}

export function TicketSlipModal({
  booking,
  organizationName,
  onClose,
  onConfirm,
  onCancelRelease,
  busy = false,
}: TicketSlipModalProps) {
  const tripDt = booking.trip ? formatBanglaDateTime(booking.trip.departure_time) : null;
  const createdDt = formatBanglaDateTime(booking.created_at);
  const paymentMeta = getTicketPaymentMeta(booking.id);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-slip-title"
    >
      <div className="bg-white w-full sm:max-w-lg max-h-[92vh] rounded-t-2xl sm:rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <Ticket className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="ticket-slip-title" className="font-display text-base font-bold text-slate-900 truncate">
                টিকিট সামারি ও স্লিপ
              </h2>
              <p className="text-xs text-slate-500 truncate">{organizationName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="বন্ধ করুন"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Ticket Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-dashed border-slate-300">
              <div>
                <p className="text-[11px] text-slate-500">টিকিট / বুকিং নম্বর</p>
                <p className="font-mono text-sm font-bold text-slate-900 tabular-nums break-all">
                  {booking.id}
                </p>
              </div>
              <StatusBadge status={booking.status} />
            </div>

            {booking.trip && (
              <div className="pb-3 border-b border-dashed border-slate-300 space-y-1">
                <p className="text-xs font-medium text-blue-700">{booking.trip.counter_name}</p>
                <p className="font-display text-lg font-bold text-slate-900">
                  {booking.trip.route_from} → {booking.trip.route_to}
                </p>
                <p className="text-xs text-slate-600 tabular-nums">
                  {tripDt ? `${tripDt.date} · ${tripDt.time}` : booking.trip.departure_time} ·{' '}
                  {booking.trip.bus_type}
                </p>
              </div>
            )}

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-slate-500">যাত্রীর নাম</dt>
                <dd className="font-semibold text-slate-900 mt-0.5 text-sm">
                  {booking.passenger_name}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">মোবাইল নম্বর</dt>
                <dd className="font-mono font-semibold text-slate-900 mt-0.5 text-sm tabular-nums">
                  {booking.phone}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">বোর্ডিং পয়েন্ট</dt>
                <dd className="font-medium text-slate-800 mt-0.5">
                  {booking.boarding_point || 'প্রধান কাউন্টার'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">বুকিংয়ের সময়</dt>
                <dd className="font-mono text-slate-700 mt-0.5 tabular-nums">
                  {createdDt.date} · {createdDt.time}
                </dd>
              </div>
              {paymentMeta && (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500">পেমেন্ট বিবরণ</dt>
                  <dd className="font-medium text-slate-800 mt-0.5">
                    {paymentMeta.method}
                    {paymentMeta.reference ? ` (${paymentMeta.reference})` : ''}
                  </dd>
                </div>
              )}
            </dl>

            <div className="pt-3 border-t border-dashed border-slate-300 flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] text-slate-500">
                  নির্বাচিত সিট ({formatBanglaNumber(booking.selected_seats.length)}টি)
                </p>
                <p className="font-mono text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                  {booking.selected_seats.join(', ')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-500">মোট ভাড়া</p>
                <p className="font-mono text-xl font-bold text-blue-700 tabular-nums">
                  {formatBDT(booking.total_fare)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {onConfirm && booking.status !== 'confirmed' && (
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>যাচাই ও নিশ্চিত করুন</span>
              </button>
            )}
            {onCancelRelease && booking.status !== 'cancelled' && (
              <button
                type="button"
                disabled={busy}
                onClick={onCancelRelease}
                className="min-h-[44px] px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5"
              >
                <X className="w-4 h-4" aria-hidden="true" />
                <span>বাতিল ও সিট ছাড়ুন</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => downloadTicketPng(booking, organizationName, paymentMeta)}
              className="min-h-[44px] px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg inline-flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>টিকিট ডাউনলোড</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
              <span>প্রিন্ট</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
            >
              বন্ধ করুন
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
