export function formatMinutes(minutes: number): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return '—';
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = minutes / 60;
  if (Number.isInteger(hours)) {
    return `${hours} hr${hours === 1 ? '' : 's'}`;
  }
  return `${hours.toFixed(1)} hrs`;
}

export function formatWeeklyHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) {
    return 'a couple of hours';
  }
  const rounded = parseFloat(hours.toFixed(2));
  return `${rounded} hour${rounded === 1 ? '' : 's'}`;
}

const SKILL_LEVEL_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const LEARNING_STYLE_LABELS: Record<string, string> = {
  reading: 'Reading',
  video: 'Video',
  practice: 'Practice',
  mixed: 'Mixed',
};

export function formatSkillLevel(value: string): string {
  return SKILL_LEVEL_LABELS[value] ?? value;
}

export function formatLearningStyle(value: string): string {
  return LEARNING_STYLE_LABELS[value] ?? value;
}
