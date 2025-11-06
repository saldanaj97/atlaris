import { describe, it, expect } from 'vitest';
import { mapTaskToCalendarEvent } from '@/lib/integrations/google-calendar/mapper';
import type { Task } from '@/lib/types/db';

describe('Google Calendar Event Mapper', () => {
  const mockTask: Task = {
    id: 'task-123',
    moduleId: 'module-123',
    title: 'Learn TypeScript basics',
    description: 'Study primitive types and interfaces',
    order: 1,
    estimatedMinutes: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('should map task to calendar event with reminder', () => {
    const startTime = new Date('2025-06-01T10:00:00Z');
    const event = mapTaskToCalendarEvent(mockTask, startTime);

    expect(event.summary).toBe('Learn TypeScript basics');
    expect(event.description).toBe('Study primitive types and interfaces');
    expect(event.start?.dateTime).toBe('2025-06-01T10:00:00.000Z');
    expect(event.end?.dateTime).toBe('2025-06-01T11:00:00.000Z');
    expect(event.reminders?.useDefault).toBe(false);
    expect(event.reminders?.overrides).toHaveLength(1);
    expect(event.reminders?.overrides?.[0].method).toBe('popup');
    expect(event.reminders?.overrides?.[0].minutes).toBe(15);
  });

  it('should handle tasks without description', () => {
    const taskNoDesc = { ...mockTask, description: null };
    const event = mapTaskToCalendarEvent(taskNoDesc, new Date());

    expect(event.description).toBeUndefined();
  });
});
