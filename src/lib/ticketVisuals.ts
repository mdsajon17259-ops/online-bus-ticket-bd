export interface CoachVisualProfile {
  tierLabel: string;
  tierBangla: string;
  accentHex: string;
  darkHex: string;
  badgeBgClass: string;
  badgeTextClass: string;
  hasAcPod: boolean;
}

export function getCoachVisualProfile(busType?: string): CoachVisualProfile {
  const raw = (busType || '').toLowerCase();
  const isNonAc = raw.includes('নন-এসি') || raw.includes('non-ac') || raw.includes('non ac');
  const isBusiness =
    !isNonAc &&
    (raw.includes('বিজনেস') ||
      raw.includes('business') ||
      raw.includes('স্লিপার') ||
      raw.includes('sleeper') ||
      raw.includes('ভিআইপি') ||
      raw.includes('vip'));
  const isAc = !isNonAc && (isBusiness || raw.includes('এসি') || raw.includes('ac'));

  if (isBusiness) {
    return {
      tierLabel: 'AC BUSINESS COACH',
      tierBangla: 'এসি বিজনেস ক্লাস',
      accentHex: '#1d4ed8',
      darkHex: '#0f172a',
      badgeBgClass: 'bg-blue-900 text-white',
      badgeTextClass: 'text-blue-700',
      hasAcPod: true,
    };
  }

  if (isAc) {
    return {
      tierLabel: 'AC LUXURY COACH',
      tierBangla: 'এসি লাক্সারি কোচ',
      accentHex: '#0369a1',
      darkHex: '#0c4a6e',
      badgeBgClass: 'bg-sky-900 text-white',
      badgeTextClass: 'text-sky-700',
      hasAcPod: true,
    };
  }

  return {
    tierLabel: 'EXPRESS COACH',
    tierBangla: 'এক্সপ্রেস কোচ',
    accentHex: '#0f766e',
    darkHex: '#134e4a',
    badgeBgClass: 'bg-teal-900 text-white',
    badgeTextClass: 'text-teal-700',
    hasAcPod: false,
  };
}

export interface TicketSeatLayout {
  bookedSeatSet: Set<string>;
  rows: number[];
  totalSeats: number;
}

/**
 * Builds the 2+2 coach seat map for the e-ticket card and strictly highlights
 * ONLY the exact seat(s) booked in this specific ticket.
 */
export function buildTicketSeatLayout(
  selectedSeats: string[],
  tripTotalSeats?: number
): TicketSeatLayout {
  const bookedSeatSet = new Set(
    (selectedSeats || [])
      .map((seat) => seat.trim().toUpperCase())
      .filter(Boolean)
  );

  let maxSelectedRow = 0;
  bookedSeatSet.forEach((seat) => {
    const match = seat.match(/^[A-Z]+(\d+)$/);
    if (match) {
      const rowNum = parseInt(match[1], 10);
      if (!Number.isNaN(rowNum)) {
        maxSelectedRow = Math.max(maxSelectedRow, rowNum);
      }
    }
  });

  const baseSeats = tripTotalSeats && tripTotalSeats >= 8 ? tripTotalSeats : 36;
  const rowCount = Math.max(Math.ceil(baseSeats / 4), maxSelectedRow, 9);
  const totalSeats = Math.max(baseSeats, maxSelectedRow * 4);
  const rows = Array.from({ length: rowCount }, (_, i) => i + 1);

  return {
    bookedSeatSet,
    rows,
    totalSeats,
  };
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Generates a deterministic scannable-style QR grid with 3 finder patterns
 * seeded from the booking ID so each ticket displays a consistent graphic.
 */
export function generateQrMatrix(seed: string, size = 15): boolean[][] {
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  let state = hashSeed(seed || 'DESH-TRAVELS') || 13579;

  const nextBit = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100) < 52;
  };

  const drawFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 5; r += 1) {
      for (let c = 0; c < 5; c += 1) {
        const isBorder = r === 0 || r === 4 || c === 0 || c === 4;
        const isCenter = r === 2 && c === 2;
        grid[r0 + r][c0 + c] = isBorder || isCenter;
      }
    }
  };

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      grid[r][c] = nextBit();
    }
  }

  const clearArea = (r0: number, c0: number, h: number, w: number) => {
    for (let r = r0; r < r0 + h; r += 1) {
      for (let c = c0; c < c0 + w; c += 1) {
        if (r >= 0 && r < size && c >= 0 && c < size) {
          grid[r][c] = false;
        }
      }
    }
  };

  clearArea(0, 0, 6, 6);
  clearArea(0, size - 6, 6, 6);
  clearArea(size - 6, 0, 6, 6);

  drawFinder(0, 0);
  drawFinder(0, size - 5);
  drawFinder(size - 5, 0);

  return grid;
}

export interface BarcodeBar {
  width: number;
  gap: number;
}

export function generateBarcodeBars(seed: string, count = 28): BarcodeBar[] {
  let state = hashSeed(`BAR-${seed || 'DESH'}`) || 97531;
  const bars: BarcodeBar[] = [];
  for (let i = 0; i < count; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const v = state >>> 0;
    const width = i === 0 || i === count - 1 ? 2 : (v % 3) + 1;
    const gap = ((v >> 3) % 2) + 1;
    bars.push({ width, gap });
  }
  return bars;
}
