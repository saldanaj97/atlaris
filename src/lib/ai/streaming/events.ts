import type { StreamingEvent } from '@/lib/ai/streaming/types';
import { logger } from '@/lib/logging/logger';

const encoder = new TextEncoder();

export const streamHeaders = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;

export const formatEvent = (event: StreamingEvent): Uint8Array =>
  encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

export type EmitEvent = (event: StreamingEvent) => void;

export interface EventStreamContext {
  signal: AbortSignal;
  onCancel: (handler: () => void) => void;
}

export function createEventStream(
  handler: (
    emit: EmitEvent,
    controller: ReadableStreamDefaultController<Uint8Array>,
    context: EventStreamContext
  ) => Promise<void> | void
): ReadableStream<Uint8Array> {
  const cancelHandlers = new Set<() => void>();
  let abortController: AbortController | null = null;

  return new ReadableStream({
    start(controller) {
      abortController = new AbortController();
      const currentAbortController = abortController;
      let closed = false;

      const closeSafely = () => {
        if (closed) {
          return;
        }
        closed = true;
        try {
          controller.close();
        } catch {
          // Ignore close-after-close errors.
        }
      };

      const errorSafely = (error: unknown) => {
        try {
          controller.error(error);
        } catch {
          closeSafely();
        }
      };

      const emit: EmitEvent = (event) => {
        if (closed || currentAbortController.signal.aborted) {
          return;
        }
        controller.enqueue(formatEvent(event));
      };

      const context: EventStreamContext = {
        signal: currentAbortController.signal,
        onCancel: (cancelHandler) => {
          cancelHandlers.add(cancelHandler);
        },
      };

      (async () => {
        try {
          await handler(emit, controller, context);
        } catch (error) {
          if (currentAbortController.signal.aborted) {
            closeSafely();
            return;
          }
          errorSafely(error);
          return;
        }

        closeSafely();
      })().catch((error) => errorSafely(error));
    },
    cancel() {
      const activeController = abortController;
      // Abort first so in-flight work sees the signal; then run cleanup handlers.
      activeController?.abort();
      for (const cancelHandler of cancelHandlers.values()) {
        try {
          cancelHandler();
        } catch (error) {
          logger.error(
            { error },
            'Failed while handling stream cancellation callback'
          );
        }
      }
      cancelHandlers.clear();
    },
  });
}
