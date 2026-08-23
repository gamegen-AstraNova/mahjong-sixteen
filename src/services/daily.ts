const RESET_OFFSET_MS = 4 * 60 * 60 * 1000;

export function taipeiDailyKey(now = new Date()): string {
  const shifted = new Date(now.getTime() - RESET_OFFSET_MS);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(shifted);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}
