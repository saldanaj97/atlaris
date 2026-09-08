export type UsageAnalyticsMetricTrend = {
  label: 'Up' | 'Down' | 'Flat';
  icon: 'up' | 'down' | 'flat';
};

/** Formats a day count with correct singular or plural labeling. */
export function formatDayCount(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** Returns a human-readable label for remaining tasks or modules. */
export function remainingLabel(remaining: number, noun: string): string {
  const safeRemaining = Math.max(0, remaining);

  if (safeRemaining === 0) {
    return 'Nothing left';
  }

  return `${safeRemaining} ${safeRemaining === 1 ? noun : `${noun}s`} left`;
}

/** Compares current and previous values to produce a visible trend. */
export function activityStatus(
  current: number,
  previous: number,
): UsageAnalyticsMetricTrend | null {
  if (current === 0 && previous === 0) {
    return null;
  }

  if (current > previous) {
    return { label: 'Up', icon: 'up' };
  }

  if (current < previous) {
    return { label: 'Down', icon: 'down' };
  }

  return { label: 'Flat', icon: 'flat' };
}

/** Formats a week-over-week delta for counts such as changes, events, or days. */
export function formatCountDelta(
  current: number,
  previous: number,
  noun: 'change' | 'event' | 'day',
): string {
  const delta = current - previous;

  if (delta === 0) {
    return 'No change vs last week';
  }

  const absoluteDelta = Math.abs(delta);
  const unit = absoluteDelta === 1 ? noun : `${noun}s`;

  return `${delta > 0 ? '+' : '-'}${absoluteDelta} ${unit} vs last week`;
}

/** Returns comparison copy describing distance from the user's best streak. */
export function streakComparison(current: number, longest: number): string {
  if (current === 0 && longest === 0) {
    return 'Start with one active day';
  }

  if (current >= longest) {
    return 'Matches your best run';
  }

  const remaining = longest - current;
  return `${remaining} ${remaining === 1 ? 'day' : 'days'} from best`;
}
