export const PRIORITY_TOPICS = [
  // seed examples; business can tune this list
  'interview prep',
  'ai engineering',
  'machine learning',
  'data structures',
] as const;

type Tier = 'free' | 'starter' | 'pro';

export function isPriorityTopic(topic: string): boolean {
  // Use word-boundary regex matching to prevent substring false positives
  // (e.g., "hair engineering" should not match "ai engineering")
  const lower = topic.trim().toLowerCase();
  const pattern = PRIORITY_TOPICS.map((t) => `\\b${t}\\b`).join('|');
  const regex = new RegExp(pattern, 'i');
  return regex.test(lower);
}

export function computeJobPriority(params: {
  tier: Tier;
  isPriorityTopic: boolean;
}): number {
  const base = params.tier === 'pro' ? 10 : params.tier === 'starter' ? 5 : 1;
  const topicBoost = params.isPriorityTopic ? 3 : 0;
  return base + topicBoost;
}
