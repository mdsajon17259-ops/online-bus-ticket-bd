import {
  formatBanglaDateTime,
  formatBanglaNumber,
  formatBDT,
  formatShortTicketId,
} from './format';
import {
  buildTicketSeatLayout,
  getCoachVisualProfile,
} from './ticketVisuals';
import type { Booking } from '../types';

export interface TicketPaymentMeta {
  method: string;
  reference?: string;
}

const PAYMENT_META_KEY = 'desh_travels_payment_meta_v1';
const SEAT_COLS = ['A', 'B', 'C', 'D'] as const;

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
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number
) {
  const safe = text || '';
  if (ctx.measureText(safe).width <= maxWidth) {
    ctx.fillText(safe, x, y);
    return;
  }
  let truncated = safe;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  ctx.fillText(`${truncated}…`, x, y);
}

function drawDoorIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Door frame + slightly angled door leaf + handle dot
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy + 6);
  ctx.lineTo(cx + 6, cy + 6);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - 4, cy + 6);
  ctx.lineTo(cx - 4, cy - 5);
  ctx.lineTo(cx + 3, cy - 6);
  ctx.lineTo(cx + 3, cy + 6);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx + 0.8, cy + 0.5, 0.9, 0, Math.PI * 2);
  ctx.fillStyle = '#475569';
  ctx.fill();

  ctx.restore();
}

function drawSteeringWheelIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';

  // Outer rim
  ctx.beginPath();
  ctx.arc(cx, cy, 6.8, 0, Math.PI * 2);
  ctx.stroke();

  // Center hub
  ctx.beginPath();
  ctx.arc(cx, cy, 1.7, 0, Math.PI * 2);
  ctx.stroke();

  // Three spokes
  ctx.beginPath();
  ctx.moveTo(cx, cy + 1.8);
  ctx.lineTo(cx, cy + 6.8);
  ctx.moveTo(cx - 1.5, cy - 0.8);
  ctx.lineTo(cx - 6.1, cy - 2.3);
  ctx.moveTo(cx + 1.5, cy - 0.8);
  ctx.lineTo(cx + 6.1, cy - 2.3);
  ctx.stroke();

  ctx.restore();
}

function triggerDirectPngDownload(canvas: HTMLCanvasElement, filename: string) {
  const triggerLink = (href: string, revokeAfter: boolean) => {
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (revokeAfter) {
      window.setTimeout(() => URL.revokeObjectURL(href), 10000);
    }
  };

  if (typeof canvas.toBlob === 'function') {
    canvas.toBlob((blob) => {
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        triggerLink(objectUrl, true);
      } else {
        triggerLink(canvas.toDataURL('image/png'), false);
      }
    }, 'image/png');
    return;
  }

  triggerLink(canvas.toDataURL('image/png'), false);
}

function renderAndDownloadTicket(
  booking: Booking,
  organizationName: string,
  paymentMeta?: TicketPaymentMeta | null
) {
  const storedMeta = paymentMeta ?? getTicketPaymentMeta(booking.id);
  const meta: TicketPaymentMeta | null =
    booking.payment_method || booking.trx_id
      ? {
          method: booking.payment_method || storedMeta?.method || 'অনলাইন পেমেন্ট',
          reference: booking.trx_id || storedMeta?.reference,
        }
      : storedMeta;

  const logicalW = 1260;
  const logicalH = 740;
  const exportScale = 3; // High-resolution 3780x2220 PNG for crisp gallery saving & printing

  const canvas = document.createElement('canvas');
  canvas.width = logicalW * exportScale;
  canvas.height = logicalH * exportScale;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    window.print();
    return;
  }

  ctx.scale(exportScale, exportScale);

  // Outer backdrop
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, logicalW, logicalH);

  const cardX = 28;
  const cardY = 28;
  const cardW = logicalW - 56; // 1204
  const cardH = logicalH - 56; // 684
  const headerH = 100;
  const splitX = cardX + 756; // 784
  const bannerY = cardY + cardH - 60; // 652
  const bannerH = 44;

  // Main Ticket Card Surface
  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 22);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();
  ctx.restore();

  // Right Panel Subtle Tint (clipped inside card below header)
  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 22);
  ctx.clip();
  const rightGrad = ctx.createLinearGradient(splitX, cardY + headerH, splitX, bannerY);
  rightGrad.addColorStop(0, '#f8fafc');
  rightGrad.addColorStop(0.5, '#eff6ff');
  rightGrad.addColorStop(1, '#f8fafc');
  ctx.fillStyle = rightGrad;
  ctx.fillRect(splitX, cardY + headerH, cardX + cardW - splitX, bannerY - (cardY + headerH) - 6);
  ctx.restore();

  // Top Header Gradient Band
  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, headerH + 20, 22);
  ctx.clip();
  const headerGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY);
  headerGrad.addColorStop(0, '#0f172a');
  headerGrad.addColorStop(0.55, '#172554');
  headerGrad.addColorStop(1, '#1d4ed8');
  ctx.fillStyle = headerGrad;
  ctx.fillRect(cardX, cardY, cardW, headerH);
  ctx.restore();

  // Header Brand Icon Badge
  ctx.save();
  drawRoundedRect(ctx, cardX + 30, cardY + 25, 50, 50, 12);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  drawRoundedRect(ctx, cardX + 42, cardY + 37, 26, 22, 5);
  ctx.fill();
  ctx.fillStyle = '#1d4ed8';
  drawRoundedRect(ctx, cardX + 46, cardY + 41, 18, 9, 2);
  ctx.fill();
  ctx.fillStyle = '#1d4ed8';
  ctx.beginPath();
  ctx.arc(cardX + 49, cardY + 55, 2.2, 0, Math.PI * 2);
  ctx.arc(cardX + 61, cardY + 55, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Header Brand Title & Subtitle
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px "Hind Siliguri", "Plus Jakarta Sans", sans-serif';
  drawFittedText(ctx, organizationName || 'দেশ ভ্রমণ / Desh Travels', cardX + 96, cardY + 49, 740);

  ctx.fillStyle = '#bfdbfe';
  ctx.font = '600 14px "Hind Siliguri", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('অনলাইন বাস ই-টিকিট • E-TICKET', cardX + 96, cardY + 75);

  // Header Status Badge
  const isConfirmed = booking.status === 'confirmed';
  const statusText = isConfirmed
    ? 'অনুমোদিত / Confirmed'
    : booking.status === 'cancelled'
      ? 'বাতিল / Cancelled'
      : 'যাচাই চলমান / Pending';
  const statusBg = isConfirmed ? '#059669' : booking.status === 'cancelled' ? '#e11d48' : '#d97706';

  ctx.save();
  drawRoundedRect(ctx, cardX + cardW - 278, cardY + 27, 248, 46, 12);
  ctx.fillStyle = statusBg;
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px "Hind Siliguri", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(statusText, cardX + cardW - 154, cardY + 56);
  ctx.textAlign = 'left';

  // Vertical Dashed Perforation Line between Left Details & Right Seat Map
  ctx.save();
  ctx.setLineDash([7, 6]);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(splitX, cardY + headerH + 6);
  ctx.lineTo(splitX, bannerY - 12);
  ctx.stroke();
  ctx.restore();

  // ============================================================================
  // LEFT SIDE: PASSENGER & TRIP DETAILS
  // ============================================================================
  const leftX = cardX + 34;
  const leftW = splitX - cardX - 68; // 688
  const shortTicketId = formatShortTicketId(booking.id);

  // Row 1: Booking ID (Left) + Counter & Bus Type (Right)
  let y = cardY + 138;
  ctx.fillStyle = '#64748b';
  ctx.font = '600 13px "Hind Siliguri", sans-serif';
  ctx.fillText('টিকিট / বুকিং আইডি', leftX, y);

  ctx.textAlign = 'right';
  ctx.fillText('কাউন্টার ও বাসের ধরন', splitX - 34, y);
  ctx.textAlign = 'left';

  y += 28;
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 24px "JetBrains Mono", monospace';
  drawFittedText(ctx, shortTicketId, leftX, y, 220);

  ctx.fillStyle = '#1d4ed8';
  ctx.font = 'bold 17px "Hind Siliguri", sans-serif';
  ctx.textAlign = 'right';
  const counterLabel = booking.trip
    ? `${booking.trip.counter_name} · ${booking.trip.bus_type}`
    : 'নির্ধারিত কাউন্টার';
  drawFittedText(ctx, counterLabel, splitX - 34, y, 440);
  ctx.textAlign = 'left';

  // Horizontal dashed divider
  y += 22;
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(leftX, y);
  ctx.lineTo(splitX - 34, y);
  ctx.stroke();
  ctx.restore();

  // Route & Journey Box
  y += 16;
  ctx.save();
  drawRoundedRect(ctx, leftX, y, leftW, 84, 14);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();
  ctx.restore();

  const tripDt = booking.trip ? formatBanglaDateTime(booking.trip.departure_time) : null;
  ctx.fillStyle = '#64748b';
  ctx.font = '600 12px "Hind Siliguri", sans-serif';
  ctx.fillText('যাত্রার রুট ও সময়সূচি', leftX + 18, y + 22);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 24px "Hind Siliguri", sans-serif';
  const routeTitle = booking.trip
    ? `${booking.trip.route_from}  →  ${booking.trip.route_to}`
    : 'নির্ধারিত রুট';
  drawFittedText(ctx, routeTitle, leftX + 18, y + 50, leftW - 36);

  ctx.fillStyle = '#475569';
  ctx.font = '500 14px "Hind Siliguri", sans-serif';
  const timeSubtitle = tripDt
    ? `যাত্রার তারিখ ও সময়: ${tripDt.date} · ${tripDt.time}`
    : 'সময়সূচি কাউন্টার অনুযায়ী';
  drawFittedText(ctx, timeSubtitle, leftX + 18, y + 73, leftW - 36);

  // Passenger Info Row (Name & Mobile)
  const col1 = leftX;
  const col2 = leftX + 352;
  y += 110;

  ctx.fillStyle = '#64748b';
  ctx.font = '600 13px "Hind Siliguri", sans-serif';
  ctx.fillText('যাত্রীর নাম', col1, y);
  ctx.fillText('মোবাইল নম্বর', col2, y);

  y += 25;
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 19px "Hind Siliguri", sans-serif';
  drawFittedText(ctx, booking.passenger_name, col1, y, 330);
  ctx.font = 'bold 19px "JetBrains Mono", monospace';
  drawFittedText(ctx, booking.phone, col2, y, 330);

  // Boarding Point & Destination / Dropping Point Row (NO duplicate payment here)
  y += 38;
  ctx.fillStyle = '#64748b';
  ctx.font = '600 13px "Hind Siliguri", sans-serif';
  ctx.fillText('বোর্ডিং পয়েন্ট', col1, y);
  ctx.fillText('গন্তব্য / নামার স্থান', col2, y);

  y += 25;
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 16px "Hind Siliguri", sans-serif';
  drawFittedText(ctx, booking.boarding_point || 'প্রধান কাউন্টার', col1, y, 330);
  drawFittedText(ctx, booking.trip?.route_to || 'নির্ধারিত গন্তব্য', col2, y, 330);

  // Single Dedicated Clean Payment Row Below Boarding & Destination
  y += 20;
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(leftX, y);
  ctx.lineTo(splitX - 34, y);
  ctx.stroke();
  ctx.restore();

  y += 20;
  ctx.fillStyle = '#64748b';
  ctx.font = '600 13px "Hind Siliguri", sans-serif';
  ctx.fillText('পেমেন্ট মাধ্যম ও TrxID', col1, y);

  y += 24;
  const paymentLabel = meta
    ? meta.reference
      ? `${meta.method} · TrxID: ${meta.reference}`
      : meta.method
    : 'কাউন্টার / অনলাইন পেমেন্ট';
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 15px "Hind Siliguri", "JetBrains Mono", sans-serif';
  drawFittedText(ctx, paymentLabel, col1, y, leftW);

  // Dashed divider above Seats & Fare
  y += 18;
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(leftX, y);
  ctx.lineTo(splitX - 34, y);
  ctx.stroke();
  ctx.restore();

  // Seats & Total Fare Strip
  y += 22;
  ctx.fillStyle = '#64748b';
  ctx.font = '600 13px "Hind Siliguri", sans-serif';
  ctx.fillText(`নির্বাচিত আসন (${formatBanglaNumber(booking.selected_seats.length)}টি)`, col1, y);

  ctx.textAlign = 'right';
  ctx.fillText('মোট ভাড়া', splitX - 34, y);
  ctx.textAlign = 'left';

  // Highlighted green seat pill
  const seatsStr = booking.selected_seats.join(', ');
  ctx.font = 'bold 18px "JetBrains Mono", monospace';
  const measuredSeatsW = Math.min(340, Math.max(96, ctx.measureText(seatsStr).width + 28));
  ctx.save();
  drawRoundedRect(ctx, col1, y + 8, measuredSeatsW, 34, 9);
  ctx.fillStyle = '#ecfdf5';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#a7f3d0';
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#047857';
  drawFittedText(ctx, seatsStr, col1 + 14, y + 31, measuredSeatsW - 28);

  // Total Fare
  ctx.fillStyle = '#1d4ed8';
  ctx.font = 'bold 26px "JetBrains Mono", "Hind Siliguri", sans-serif';
  ctx.textAlign = 'right';
  drawFittedText(ctx, formatBDT(booking.total_fare), splitX - 34, y + 34, 290);
  ctx.textAlign = 'left';

  // Footer issue timestamp note
  const createdDt = formatBanglaDateTime(booking.created_at);
  ctx.fillStyle = '#64748b';
  ctx.font = '500 12.5px "Hind Siliguri", sans-serif';
  drawFittedText(
    ctx,
    `টিকিট ইস্যু: ${createdDt.date} · ${createdDt.time} — যাত্রার অন্তত ২০ মিনিট পূর্বে কাউন্টারে উপস্থিত থাকুন।`,
    leftX,
    bannerY - 22,
    leftW
  );

  // ============================================================================
  // RIGHT SIDE: BUS SEAT MAP (DOOR & STEERING + EXACT GREEN SEAT HIGHLIGHT)
  // ============================================================================
  const rightX = splitX + 28; // 812
  const rightW = cardX + cardW - 28 - rightX; // 392
  const rightCenter = rightX + rightW / 2;

  const coachProfile = getCoachVisualProfile(booking.trip?.bus_type);
  const seatLayout = buildTicketSeatLayout(booking.selected_seats, booking.trip?.total_seats);

  // Top Coach Tier & Selected Seat Legend
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 11.5px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(coachProfile.tierLabel, rightX, cardY + 128);

  ctx.font = 'bold 12px "JetBrains Mono", monospace';
  const legendSeatW = ctx.measureText(seatsStr).width;
  ctx.fillStyle = '#059669';
  drawRoundedRect(ctx, rightX + rightW - legendSeatW - 18, cardY + 118, 10, 10, 2);
  ctx.fill();
  ctx.fillStyle = '#047857';
  ctx.textAlign = 'right';
  ctx.fillText(seatsStr, rightX + rightW, cardY + 128);
  ctx.textAlign = 'left';

  // Bus Cabin Frame
  const busBoxY = cardY + 142; // 170
  const busBoxH = 420; // ends at 590
  ctx.save();
  drawRoundedRect(ctx, rightX, busBoxY, rightW, busBoxH, 14);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();
  ctx.restore();

  // Cabin Top Row: Door Icon (Left) & Steering Wheel Icon (Right)
  const cabinRowY = busBoxY + 12;
  // Door chip (left)
  ctx.save();
  drawRoundedRect(ctx, rightX + 14, cabinRowY, 96, 28, 7);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();
  ctx.restore();
  drawDoorIcon(ctx, rightX + 32, cabinRowY + 14);
  ctx.fillStyle = '#475569';
  ctx.font = '600 12px "Hind Siliguri", sans-serif';
  ctx.fillText('প্রবেশ', rightX + 48, cabinRowY + 18);

  // Steering chip (right)
  const steerChipX = rightX + rightW - 110;
  ctx.save();
  drawRoundedRect(ctx, steerChipX, cabinRowY, 96, 28, 7);
  ctx.fillStyle = '#f1f5f9';
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();
  ctx.restore();
  drawSteeringWheelIcon(ctx, steerChipX + 20, cabinRowY + 14);
  ctx.fillStyle = '#334155';
  ctx.font = '600 12px "Hind Siliguri", sans-serif';
  ctx.fillText('চালক', steerChipX + 36, cabinRowY + 18);

  // Dashed divider under Door & Driver row
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(rightX + 14, busBoxY + 50);
  ctx.lineTo(rightX + rightW - 14, busBoxY + 50);
  ctx.stroke();
  ctx.restore();

  // 2+2 Seat Rows (highlighting ONLY exact booked seat(s) in green)
  const rowCount = seatLayout.rows.length;
  const gridTop = busBoxY + 62;
  const gridAvailH = busBoxY + busBoxH - 12 - gridTop;
  const rowStep = Math.min(38, Math.floor(gridAvailH / rowCount));
  const seatH = Math.max(20, rowStep - 6);
  const seatW = 70;
  const pairGap = 8;
  const aisleW = 34;
  const gridTotalW = seatW * 4 + pairGap * 2 + aisleW; // 330
  const gridStartX = rightX + (rightW - gridTotalW) / 2;

  seatLayout.rows.forEach((rowNum, rowIdx) => {
    const rowY = gridTop + rowIdx * rowStep;
    const xPositions = [
      gridStartX,
      gridStartX + seatW + pairGap,
      gridStartX + seatW * 2 + pairGap + aisleW,
      gridStartX + seatW * 3 + pairGap * 2 + aisleW,
    ];

    // Subtle row number in aisle
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 10.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(rowNum), gridStartX + seatW * 2 + pairGap + aisleW / 2, rowY + seatH / 2 + 4);
    ctx.textAlign = 'left';

    SEAT_COLS.forEach((col, colIdx) => {
      const seatNumber = `${col}${rowNum}`;
      const linearIndex = (rowNum - 1) * 4 + (colIdx + 1);
      const isThisTicketSeat = seatLayout.bookedSeatSet.has(seatNumber);

      if (linearIndex > seatLayout.totalSeats && !isThisTicketSeat) {
        return;
      }

      const sx = xPositions[colIdx];
      ctx.save();
      drawRoundedRect(ctx, sx, rowY, seatW, seatH, 6);
      if (isThisTicketSeat) {
        ctx.fillStyle = '#059669';
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = '#047857';
        ctx.stroke();
      } else {
        ctx.fillStyle = '#f8fafc';
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = '#cbd5e1';
        ctx.stroke();
      }
      ctx.restore();

      ctx.fillStyle = isThisTicketSeat ? '#ffffff' : '#94a3b8';
      ctx.font = isThisTicketSeat
        ? 'bold 12.5px "JetBrains Mono", monospace'
        : '600 11.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(seatNumber, sx + seatW / 2, rowY + seatH / 2 + 4);
      ctx.textAlign = 'left';
    });
  });

  // Verification Seal below Bus Seat Map
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 11px "Plus Jakarta Sans", "JetBrains Mono", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`DESH TRAVELS • VERIFIED E-TICKET · ${shortTicketId}`, rightCenter, bannerY - 22);
  ctx.textAlign = 'left';

  // ============================================================================
  // EXPORT-ONLY RED BOARDING REMINDER BANNER (Appended on PNG export only)
  // ============================================================================
  const bannerX = cardX + 28;
  const bannerW = cardW - 56;
  ctx.save();
  drawRoundedRect(ctx, bannerX, bannerY, bannerW, bannerH, 10);
  ctx.fillStyle = '#fef2f2';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#fca5a5';
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#b91c1c';
  ctx.font = 'bold 14.5px "Hind Siliguri", sans-serif';
  ctx.textAlign = 'center';
  drawFittedText(
    ctx,
    'যাত্রীগণ অনুগ্রহ করে গাড়িতে উঠার আগে এই অনলাইন টিকিটটি কাউন্টারে দেখিয়ে আপনাদের আসল টিকিট সংগ্রহ করুন।',
    cardX + cardW / 2,
    bannerY + 27,
    bannerW - 32
  );
  ctx.textAlign = 'left';

  const cleanId = shortTicketId.replace('#', '').toLowerCase();
  triggerDirectPngDownload(canvas, `desh-travels-ticket-${cleanId}.png`);
}

export function downloadTicketPng(
  booking: Booking,
  organizationName: string,
  paymentMeta?: TicketPaymentMeta | null
): void {
  if (typeof document !== 'undefined' && document.fonts && document.fonts.status !== 'loaded') {
    void Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => window.setTimeout(resolve, 200)),
    ]).then(() => {
      renderAndDownloadTicket(booking, organizationName, paymentMeta);
    });
    return;
  }

  renderAndDownloadTicket(booking, organizationName, paymentMeta);
}
