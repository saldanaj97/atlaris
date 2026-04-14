import {
  compareAsc,
  differenceInCalendarDays,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  parseISO,
} from 'date-fns';

const SCHEDULED_EVENT_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

const SCHEDULED_EVENT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

export type ValidDateInput = Date | string | null | undefined;

export function toValidDate(value: ValidDateInput): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type RelativePastOptions = {
  referenceDate: ValidDateInput;
  style: 'compact' | 'verbose';
  invalidLabel?: string;
};

/**
 * Past-only relative time (plan cards: compact; dashboard activity: verbose).
 *
 * Negative deltas (reference before target, i.e. `date` in the future) are
 * clamped to zero so callers get “Just now” / minimal buckets — same behavior as the legacy plan-card helper.
 */
export function formatRelativePast(
  date: ValidDateInput,
  options: RelativePastOptions
): string {
  const targetDate = toValidDate(date);
  const reference = toValidDate(options.referenceDate);
  const invalid = options.invalidLabel ?? 'Recently';
  if (!targetDate || !reference) return invalid;

  const rawMinutes = differenceInMinutes(reference, targetDate);
  const rawHours = differenceInHours(reference, targetDate);
  const rawDays = differenceInDays(reference, targetDate);

  const diffMinutes = Math.max(0, rawMinutes);
  const diffHours = Math.max(0, rawHours);
  const diffDays = Math.max(0, rawDays);

  if (options.style === 'compact') {
    if (diffMinutes < 60) {
      return diffMinutes <= 1 ? 'Just now' : `${diffMinutes}m ago`;
    }
    if (diffHours < 24) {
      return diffHours === 1 ? '1 hour ago' : `${diffHours}h ago`;
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  }

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }
  const months = Math.floor(diffDays / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

/**
 * Dashboard scheduled-event style (future relative to reference).
 */
export function formatScheduledEventRelative(
  date: Date,
  referenceDate: Date
): string {
  const targetDate = toValidDate(date);
  const reference = toValidDate(referenceDate);
  if (!targetDate || !reference) return 'Recently';

  const comparison = compareAsc(targetDate, reference);

  if (comparison < 0) {
    return formatRelativePast(targetDate, {
      referenceDate: reference,
      style: 'verbose',
    });
  }

  if (comparison === 0) {
    return 'Now';
  }

  const diffCalendarDays = differenceInCalendarDays(targetDate, reference);

  if (diffCalendarDays === 0) {
    const diffHours = differenceInHours(targetDate, reference);
    if (diffHours >= 1) {
      return `In ${diffHours}h`;
    }

    const diffMinutes = differenceInMinutes(targetDate, reference);
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
