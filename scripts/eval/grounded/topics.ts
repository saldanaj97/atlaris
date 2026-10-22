/**
 * The fixed JCS-163 eval set: ten topics across five domains, run on every
 * tier and both arms. Hours, style and span are the same for every topic so
 * plans differ only by topic and level. The span stays inside the free tier's
 * two-week limit so all tiers get the same request.
 */

export type EvalTopic = {
  readonly id: string;
  readonly domain: 'code' | 'data' | 'language' | 'theory' | 'practical';
  readonly topic: string;
  readonly skillLevel: 'beginner' | 'intermediate' | 'advanced';
};

export const EVAL_WEEKLY_HOURS = 4;
export const EVAL_LEARNING_STYLE = 'mixed';
export const EVAL_PLAN_SPAN_DAYS = 14;

export const EVAL_TOPICS: readonly EvalTopic[] = [
  {
    id: 'python-list-comprehensions',
    domain: 'code',
    topic: 'Python list comprehensions',
    skillLevel: 'beginner',
  },
  {
    id: 'rust-ownership',
    domain: 'code',
    topic: 'Rust ownership and borrowing',
    skillLevel: 'intermediate',
  },
  {
    id: 'typescript-generics',
    domain: 'code',
    topic: 'TypeScript generics',
    skillLevel: 'advanced',
  },
  {
    id: 'sql-window-functions',
    domain: 'data',
    topic: 'SQL window functions',
    skillLevel: 'intermediate',
  },
  {
    id: 'pandas-cleaning',
    domain: 'data',
    topic: 'Cleaning data with pandas',
    skillLevel: 'beginner',
  },
  {
    id: 'spanish-travel',
    domain: 'language',
    topic: 'Spanish for travel',
    skillLevel: 'beginner',
  },
  {
    id: 'japanese-kana',
    domain: 'language',
    topic: 'Japanese hiragana and katakana',
    skillLevel: 'beginner',
  },
  {
    id: 'bayesian-statistics',
    domain: 'theory',
    topic: 'Bayesian statistics',
    skillLevel: 'intermediate',
  },
  {
    id: 'chord-progressions',
    domain: 'theory',
    topic: 'Chord progressions in music theory',
    skillLevel: 'beginner',
  },
  {
    id: 'personal-budgeting',
    domain: 'practical',
    topic: 'Personal budgeting',
    skillLevel: 'beginner',
  },
];

/** The POST /api/v1/plans body for one topic, starting on `startDate`. */
export function planRequestBody(topic: EvalTopic, startDate: Date) {
  const deadline = new Date(startDate);
  deadline.setUTCDate(deadline.getUTCDate() + EVAL_PLAN_SPAN_DAYS);
  return {
    topic: topic.topic,
    skillLevel: topic.skillLevel,
    weeklyHours: EVAL_WEEKLY_HOURS,
    learningStyle: EVAL_LEARNING_STYLE,
    startDate: startDate.toISOString().slice(0, 10),
    deadlineDate: deadline.toISOString().slice(0, 10),
  };
}
