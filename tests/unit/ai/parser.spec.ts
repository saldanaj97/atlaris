import {
  parseGenerationStream,
  ParserError,
  type ParserCallbacks,
} from '@/lib/ai/parser';
import { describe, expect, it, vi } from 'vitest';

// Helper to create async iterable from string chunks
async function* createStream(chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe('AI Parser', () => {
  describe('parseGenerationStream', () => {
    it('should parse valid JSON with modules', async () => {
      const validJson = JSON.stringify({
        modules: [
          {
            title: 'Module 1',
            description: 'First module',
            estimatedMinutes: 60,
            tasks: [
              {
                title: 'Task 1',
                description: 'First task',
                estimatedMinutes: 30,
              },
            ],
          },
        ],
      });

      const stream = createStream([validJson]);
      const result = await parseGenerationStream(stream);

      expect(result.modules).toHaveLength(1);
      expect(result.modules[0].title).toBe('Module 1');
      expect(result.modules[0].tasks).toHaveLength(1);
      expect(result.rawText).toBe(validJson);
    });

    it('should parse JSON streamed in multiple chunks', async () => {
      const jsonParts = [
        '{"modules": [',
        '{"title": "Module 1",',
        '"estimatedMinutes": 60,',
        '"tasks": [{"title": "Task 1", "estimatedMinutes": 30}]',
        '}]}',
      ];

      const stream = createStream(jsonParts);
      const result = await parseGenerationStream(stream);

      expect(result.modules).toHaveLength(1);
      expect(result.modules[0].title).toBe('Module 1');
    });

    it('should throw ParserError for empty response', async () => {
      const promise = parseGenerationStream(createStream(['']));

      await expect(promise).rejects.toThrow(ParserError);
      await expect(promise).rejects.toThrow('empty response');
    });

    it('should throw ParserError for invalid JSON', async () => {
      const promise = parseGenerationStream(createStream(['{ invalid json }']));

      await expect(promise).rejects.toThrow(ParserError);
      await expect(promise).rejects.toThrow('invalid JSON');
    });

    it('should throw ParserError when response is not an object', async () => {
      const stream = createStream(['[]']);

      await expect(parseGenerationStream(stream)).rejects.toThrow(ParserError);
    });

    it('should throw ParserError when modules array is missing', async () => {
      const promise = parseGenerationStream(
        createStream([JSON.stringify({ data: [] })])
      );

      await expect(promise).rejects.toThrow(ParserError);
      await expect(promise).rejects.toThrow('missing modules array');
    });

    it('should throw ParserError when modules array is empty', async () => {
      const promise = parseGenerationStream(
        createStream([JSON.stringify({ modules: [] })])
      );

      await expect(promise).rejects.toThrow(ParserError);
      await expect(promise).rejects.toThrow('zero modules');
    });

    it('should call onFirstModuleDetected callback when modules key is detected', async () => {
      const callback = vi.fn();
      const callbacks: ParserCallbacks = {
        onFirstModuleDetected: callback,
      };

      const jsonParts = [
        '{"modules": [',
        '{"title": "Module 1", "estimatedMinutes": 60, "tasks": [{"title": "Task 1", "estimatedMinutes": 30}]}',
        ']}',
      ];

      const stream = createStream(jsonParts);
      await parseGenerationStream(stream, callbacks);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should not call onFirstModuleDetected multiple times', async () => {
      const callback = vi.fn();
      const callbacks: ParserCallbacks = {
        onFirstModuleDetected: callback,
      };

      const jsonParts = [
        '{"modules": [',
        '{"title": "Module 1", "estimatedMinutes": 60, "tasks": [{"title": "Task 1", "estimatedMinutes": 30}]},',
        '{"title": "Module 2", "estimatedMinutes": 60, "tasks": [{"title": "Task 2", "estimatedMinutes": 30}]}',
        ']}',
      ];

      const stream = createStream(jsonParts);
      await parseGenerationStream(stream, callbacks);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should parse multiple modules', async () => {
      const validJson = JSON.stringify({
        modules: [
          {
            title: 'Module 1',
            estimatedMinutes: 60,
            tasks: [{ title: 'Task 1', estimatedMinutes: 30 }],
          },
          {
            title: 'Module 2',
            estimatedMinutes: 90,
            tasks: [{ title: 'Task 2', estimatedMinutes: 45 }],
          },
        ],
      });

      const stream = createStream([validJson]);
      const result = await parseGenerationStream(stream);

      expect(result.modules).toHaveLength(2);
      expect(result.modules[0].title).toBe('Module 1');
      expect(result.modules[1].title).toBe('Module 2');
    });

    it('should handle optional description fields', async () => {
      const validJson = JSON.stringify({
        modules: [
          {
            title: 'Module 1',
            estimatedMinutes: 60,
            tasks: [
              {
                title: 'Task 1',
                estimatedMinutes: 30,
              },
            ],
          },
        ],
      });

      const stream = createStream([validJson]);
      const result = await parseGenerationStream(stream);

      expect(result.modules[0].description).toBeUndefined();
      expect(result.modules[0].tasks[0].description).toBeUndefined();
    });

    it('should parse description when provided', async () => {
      const validJson = JSON.stringify({
        modules: [
          {
            title: 'Module 1',
            description: 'Module description',
            estimatedMinutes: 60,
            tasks: [
              {
                title: 'Task 1',
                description: 'Task description',
                estimatedMinutes: 30,
              },
            ],
          },
        ],
      });

      const stream = createStream([validJson]);
      const result = await parseGenerationStream(stream);

      expect(result.modules[0].description).toBe('Module description');
      expect(result.modules[0].tasks[0].description).toBe('Task description');
    });

    it('should accept estimated_minutes with underscore', async () => {
      const validJson = JSON.stringify({
        modules: [
          {
            title: 'Module 1',
            estimated_minutes: 60,
            tasks: [
              {
                title: 'Task 1',
                estimated_minutes: 30,
              },
            ],
          },
        ],
      });

      const stream = createStream([validJson]);
      const result = await parseGenerationStream(stream);

      expect(result.modules[0].estimatedMinutes).toBe(60);
      expect(result.modules[0].tasks[0].estimatedMinutes).toBe(30);
    });

    it('should throw error when module title is missing', async () => {
      const invalidJson = JSON.stringify({
        modules: [
          {
            estimatedMinutes: 60,
            tasks: [{ title: 'Task 1', estimatedMinutes: 30 }],
          },
        ],
      });

      const promise = parseGenerationStream(createStream([invalidJson]));

      await expect(promise).rejects.toThrow(ParserError);
      await expect(promise).rejects.toThrow('title');
    });

    it('should throw error when module has no tasks', async () => {
      const invalidJson = JSON.stringify({
        modules: [
          {
            title: 'Module 1',
            estimatedMinutes: 60,
            tasks: [],
          },
        ],
      });

      const promise = parseGenerationStream(createStream([invalidJson]));

      await expect(promise).rejects.toThrow(ParserError);
      await expect(promise).rejects.toThrow('at least one task');
    });

    it('should throw error when task title is missing', async () => {
      const invalidJson = JSON.stringify({
        modules: [
          {
            title: 'Module 1',
            estimatedMinutes: 60,
            tasks: [{ estimatedMinutes: 30 }],
          },
        ],
      });

      const promise = parseGenerationStream(createStream([invalidJson]));

      await expect(promise).rejects.toThrow(ParserError);
      await expect(promise).rejects.toThrow('title');
    });

    it('should throw error when estimatedMinutes is not a number', async () => {
      const invalidJson = JSON.stringify({
        modules: [
          {
            title: 'Module 1',
            estimatedMinutes: 'sixty',
            tasks: [{ title: 'Task 1', estimatedMinutes: 30 }],
          },
        ],
      });

      const promise = parseGenerationStream(createStream([invalidJson]));

      await expect(promise).rejects.toThrow(ParserError);
      await expect(promise).rejects.toThrow('finite number');
    });

    it('should trim whitespace from titles and descriptions', async () => {
      const validJson = JSON.stringify({
        modules: [
          {
            title: '  Module 1  ',
            description: '  Module description  ',
            estimatedMinutes: 60,
            tasks: [
              {
                title: '  Task 1  ',
                description: '  Task description  ',
                estimatedMinutes: 30,
              },
            ],
          },
        ],
      });

      const stream = createStream([validJson]);
      const result = await parseGenerationStream(stream);

      expect(result.modules[0].title).toBe('Module 1');
      expect(result.modules[0].description).toBe('Module description');
      expect(result.modules[0].tasks[0].title).toBe('Task 1');
      expect(result.modules[0].tasks[0].description).toBe('Task description');
    });

    it('should handle alternative field names (summary for description)', async () => {
      const validJson = JSON.stringify({
        modules: [
          {
            title: 'Module 1',
            summary: 'Module summary',
            estimatedMinutes: 60,
            tasks: [
              {
                title: 'Task 1',
                summary: 'Task summary',
                estimatedMinutes: 30,
              },
            ],
          },
        ],
      });

      const stream = createStream([validJson]);
      const result = await parseGenerationStream(stream);

      expect(result.modules[0].description).toBe('Module summary');
      expect(result.modules[0].tasks[0].description).toBe('Task summary');
    });

    it('should handle alternative field names (task for title in tasks)', async () => {
      const validJson = JSON.stringify({
        modules: [
          {
            title: 'Module 1',
            estimatedMinutes: 60,
            tasks: [
              {
                task: 'Task 1',
                estimatedMinutes: 30,
              },
            ],
          },
        ],
      });

      const stream = createStream([validJson]);
      const result = await parseGenerationStream(stream);

      expect(result.modules[0].tasks[0].title).toBe('Task 1');
    });

    it('should convert string numbers to actual numbers', async () => {
      const validJson = JSON.stringify({
        modules: [
          {
            title: 'Module 1',
            estimatedMinutes: '60',
            tasks: [
              {
                title: 'Task 1',
                estimatedMinutes: '30',
              },
            ],
          },
        ],
      });

      const stream = createStream([validJson]);
      const result = await parseGenerationStream(stream);

      expect(result.modules[0].estimatedMinutes).toBe(60);
      expect(result.modules[0].tasks[0].estimatedMinutes).toBe(30);
    });

    it('should throw error for empty string titles', async () => {
      const invalidJson = JSON.stringify({
        modules: [
          {
            title: '   ',
            estimatedMinutes: 60,
            tasks: [{ title: 'Task 1', estimatedMinutes: 30 }],
          },
        ],
      });

      const stream = createStream([invalidJson]);

      await expect(parseGenerationStream(stream)).rejects.toThrow(ParserError);
    });

    it('should handle tasks array with multiple tasks', async () => {
      const validJson = JSON.stringify({
        modules: [
          {
            title: 'Module 1',
            estimatedMinutes: 150,
            tasks: [
              { title: 'Task 1', estimatedMinutes: 30 },
              { title: 'Task 2', estimatedMinutes: 60 },
              { title: 'Task 3', estimatedMinutes: 60 },
            ],
          },
        ],
      });

      const stream = createStream([validJson]);
      const result = await parseGenerationStream(stream);

      expect(result.modules[0].tasks).toHaveLength(3);
      expect(result.modules[0].tasks[0].title).toBe('Task 1');
      expect(result.modules[0].tasks[1].title).toBe('Task 2');
      expect(result.modules[0].tasks[2].title).toBe('Task 3');
    });

    it('should preserve raw text in result', async () => {
      const jsonText = JSON.stringify({
        modules: [
          {
            title: 'Module 1',
            estimatedMinutes: 60,
            tasks: [{ title: 'Task 1', estimatedMinutes: 30 }],
          },
        ],
      });

      const stream = createStream([jsonText]);
      const result = await parseGenerationStream(stream);

      expect(result.rawText).toBe(jsonText);
    });

    it('should identify ParserError by kind', async () => {
      const stream = createStream(['{ invalid json }']);

      try {
        await parseGenerationStream(stream);
        expect.fail('Expected parseGenerationStream to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(ParserError);
        if (error instanceof ParserError) {
          expect(error.kind).toBe('invalid_json');
        }
      }
    });
  });
});
