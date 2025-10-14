import { pgEnum } from 'drizzle-orm/pg-core';

export const skillLevel = pgEnum('skill_level', [
  'beginner',
  'intermediate',
  'advanced',
]);
export const learningStyle = pgEnum('learning_style', [
  'reading',
  'video',
  'practice',
  'mixed',
]);

export const generationStatus = pgEnum('generation_status', [
  'generating',
  'ready',
  'failed',
]);

// TODO: Change back to video instead of youtube
export const resourceType = pgEnum('resource_type', [
  'youtube',
  'article',
  'course',
  'doc',
  'other',
]);
export const progressStatus = pgEnum('progress_status', [
  'not_started',
  'in_progress',
  'completed',
]);

export const jobStatus = pgEnum('job_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const jobType = pgEnum('job_type', ['plan_generation']);

export const subscriptionTier = pgEnum('subscription_tier', [
  'free',
  'starter',
  'pro',
]);

export const subscriptionStatus = pgEnum('subscription_status', [
  'active',
  'canceled',
  'past_due',
  'trialing',
]);
