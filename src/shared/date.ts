/** Returns the UTC day key for a given Date (or now) as "YYYY-MM-DD" */
export function utcDayKey(date?: Date): string {
  const d = date ?? new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parses a dayKey "YYYY-MM-DD" into a UTC midnight Date */
export function parseDayKey(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00Z`);
}

/** Returns the dayKey for yesterday UTC */
export function yesterdayKey(today?: string): string {
  const d = today ? parseDayKey(today) : new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return utcDayKey(d);
}

/** Returns milliseconds until the next UTC midnight from now */
export function msUntilNextUtcMidnight(): number {
  const now = new Date();
  const nextMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  return nextMidnight.getTime() - now.getTime();
}

/** Returns epoch day number (days since 1970-01-01) for a dayKey */
export function epochDay(dayKey: string): number {
  return Math.floor(parseDayKey(dayKey).getTime() / 86400000);
}

/** Returns day-of-week (0=Sun … 6=Sat) for a dayKey */
export function utcWeekday(dayKey: string): number {
  return parseDayKey(dayKey).getUTCDay();
}

/** Returns the target par range for a given UTC weekday */
export function targetParRange(weekday: number): [number, number] {
  // Mon=1,Tue=2 -> 5-6; Wed=3,Thu=4 -> 7-8; Fri=5 -> 9-10; Sat=6,Sun=0 -> 10-12
  if (weekday === 1 || weekday === 2) return [5, 6];
  if (weekday === 3 || weekday === 4) return [7, 8];
  if (weekday === 5) return [9, 10];
  return [10, 12];
}
