/**
 * Timezone-safe YYYY-MM-DD calendar date utilities.
 * All date strings are strictly interpreted in local calendar terms without UTC drift.
 */

export const BASELINE_DATE = '2026-11-24';
export const FINAL_EXAM_DATE = '2026-12-21';

export function parseISODate(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { year: y, month: m, day: d };
}

export function formatISODate(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function toLocalDateObj(dateStr: string): Date {
  const { year, month, day } = parseISODate(dateStr);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function fromLocalDateObj(date: Date): string {
  return formatISODate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function addDays(dateStr: string, days: number): string {
  const dt = toLocalDateObj(dateStr);
  dt.setDate(dt.getDate() + days);
  return fromLocalDateObj(dt);
}

export function diffDays(targetDateStr: string, fromDateStr: string): number {
  const a = toLocalDateObj(targetDateStr);
  const b = toLocalDateObj(fromDateStr);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((a.getTime() - b.getTime()) / msPerDay);
}

export function getDayOfWeek(dateStr: string): number {
  return toLocalDateObj(dateStr).getDay(); // 0 = Sun, 6 = Sat
}

export function getWeekdayName(dateStr: string, short = false): string {
  const dt = toLocalDateObj(dateStr);
  return dt.toLocaleDateString('en-US', { weekday: short ? 'short' : 'long' });
}

export function formatDisplayDate(dateStr: string, includeYear = true): string {
  const dt = toLocalDateObj(dateStr);
  return dt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
}

export function formatFullDisplayDate(dateStr: string): string {
  const dt = toLocalDateObj(dateStr);
  return dt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function getEffectiveTodayISO(): string {
  const now = new Date();
  const localToday = fromLocalDateObj(now);
  // Respect the prompt's 24 Nov 2026 baseline if system clock is earlier (e.g. PST evening of Nov 23)
  return localToday < BASELINE_DATE ? BASELINE_DATE : localToday;
}

export function getTimeGreeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function getMonthDaysGrid(year: number, monthIndex0: number): (string | null)[] {
  const firstDay = new Date(year, monthIndex0, 1, 12, 0, 0, 0);
  const lastDay = new Date(year, monthIndex0 + 1, 0, 12, 0, 0, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first calendar
  const cells: (string | null)[] = [];
  for (let i = 0; i < startOffset; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push(formatISODate(year, monthIndex0 + 1, d));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

export function getWeekDates(anchorDateStr: string): string[] {
  const dow = getDayOfWeek(anchorDateStr);
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = addDays(anchorDateStr, mondayOffset);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function addMinutesToTime(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}
