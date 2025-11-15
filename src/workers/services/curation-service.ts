import { logger } from '@/lib/logging/logger';
import { appEnv } from '@/lib/config/env';
import { curationConfig } from '@/lib/curation/config';
import { curateDocs } from '@/lib/curation/docs';
import { curateYouTube } from '@/lib/curation/youtube';
import { selectTop, type Scored } from '@/lib/curation/ranking';
import { generateMicroExplanation } from '@/lib/ai/micro-explanations';
import type { AiPlanGenerationProvider } from '@/lib/ai/provider';
import { getTasksByPlanId } from '@/lib/db/queries/tasks';
import { upsertAndAttach } from '@/lib/db/queries/resources';
import { appendTaskMicroExplanation } from '@/lib/db/queries/tasks';

export interface CurationInput {
  planId: string;
  topic: string;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
}

/**
 * Service responsible for curating resources and generating micro-explanations for learning plan tasks.
 * Handles YouTube and documentation search, resource attachment, and AI-powered task explanations.
 */
export class CurationService {
  constructor(private readonly provider: AiPlanGenerationProvider) {}

  /**
   * Curates and attaches resources for all tasks in a learning plan and generates micro-explanations.
   *
   * Processes tasks in batches according to configured concurrency and respects time budget.
   * Individual task errors are logged and do not stop processing of other tasks.
   *
   * @param input - The plan context (planId, topic, skillLevel)
   */
  async curateAndAttachResources(input: CurationInput): Promise<void> {
    const { planId, topic, skillLevel } = input;
    const TIME_BUDGET_MS = curationConfig.timeBudgetMs;
    const startTime = Date.now();
    const curationLogger = logger.child({
      source: 'plan_curation',
      planId,
    });

    const rawConcurrency = curationConfig.concurrency;
    const CURATION_CONCURRENCY =
      Number.isFinite(rawConcurrency) && rawConcurrency > 0
        ? Math.floor(rawConcurrency)
        : 1;

    if (!Number.isFinite(rawConcurrency) || rawConcurrency <= 0) {
      curationLogger.warn(
        {
          configuredConcurrency: rawConcurrency,
          effectiveConcurrency: CURATION_CONCURRENCY,
        },
        'Invalid curation concurrency value; using safe fallback'
      );
    }

    const taskRows = await getTasksByPlanId(planId);

    curationLogger.info(
      {
        taskCount: taskRows.length,
      },
      'Starting resource curation'
    );

    const curationParams = {
      query: topic,
      minScore: curationConfig.minResourceScore,
      maxResults: curationConfig.maxResults,
    };

    for (let i = 0; i < taskRows.length; i += CURATION_CONCURRENCY) {
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        curationLogger.warn(
          {
            batchIndex: i,
            elapsedMs: Date.now() - startTime,
          },
          'Time budget exceeded before starting batch, stopping curation'
        );
        break;
      }

      const batch = taskRows.slice(i, i + CURATION_CONCURRENCY);
      await Promise.all(
        batch.map(async (taskRow) => {
          const { task, moduleTitle } = taskRow;

          if (Date.now() - startTime > TIME_BUDGET_MS) {
            curationLogger.warn(
              {
                taskId: task.id,
                elapsedMs: Date.now() - startTime,
              },
              'Time budget exceeded, skipping task'
            );
            return;
          }

          try {
            const candidates = await this.curateTaskResources(
              task.title,
              curationParams,
              skillLevel
            );

            if (candidates.length > 0) {
              await upsertAndAttach(task.id, candidates);
              curationLogger.info(
                {
                  taskId: task.id,
                  resourceCount: candidates.length,
                },
                'Attached curated resources to task'
              );
            } else {
              curationLogger.info(
                {
                  taskId: task.id,
                  minScore: curationParams.minScore,
                },
                'No curated resources met cutoff for task'
              );
            }

            await this.maybeAddMicroExplanation(
              task,
              {
                topic,
                moduleTitle,
                skillLevel,
              },
              startTime,
              TIME_BUDGET_MS,
              curationLogger
            );
          } catch (error) {
            curationLogger.error(
              {
                taskId: task.id,
                error,
              },
              'Failed to curate task'
            );
          }
        })
      );

      if (Date.now() - startTime > TIME_BUDGET_MS) {
        curationLogger.warn(
          {
            batchIndex: i,
            elapsedMs: Date.now() - startTime,
          },
          'Time budget exceeded after batch, stopping curation'
        );
        break;
      }
    }

    const elapsed = Date.now() - startTime;
    curationLogger.info(
      {
        elapsedMs: elapsed,
      },
      'Completed curation run'
    );
  }

  private async curateTaskResources(
    taskTitle: string,
    params: {
      query: string;
      minScore: number;
      maxResults: number;
    },
    _skillLevel: 'beginner' | 'intermediate' | 'advanced' // Reserved for future skill-level-specific curation strategies
  ): Promise<Scored[]> {
    const candidates: Scored[] = [];
    const searchLogger = logger.child({
      source: 'plan_curation_search',
      taskTitle,
    });

    let ytResults: Scored[] = [];
    try {
      ytResults = await curateYouTube({
        ...params,
        query: `${params.query} ${taskTitle}`,
      });
      candidates.push(...ytResults);
    } catch (error) {
      searchLogger.error(
        {
          error,
        },
        'YouTube search failed during curation'
      );
    }

    const validYtCount = ytResults.filter(
      (r) => r.numericScore >= params.minScore
    ).length;

    if (validYtCount >= params.maxResults) {
      // Enough high-scoring YouTube results; no docs needed
    } else if (validYtCount < params.maxResults) {
      try {
        const docResults = await curateDocs({
          ...params,
          query: `${params.query} ${taskTitle}`,
        });
        candidates.push(...docResults);
      } catch (error) {
        searchLogger.error(
          {
            error,
          },
          'Docs search failed during curation'
        );
      }
    }

    const top = selectTop(candidates, {
      minScore: params.minScore,
      maxItems: params.maxResults,
      preferDiversity: true,
      earlyStopEnabled: true,
    });

    return top;
  }

  private async maybeAddMicroExplanation(
    task: {
      id: string;
      title: string;
      description: string | null;
      hasMicroExplanation: boolean;
    },
    context: {
      topic: string;
      moduleTitle: string;
      skillLevel: 'beginner' | 'intermediate' | 'advanced';
    },
    startTime: number,
    timeBudgetMs: number,
    curationLogger: typeof logger
  ): Promise<void> {
    try {
      if (task.hasMicroExplanation) {
        curationLogger.info(
          {
            taskId: task.id,
          },
          'Skipping micro-explanation; already present'
        );
        return;
      }

      if (Date.now() - startTime > timeBudgetMs) {
        curationLogger.warn(
          {
            taskId: task.id,
            elapsedMs: Date.now() - startTime,
          },
          'Time budget exceeded before micro-explanation generation'
        );
        return;
      }

      const microExplanation = await generateMicroExplanation(this.provider, {
        topic: context.topic,
        moduleTitle: context.moduleTitle,
        taskTitle: task.title,
        skillLevel: context.skillLevel,
      });

      await appendTaskMicroExplanation(task.id, microExplanation);

      curationLogger.info(
        {
          taskId: task.id,
        },
        'Added micro-explanation to task'
      );
    } catch (explanationError) {
      curationLogger.error(
        {
          taskId: task.id,
          error: explanationError,
        },
        'Failed to generate micro-explanation for task'
      );
    }
  }

  /**
   * Determines if curation should run based on configuration and environment.
   */
  static shouldRunCuration(): boolean {
    return curationConfig.enableCuration;
  }

  /**
   * Determines if curation should run synchronously (in tests) or asynchronously (in production).
   */
  static shouldRunSync(): boolean {
    return appEnv.isTest;
  }
}
