import React, { useState } from 'react';
import { Check, CheckCircle2, Clock, Download, Phone, Printer, Ticket, X } from 'lucide-react';
import { formatBanglaDateTime, formatBanglaNumber, formatBDT, formatShortTicketId } from '../lib/format';
import { downloadTicketPng, getTicketPaymentMeta } from '../lib/ticketDownload';
import type { Booking } from '../types';
import { ConfirmedETicketCard } from './ConfirmedETicketCard';
import { StatusBadge } from './StatusBadge';

interface TicketSlipModalProps {
  booking: Booking;
  organizationName: string;
  organizationLogoUrl?: string;
  onClose: () => void;
  onConfirm?: () => void;
  onCancelRelease?: () => void;
  busy?: boolean;
  hideDownloadWhenPending?: boolean;
  fallbackCounterPhone?: string;
}

export function TicketSlipModal({
  booking,
  organizationName,
  organizationLogoUrl,
  onClose,
  onConfirm,
  onCancelRelease,
  busy = false,
  hideDownloadWhenPending = false,
  fallbackCounterPhone,
}: TicketSlipModalProps) {
  const tripDt = booking.trip ? formatBanglaDateTime(booking.trip.departure_time) : null;
  const createdDt = formatBanglaDateTime(booking.created_at);
  const fallbackMeta = getTicketPaymentMeta(booking.id);
  const resolvedMethod = booking.payment_method?.trim() || fallbackMeta?.method || '';
  const resolvedTrxId = booking.trx_id?.trim() || fallbackMeta?.reference || '';
  const paymentMeta = resolvedMethod
    ? { method: resolvedMethod, reference: resolvedTrxId || undefined }
    : null;
  const shortId = formatShortTicketId(booking.id);
  const counterPhone = (booking.trip?.counter_phone || fallbackCounterPhone || '01711004422').trim();
  const telHref = `tel:${counterPhone.replace(/[^0-9+]/g, '') || counterPhone}`;
  const canDownload = !hideDownloadWhenPending || booking.status === 'confirmed';
  const isConfirmed = booking.status === 'confirmed';
  const [downloading, setDownloading] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);

  const handleDownloadTicket = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const started = await downloadTicketPng(booking, organizationName, paymentMeta);
      if (started) {
        setDownloadStarted(true);
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-slip-title"
    >
      <div
        className={`bg-white w-full ${
          isConfirmed ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        } max-h-[92vh] rounded-t-2xl sm:rounded-2xl border border-slate-200 flex flex-col overflow-hidden`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <Ticket className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="ticket-slip-title" className="font-display text-base font-bold text-slate-900 truncate">
                {isConfirmed ? 'অনুমোদিত ই-টিকিট' : 'টিকিট সামারি ও স্লিপ'}
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
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 bg-slate-50/70">
          {isConfirmed ? (
            <ConfirmedETicketCard
              booking={booking}
              organizationName={organizationName}
              organizationLogoUrl={organizationLogoUrl}
              paymentMeta={paymentMeta}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-dashed border-slate-300">
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-500">টিকিট / বুকিং আইডি</p>
                  <p className="font-mono text-base font-bold text-slate-900 tabular-nums mt-0.5 break-words">
                    {shortId}
                  </p>
                </div>
                <div className="min-w-0 sm:text-right">
                  <p className="text-[11px] text-slate-500">কাউন্টার ও বাসের ধরন</p>
                  <p className="text-xs font-semibold text-blue-700 mt-0.5 break-words">
                    {booking.trip
                      ? `${booking.trip.counter_name} · ${booking.trip.bus_type}`
                      : 'নির্ধারিত কাউন্টার'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pb-2 border-b border-dashed border-slate-300">
                <span className="text-xs text-slate-500">বুকিং অবস্থা</span>
                <StatusBadge status={booking.status} />
              </div>

              {booking.trip && (
                <div className="pb-3 border-b border-dashed border-slate-300 space-y-1">
                  <p className="font-display text-lg font-bold text-slate-900">
                    {booking.trip.route_from} → {booking.trip.route_to}
                  </p>
                  <p className="text-xs text-slate-600 tabular-nums">
                    {tripDt ? `${tripDt.date} · ${tripDt.time}` : booking.trip.departure_time}
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
                    <dt className="text-slate-500">পেমেন্ট মাধ্যম ও TrxID</dt>
                    <dd className="font-medium text-slate-800 mt-0.5">
                      {paymentMeta.method}
                      {paymentMeta.reference ? (
                        <>
                          {' · '}
                          <span className="font-mono font-semibold text-slate-900">
                            TrxID: {paymentMeta.reference}
                          </span>
                        </>
                      ) : (
                        ''
                      )}
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
          )}
          {!canDownload && booking.status === 'pending' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-start gap-2 text-xs text-amber-900">
                <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="font-medium leading-relaxed">
                  কাউন্টার থেকে পেমেন্ট যাচাইয়ের পর টিকিট ডাউনলোড অপশন চালু হবে।
                </p>
              </div>
              <a
                href={telHref}
                className="w-full min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Phone className="w-4 h-4" aria-hidden="true" />
                <span>কল নাও (Call Now) · {counterPhone}</span>
              </a>
            </div>
          )}
          {downloadStarted && (
            <div
              role="status"
              className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-emerald-900"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="font-semibold leading-relaxed">
                টিকিট ডাউনলোড শুরু হয়েছে! আপনার ফোনের Gallery / Downloads ফোল্ডারে ছবিটি চেক করুন।
              </p>
            </div>
          )}
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
                <span>অনুমোদন করুন (Approve)</span>
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
                <span>বাতিল করুন (Cancel)</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {canDownload && (
              <>
                <button
                  type="button"
                  disabled={downloading}
                  onClick={handleDownloadTicket}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-60 border border-blue-200 rounded-lg inline-flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {downloading ? 'ডাউনলোড হচ্ছে...' : 'টিকিট ডাউনলোড করুন (Download Ticket)'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" aria-hidden="true" />
                  <span>প্রিন্ট</span>
                </button>
              </>
            )}
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
