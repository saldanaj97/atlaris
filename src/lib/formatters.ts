export function formatMinutes(minutes: number) {
  if (!minutes) return '—';
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = minutes / 60;
  if (Number.isInteger(hours)) {
    return `${hours} hr${hours === 1 ? '' : 's'}`;
  }
  return `${hours.toFixed(1)} hrs`;
}

export function formatWeeklyHours(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) {
    return 'a couple of hours';
  }
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

export function formatSkillLevel(value: string): string {
  switch (value) {
    case 'beginner':
      return 'Beginner';
    case 'intermediate':
      return 'Intermediate';
    case 'advanced':
      return 'Advanced';
    default:
      return value;
  }
}

export function formatLearningStyle(value: string) {
  switch (value) {
    case 'reading':
      return 'Reading';
    case 'video':
      return 'Video';
    case 'practice':
      return 'Practice';
    case 'mixed':
      return 'Mixed';
    default:
      return value;
  }
}
