const SCHEDULED_EVENT_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

const SCHEDULED_EVENT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

type ValidDateInput = Date | string | null | undefined;

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: string): Date {
  const dateOnly = DATE_ONLY_RE.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return new Date(value);
}

export function toValidDate(value: ValidDateInput): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : parseDate(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type RelativePastOptions = {
  referenceDate: ValidDateInput;
  style: 'compact' | 'verbose';
  invalidLabel?: string;
};

type PastDelta = {
  minutes: number;
  hours: number;
  days: number;
};

function getClampedPastDelta(targetDate: Date, reference: Date): PastDelta {
  const elapsedMs = reference.getTime() - targetDate.getTime();
  return {
    minutes: Math.max(0, Math.trunc(elapsedMs / MS_PER_MINUTE)),
    hours: Math.max(0, Math.trunc(elapsedMs / MS_PER_HOUR)),
    days: Math.max(0, Math.trunc(elapsedMs / MS_PER_DAY)),
  };
}

function formatCompactPastDelta(delta: PastDelta): string {
  if (delta.minutes < 60) {
    return delta.minutes <= 1 ? 'Just now' : `${delta.minutes}m ago`;
  }
  if (delta.hours < 24) {
    return `${delta.hours}h ago`;
  }
  if (delta.days === 1) return 'Yesterday';
  if (delta.days < 7) return `${delta.days} days ago`;
  if (delta.days < 30) return `${Math.floor(delta.days / 7)}w ago`;
  return `${Math.floor(delta.days / 30)}mo ago`;
}

function pluralizePastUnit(
  value: number,
  unit: 'minute' | 'hour' | 'day' | 'week' | 'month',
) {
  return `${value} ${unit}${value === 1 ? '' : 's'} ago`;
}

/**
 * Verbose style keeps the legacy precise one-minute label; compact style fuzzes
 * one minute into "Just now" for denser plan-card copy.
 */
function formatVerbosePastDelta(delta: PastDelta): string {
  if (delta.minutes < 1) return 'Just now';
  if (delta.minutes < 60) return pluralizePastUnit(delta.minutes, 'minute');
  if (delta.hours < 24) return pluralizePastUnit(delta.hours, 'hour');
  if (delta.days === 1) return 'Yesterday';
  if (delta.days < 7) return pluralizePastUnit(delta.days, 'day');
  if (delta.days < 30) {
    return pluralizePastUnit(Math.floor(delta.days / 7), 'week');
  }

  const months = Math.floor(delta.days / 30);
  return pluralizePastUnit(months, 'month');
}

/**
 * Past-only relative time (plan cards: compact; dashboard activity: verbose).
 *
 * Negative deltas (reference before target, i.e. `date` in the future) are
 * clamped to zero so callers get “Just now” / minimal buckets — same behavior as the legacy plan-card helper.
 */
export function formatRelativePast(
  date: ValidDateInput,
  options: RelativePastOptions,
): string {
  const targetDate = toValidDate(date);
  const reference = toValidDate(options.referenceDate);
  const invalid = options.invalidLabel ?? 'Recently';
  if (!targetDate || !reference) return invalid;

  const delta = getClampedPastDelta(targetDate, reference);
  return options.style === 'compact'
    ? formatCompactPastDelta(delta)
    : formatVerbosePastDelta(delta);
}

/**
 * Dashboard scheduled-event style (future relative to reference).
 */
export function formatScheduledEventRelative(
  date: Date,
  referenceDate: Date,
): string {
  const targetDate = toValidDate(date);
  const reference = toValidDate(referenceDate);
  if (!targetDate || !reference) return 'Recently';

  const comparison = Math.sign(targetDate.getTime() - reference.getTime());

  if (comparison < 0) {
    return formatRelativePast(targetDate, {
      referenceDate: reference,
      style: 'verbose',
    });
  }

  if (comparison === 0) {
    return 'Now';
  }

  const diffCalendarDays = calendarDayDifference(targetDate, reference);

  if (diffCalendarDays === 0) {
    const diffMs = targetDate.getTime() - reference.getTime();
    const diffHours = Math.trunc(diffMs / MS_PER_HOUR);
    if (diffHours >= 1) {
      return `In ${diffHours}h`;
    }

    const diffMinutes = Math.trunc(diffMs / MS_PER_MINUTE);
    if (diffMinutes === 0) {
      return 'Now';
    }

    return `In ${diffMinutes} min`;
  }

  if (diffCalendarDays === 1) {
    return `Tomorrow at ${SCHEDULED_EVENT_TIME_FORMATTER.format(targetDate)}`;
  }

  if (diffCalendarDays < 7) {
    return `In ${diffCalendarDays} days`;
  }

  return SCHEDULED_EVENT_DATE_FORMATTER.format(targetDate);
}

function calendarDayDifference(date: Date, referenceDate: Date): number {
  const dateDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const referenceDay = Date.UTC(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );

  return Math.round((dateDay - referenceDay) / MS_PER_DAY);
}
