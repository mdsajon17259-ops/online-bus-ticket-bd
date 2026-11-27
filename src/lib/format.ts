export function formatBDT(amount: number | string): string {
  const num = Number(amount) || 0;
  return `৳${Math.round(num).toLocaleString('bn-BD')}`;
}

export function formatBanglaNumber(value: number | string): string {
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString('bn-BD');
}

export function formatBanglaDateTime(iso: string): { time: string; date: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { time: iso, date: '' };
  return {
    time: d.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' }),
    date: d.toLocaleDateString('bn-BD', { weekday: 'short', month: 'short', day: 'numeric' }),
  };
}

export const BANGLADESH_DISTRICTS = [
  'ঢাকা',
  'চট্টগ্রাম',
  'কক্সবাজার',
  'সিলেট',
  'রাজশাহী',
  'খুলনা',
  'রংপুর',
  'বরিশাল',
  'ময়মনসিংহ',
  'কুমিল্লা',
  'বগুড়া',
  'যশোর',
];

export function formatShortTicketId(id?: string | null): string {
  const clean = (id || '').trim();
  if (!clean) return '—';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(clean)) {
    return `#${clean.slice(0, 8).toUpperCase()}`;
  }
  const withoutHash = clean.startsWith('#') ? clean.slice(1) : clean;
  if (withoutHash.length > 14) {
    return `#${withoutHash.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  }
  return `#${withoutHash.toUpperCase()}`;
}
