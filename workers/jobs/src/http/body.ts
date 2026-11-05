/**
 * Reads a request body as UTF-8 text (like `request.text()`), stopping once it
 * passes `maxBytes`. Returns null for an oversized body and cancels the rest
 * of the stream, so the Worker never buffers more than the cap.
 */
export async function readBodyTextCapped(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  if (request.body === null) {
    return '';
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let length = 0;
  let text = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return text + decoder.decode();
    }
    length += value.byteLength;
    if (length > maxBytes) {
      // Best-effort: the request is rejected whether or not cancel succeeds.
      await reader.cancel().catch(() => undefined);
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}
