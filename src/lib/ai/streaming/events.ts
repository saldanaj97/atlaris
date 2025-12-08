import type { StreamingEvent } from './types';

const encoder = new TextEncoder();

export const streamHeaders = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;

export const formatEvent = (event: StreamingEvent): Uint8Array =>
  encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

export type EmitEvent = (event: StreamingEvent) => void;

export function createEventStream(
  handler: (
    emit: EmitEvent,
    controller: ReadableStreamDefaultController<Uint8Array>
  ) => Promise<void> | void
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const emit: EmitEvent = (event) => {
        controller.enqueue(formatEvent(event));
      };

      (async () => {
        try {
          await handler(emit, controller);
        } catch (error) {
          controller.error(error);
          return;
        }

        controller.close();
      })().catch((error) => controller.error(error));
    },
  });
}
