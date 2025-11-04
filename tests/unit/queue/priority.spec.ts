import { describe, it, expect } from 'vitest';
import {
  computeJobPriority,
  PRIORITY_TOPICS,
  isPriorityTopic,
} from '@/lib/queue/priority';

describe('computeJobPriority', () => {
  it('gives higher base priority to paid tiers', () => {
    const free = computeJobPriority({ tier: 'free', isPriorityTopic: false });
    const starter = computeJobPriority({
      tier: 'starter',
      isPriorityTopic: false,
    });
    const pro = computeJobPriority({ tier: 'pro', isPriorityTopic: false });

    expect(pro).toBeGreaterThan(starter);
    expect(starter).toBeGreaterThan(free);
  });
  it('boosts priority for priority topics', () => {
    const freeBase = computeJobPriority({
      tier: 'free',
      isPriorityTopic: false,
    });
    const freePriority = computeJobPriority({
      tier: 'free',
      isPriorityTopic: true,
    });
    expect(freePriority).toBeGreaterThan(freeBase);
  });
  it('PRIORITY_TOPICS contains non-empty list', () => {
    expect(PRIORITY_TOPICS.length).toBeGreaterThan(0);
  });
  it('throws error for invalid tier', () => {
    expect(() =>
      computeJobPriority({
        tier: 'invalid' as 'free',
        isPriorityTopic: false,
      })
    ).toThrow('Invalid tier: invalid');
  });
});

describe('isPriorityTopic', () => {
  it('matches priority topics case-insensitively', () => {
    expect(isPriorityTopic('Interview Prep')).toBe(true);
    expect(isPriorityTopic('AI ENGINEERING')).toBe(true);
  });

  it('handles whitespace correctly', () => {
    expect(isPriorityTopic('  machine learning  ')).toBe(true);
  });

  it('matches multi-word phrases within larger strings', () => {
    expect(isPriorityTopic('Working on interview prep this week')).toBe(true);
    expect(isPriorityTopic('My focus: ai engineering and system design')).toBe(
      true
    );
  });

  it('returns false for non-priority topics', () => {
    expect(isPriorityTopic('cooking')).toBe(false);
  });
});
