import { pgEnum } from 'drizzle-orm/pg-core';

import { JOB_TYPE_VALUES } from '@/lib/jobs/constants';

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
  'pending_retry',
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

export const jobType = pgEnum('job_type', [...JOB_TYPE_VALUES]);

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

export const preferredAiModel = pgEnum('preferred_ai_model', [
  'google/gemini-2.0-flash-exp:free',
  'openai/gpt-oss-20b:free',
  'alibaba/tongyi-deepresearch-30b-a3b:free',
  'anthropic/claude-haiku-4.5',
  'google/gemini-2.5-flash-lite',
  'google/gemini-3-flash-preview',
  'google/gemini-3-pro-preview',
  'anthropic/claude-sonnet-4.5',
  'openai/gpt-4o-mini-2024-07-18',
  'openai/gpt-4o-mini-search-preview',
  'openai/gpt-4o',
  'openai/gpt-5.1',
  'openai/gpt-5.2',
]);

export type PreferredAiModel = (typeof preferredAiModel.enumValues)[number];

export const integrationProviderEnum = pgEnum('integration_provider', [
  'google_calendar',
]);

export const planOrigin = pgEnum('plan_origin', [
  'ai',
  'template',
  'manual',
  'pdf',
]);
