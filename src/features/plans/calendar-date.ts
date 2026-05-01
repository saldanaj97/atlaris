const PLAN_CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toPlanCalendarDate(
  value: string | null | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  if (!PLAN_CALENDAR_DATE_PATTERN.test(value)) {
    return undefined;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString().startsWith(value) ? value : undefined;
}
