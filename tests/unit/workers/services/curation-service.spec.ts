import * as microExplanations from '@/lib/ai/micro-explanations';
import * as curateDocs from '@/lib/curation/docs';
import * as curateYouTube from '@/lib/curation/youtube';
import * as resourcesQueries from '@/lib/db/queries/resources';
import * as tasksQueries from '@/lib/db/queries/tasks';
import { CurationService } from '@/workers/services/curation-service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockProvider } from '../../../helpers/mockProvider';

vi.mock('@/lib/db/queries/tasks');
vi.mock('@/lib/db/queries/resources');
vi.mock('@/lib/curation/youtube');
vi.mock('@/lib/curation/docs');
vi.mock('@/lib/ai/micro-explanations');

describe('CurationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('curateAndAttachResources', () => {
    it('should curate resources for all tasks', async () => {
      const mockProvider = createMockProvider({ scenario: 'success' });
      const service = new CurationService(mockProvider.provider);

      const mockTasks = [
        {
          task: {
            id: 'task-1',
            title: 'Learn Python',
            description: null,
            hasMicroExplanation: false,
          },
          moduleTitle: 'Module 1',
        },
        {
          task: {
            id: 'task-2',
            title: 'Build a project',
            description: null,
            hasMicroExplanation: false,
          },
          moduleTitle: 'Module 1',
        },
      ];

      vi.mocked(tasksQueries.getTasksByPlanId).mockResolvedValue(
        mockTasks as any
      );
      vi.mocked(curateYouTube.curateYouTube).mockResolvedValue([
        {
          url: 'https://youtube.com/watch?v=123',
          title: 'Python Tutorial',
          source: 'youtube' as const,
          score: {
            blended: 0.9,
            components: { relevance: 0.9 } as any,
            scoredAt: new Date().toISOString(),
          },
          metadata: {},
          components: { relevance: 0.9 } as any,
          numericScore: 0.9,
        },
      ]);
      vi.mocked(resourcesQueries.upsertAndAttach).mockResolvedValue([] as any);
      vi.mocked(microExplanations.generateMicroExplanation).mockResolvedValue(
        'This is a micro-explanation'
      );
      vi.mocked(tasksQueries.appendTaskMicroExplanation).mockResolvedValue(
        'Updated description'
      );

      await service.curateAndAttachResources({
        planId: 'plan-123',
        topic: 'Machine Learning',
        skillLevel: 'beginner',
      });

      expect(tasksQueries.getTasksByPlanId).toHaveBeenCalledWith('plan-123');
      expect(resourcesQueries.upsertAndAttach).toHaveBeenCalledTimes(2);
      expect(microExplanations.generateMicroExplanation).toHaveBeenCalledTimes(
        2
      );
    });

    it('should complete all tasks within time budget', async () => {
      const mockProvider = createMockProvider({ scenario: 'success' });
      const service = new CurationService(mockProvider.provider);

      // Create just a few tasks to keep test fast
      const mockTasks = Array.from({ length: 5 }, (_, i) => ({
        task: {
          id: `task-${i}`,
          title: `Task ${i}`,
          description: null,
          hasMicroExplanation: false,
        },
        moduleTitle: 'Module 1',
      }));

      vi.mocked(tasksQueries.getTasksByPlanId).mockResolvedValue(
        mockTasks as any
      );
      vi.mocked(curateYouTube.curateYouTube).mockResolvedValue([
        {
          url: 'https://youtube.com/watch?v=123',
          title: 'Video',
          source: 'youtube' as const,
          score: {
            blended: 0.9,
            components: { relevance: 0.9 } as any,
            scoredAt: new Date().toISOString(),
          },
          metadata: {},
          components: { relevance: 0.9 } as any,
          numericScore: 0.9,
        },
      ]);
      vi.mocked(resourcesQueries.upsertAndAttach).mockResolvedValue([] as any);
      vi.mocked(microExplanations.generateMicroExplanation).mockResolvedValue(
        'Explanation'
      );
      vi.mocked(tasksQueries.appendTaskMicroExplanation).mockResolvedValue(
        'Updated'
      );

      await service.curateAndAttachResources({
        planId: 'plan-123',
        topic: 'Machine Learning',
        skillLevel: 'beginner',
      });

      // Should complete processing all tasks within time budget
      const callCount = vi.mocked(resourcesQueries.upsertAndAttach).mock.calls
        .length;
      expect(callCount).toBe(5);
    });

    it('should skip micro-explanation if already present', async () => {
      const mockProvider = createMockProvider({ scenario: 'success' });
      const service = new CurationService(mockProvider.provider);

      const mockTasks = [
        {
          task: {
            id: 'task-1',
            title: 'Learn Python',
            description: 'Already has explanation',
            hasMicroExplanation: true,
          },
          moduleTitle: 'Module 1',
        },
      ];

      vi.mocked(tasksQueries.getTasksByPlanId).mockResolvedValue(
        mockTasks as any
      );
      vi.mocked(curateYouTube.curateYouTube).mockResolvedValue([
        {
          url: 'https://youtube.com/watch?v=123',
          title: 'Python Tutorial',
          source: 'youtube' as const,
          score: {
            blended: 0.9,
            components: { relevance: 0.9 } as any,
            scoredAt: new Date().toISOString(),
          },
          metadata: {},
          components: { relevance: 0.9 } as any,
          numericScore: 0.9,
        },
      ]);
      vi.mocked(resourcesQueries.upsertAndAttach).mockResolvedValue([] as any);

      await service.curateAndAttachResources({
        planId: 'plan-123',
        topic: 'Machine Learning',
        skillLevel: 'beginner',
      });

      expect(microExplanations.generateMicroExplanation).not.toHaveBeenCalled();
    });

    it('should fall back to docs when YouTube yields no valid results', async () => {
      const mockProvider = createMockProvider({ scenario: 'success' });
      const service = new CurationService(mockProvider.provider);

      const mockTasks = [
        {
          task: {
            id: 'task-1',
            title: 'Learn Python',
            description: null,
            hasMicroExplanation: false,
          },
          moduleTitle: 'Module 1',
        },
      ];

      vi.mocked(tasksQueries.getTasksByPlanId).mockResolvedValue(
        mockTasks as any
      );
      // YouTube returns low-score results
      vi.mocked(curateYouTube.curateYouTube).mockResolvedValue([
        {
          url: 'https://youtube.com/watch?v=123',
          title: 'Low quality video',
          source: 'youtube' as const,
          score: {
            blended: 0.9,
            components: { relevance: 0.9 } as any,
            scoredAt: new Date().toISOString(),
          },
          metadata: {},
          components: { relevance: 0.9 } as any,
          numericScore: 0.3, // Below minScore
        },
      ]);
      // Docs should be called as fallback
      vi.mocked(curateDocs.curateDocs).mockResolvedValue([
        {
          url: 'https://docs.python.org',
          title: 'Python Docs',
          source: 'doc' as const,
          score: {
            blended: 0.8,
            components: { relevance: 0.8 },
            scoredAt: new Date().toISOString(),
          },
          metadata: {},
          components: { relevance: 0.9 } as any,
          numericScore: 0.8,
        },
      ]);
      vi.mocked(resourcesQueries.upsertAndAttach).mockResolvedValue([] as any);
      vi.mocked(microExplanations.generateMicroExplanation).mockResolvedValue(
        'Explanation'
      );
      vi.mocked(tasksQueries.appendTaskMicroExplanation).mockResolvedValue(
        'Updated'
      );

      await service.curateAndAttachResources({
        planId: 'plan-123',
        topic: 'Machine Learning',
        skillLevel: 'beginner',
      });

      expect(curateDocs.curateDocs).toHaveBeenCalled();
    });
  });

  describe('static helpers', () => {
    it('should return curation configuration status', () => {
      const shouldRun = CurationService.shouldRunCuration();
      expect(typeof shouldRun).toBe('boolean');
    });

    it('should return sync execution status', () => {
      const shouldRunSync = CurationService.shouldRunSync();
      expect(typeof shouldRunSync).toBe('boolean');
    });
  });
});
