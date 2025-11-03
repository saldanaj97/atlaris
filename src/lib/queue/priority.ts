export const PRIORITY_TOPICS = [
  // seed examples; business can tune this list
  'interview prep',
  'ai engineering',
  'machine learning',
  'data structures',
] as const;

type Tier = 'free' | 'starter' | 'pro';

export function isPriorityTopic(topic: string): boolean {
  const lower = topic.trim().toLowerCase();
  return PRIORITY_TOPICS.some((t) => lower.includes(t));
}

export function computeJobPriority(params: {
  tier: Tier;
  isPriorityTopic: boolean;
}): number {
  const base = params.tier === 'pro' ? 10 : params.tier === 'starter' ? 5 : 1;
  const topicBoost = params.isPriorityTopic ? 3 : 0;
  return base + topicBoost;
}
