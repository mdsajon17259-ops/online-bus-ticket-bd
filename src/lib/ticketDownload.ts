import { formatBanglaDateTime, formatBanglaNumber, formatBDT } from './format';
import type { Booking } from '../types';

export interface TicketPaymentMeta {
  method: string;
  reference?: string;
}

const PAYMENT_META_KEY = 'desh_travels_payment_meta_v1';

export function saveTicketPaymentMeta(bookingId: string, meta: TicketPaymentMeta): void {
  try {
    const raw = localStorage.getItem(PAYMENT_META_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, TicketPaymentMeta>) : {};
    map[bookingId] = meta;
    localStorage.setItem(PAYMENT_META_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors in restricted WebViews
  }
}

export function getTicketPaymentMeta(bookingId: string): TicketPaymentMeta | null {
  try {
    const raw = localStorage.getItem(PAYMENT_META_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, TicketPaymentMeta>;
    return map[bookingId] || null;
  } catch {
    return null;
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function downloadTicketPng(
  booking: Booking,
  organizationName: string,
  paymentMeta?: TicketPaymentMeta | null
): void {
  const meta = paymentMeta ?? getTicketPaymentMeta(booking.id);
  const width = 1080;
  const height = 740;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    window.print();
    return;
  }

  // Outer canvas background
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, width, height);

  // Main ticket card
  const cardX = 40;
  const cardY = 40;
  const cardW = width - 80;
  const cardH = height - 80;

  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();
  ctx.restore();

  // Top Header Band
  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, 132, 24);
  ctx.clip();
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(cardX, cardY, cardW, 132);
  ctx.restore();
  // Square off bottom corners of header band
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(cardX, cardY + 100, cardW, 32);

  // Header Brand & Subtitle
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px "Hind Siliguri", "Plus Jakarta Sans", sans-serif';
  ctx.fillText(organizationName || 'দেশ ভ্রমণ / Desh Travels', cardX + 36, cardY + 58);

  ctx.fillStyle = '#dbeafe';
  ctx.font = '500 18px "Hind Siliguri", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('অনলাইন বাস ই-টিকিট (Online Bus E-Ticket)', cardX + 36, cardY + 94);

  // Status Badge in Header
  const statusText =
    booking.status === 'confirmed'
      ? 'নিশ্চিত (Confirmed)'
      : booking.status === 'cancelled'
        ? 'বাতিল (Cancelled)'
        : 'অপেক্ষমাণ (Pending)';
  const statusBg =
    booking.status === 'confirmed'
      ? '#059669'
      : booking.status === 'cancelled'
        ? '#e11d48'
        : '#d97706';

  ctx.save();
  drawRoundedRect(ctx, cardX + cardW - 260, cardY + 38, 224, 52, 12);
  ctx.fillStyle = statusBg;
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px "Hind Siliguri", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(statusText, cardX + cardW - 148, cardY + 70);
  ctx.textAlign = 'left';

  // Booking Reference & Route Banner
  const bodyX = cardX + 36;
  let y = cardY + 184;

  ctx.fillStyle = '#64748b';
  ctx.font = '600 15px "Hind Siliguri", sans-serif';
  ctx.fillText('টিকিট / বুকিং আইডি', bodyX, y);
  ctx.fillText('কাউন্টার ও বাসের ধরন', bodyX + 360, y);

  y += 30;
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 26px "JetBrains Mono", monospace';
  ctx.fillText(booking.id, bodyX, y);

  ctx.font = 'bold 22px "Hind Siliguri", sans-serif';
  const counterLabel = booking.trip
    ? `${booking.trip.counter_name} · ${booking.trip.bus_type}`
    : 'নির্ধারিত কাউন্টার';
  ctx.fillText(counterLabel, bodyX + 360, y);

  // Route & Time Box
  y += 30;
  ctx.save();
  drawRoundedRect(ctx, bodyX, y, cardW - 72, 92, 14);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();
  ctx.restore();

  const tripDt = booking.trip ? formatBanglaDateTime(booking.trip.departure_time) : null;
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 28px "Hind Siliguri", sans-serif';
  const routeTitle = booking.trip
    ? `${booking.trip.route_from}  →  ${booking.trip.route_to}`
    : 'যাত্রার রুট';
  ctx.fillText(routeTitle, bodyX + 24, y + 40);

  ctx.fillStyle = '#475569';
  ctx.font = '500 18px "Hind Siliguri", sans-serif';
  const timeSubtitle = tripDt
    ? `যাত্রার তারিখ ও সময়: ${tripDt.date} · ${tripDt.time}`
    : 'সময়সূচি কাউন্টার অনুযায়ী';
  ctx.fillText(timeSubtitle, bodyX + 24, y + 72);

  // Two-column Details Grid
  y += 132;
  const col1 = bodyX;
  const col2 = bodyX + 340;
  const col3 = bodyX + 680;

  ctx.fillStyle = '#64748b';
  ctx.font = '600 15px "Hind Siliguri", sans-serif';
  ctx.fillText('যাত্রীর নাম', col1, y);
  ctx.fillText('মোবাইল নম্বর', col2, y);
  ctx.fillText('বোর্ডিং পয়েন্ট', col3, y);

  y += 28;
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 21px "Hind Siliguri", sans-serif';
  ctx.fillText(booking.passenger_name, col1, y);
  ctx.font = 'bold 21px "JetBrains Mono", monospace';
  ctx.fillText(booking.phone, col2, y);
  ctx.font = '600 19px "Hind Siliguri", sans-serif';
  ctx.fillText((booking.boarding_point || 'প্রধান কাউন্টার').slice(0, 26), col3, y);

  // Seats, Payment & Fare Row
  y += 58;
  ctx.fillStyle = '#64748b';
  ctx.font = '600 15px "Hind Siliguri", sans-serif';
  ctx.fillText(`নির্বাচিত আসন (${formatBanglaNumber(booking.selected_seats.length)}টি)`, col1, y);
  ctx.fillText('পেমেন্ট মাধ্যম', col2, y);
  ctx.fillText('মোট ভাড়া', col3, y);

  y += 32;
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 24px "JetBrains Mono", monospace';
  ctx.fillText(booking.selected_seats.join(', '), col1, y);

  ctx.font = '600 19px "Hind Siliguri", sans-serif';
  const paymentLabel = meta
    ? meta.reference
      ? `${meta.method} (${meta.reference})`
      : meta.method
    : 'কাউন্টার / অনলাইন পেমেন্ট';
  ctx.fillText(paymentLabel.slice(0, 28), col2, y);

  ctx.fillStyle = '#1d4ed8';
  ctx.font = 'bold 28px "JetBrains Mono", "Hind Siliguri", sans-serif';
  ctx.fillText(formatBDT(booking.total_fare), col3, y);

  // Dashed divider & Footer Note
  y += 46;
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bodyX, y);
  ctx.lineTo(cardX + cardW - 36, y);
  ctx.stroke();
  ctx.restore();

  const createdDt = formatBanglaDateTime(booking.created_at);
  ctx.fillStyle = '#475569';
  ctx.font = '500 15px "Hind Siliguri", sans-serif';
  ctx.fillText(
    `টিকিট ইস্যু: ${createdDt.date} · ${createdDt.time}  |  যাত্রার অন্তত ২০ মিনিট পূর্বে কাউন্টারে উপস্থিত থাকুন।`,
    bodyX,
    y + 36
  );

  // Trigger clean file download
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `Desh-Travels-Ticket-${booking.id}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
