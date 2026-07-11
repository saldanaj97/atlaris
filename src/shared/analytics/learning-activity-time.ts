const DEFAULT_ANALYTICS_TIMEZONE = 'UTC';

/** Validates and returns the analytics timezone, falling back to UTC. */
export function normalizeTimeZone(value: string | undefined): string {
  if (!value) return DEFAULT_ANALYTICS_TIMEZONE;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return value;
  } catch {
    return DEFAULT_ANALYTICS_TIMEZONE;
  }
}

/** Formats a date as YYYY-MM-DD in the given IANA timezone. */
export function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Unable to format analytics date key');
  }

  return `${year}-${month}-${day}`;
}

/** Parses a YYYY-MM-DD key into a UTC midnight Date. */
export function dateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Returns a YYYY-MM-DD key offset by the given number of days. */
export function addDays(dateKey: string, days: number): string {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Returns the Monday-start YYYY-MM-DD key for the week containing the date. */
export function weekStartKey(dateKey: string): string {
  const date = dateFromKey(dateKey);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

/** Counts consecutive active days ending today or yesterday. */
export function currentStreakDays(
  dayKeys: Set<string>,
  todayKey: string,
): number {
  let cursor = dayKeys.has(todayKey) ? todayKey : addDays(todayKey, -1);
  let streak = 0;

  while (dayKeys.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

/** Finds the longest run of consecutive active days in the set. */
export function longestStreakDays(dayKeys: Set<string>): number {
  let longest = 0;
  let current = 0;
  let previous: string | null = null;

  for (const dayKey of [...dayKeys].sort()) {
    current = previous && dayKey === addDays(previous, 1) ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = dayKey;
  }

  return longest;
}

export { DEFAULT_ANALYTICS_TIMEZONE };
