import { moduleLessonContentGeneratePost } from './handler';

/**
 * POST /api/v1/plans/:planId/modules/:moduleId/lesson-content/generate
 * Starts on-demand lesson content generation for an unlocked module.
 */
export const POST = moduleLessonContentGeneratePost;
