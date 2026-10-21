/**
 * Stream shapes from the 2026-10-20 server-tool spike (JCS-149): citations in
 * `delta.annotations`, search counts in `usage.server_tool_use_details` (no
 * `server_tool_use`), and total `cost` including the advisor.
 */

const WEB_SEARCH_PLAN_JSON =
  '{"modules":[{"title":"Rust ownership","sources":["https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html"]}]}';

/** Gemini-style: JSON split across deltas, citations on a content-free delta. */
export const WEB_SEARCH_STREAM_CHUNKS: readonly unknown[] = [
  {
    id: 'gen-1',
    model: 'google/gemini-3-flash-preview',
    choices: [{ index: 0, delta: { role: 'assistant', content: '' } }],
  },
  {
    id: 'gen-1',
    model: 'google/gemini-3-flash-preview',
    choices: [
      {
        index: 0,
        delta: {
          content: '',
          annotations: [
            {
              type: 'url_citation',
              url_citation: {
                url: 'https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html',
                title:
                  'Understanding Ownership - The Rust Programming Language',
                content: 'Ownership is a set of rules [...] memory',
                start_index: 0,
                end_index: 0,
              },
            },
            {
              type: 'url_citation',
              url_citation: {
                url: 'https://rust-lang.org/learn',
                title: 'Learn Rust',
              },
            },
          ],
        },
      },
    ],
  },
  {
    id: 'gen-1',
    model: 'google/gemini-3-flash-preview',
    choices: [
      { index: 0, delta: { content: WEB_SEARCH_PLAN_JSON.slice(0, 40) } },
    ],
  },
  {
    id: 'gen-1',
    model: 'google/gemini-3-flash-preview',
    choices: [
      {
        index: 0,
        delta: {
          content: WEB_SEARCH_PLAN_JSON.slice(40),
          annotations: [
            {
              type: 'url_citation',
              url_citation: {
                url: 'https://rust-lang.org/learn',
                title: 'Learn Rust',
              },
            },
          ],
        },
        finish_reason: 'stop',
      },
    ],
  },
  {
    id: 'gen-1',
    model: 'google/gemini-3-flash-preview',
    choices: [{ index: 0, delta: { content: '' }, finish_reason: null }],
    usage: {
      prompt_tokens: 4210,
      completion_tokens: 388,
      total_tokens: 4598,
      cost: 0.012734,
      prompt_tokens_details: { cached_tokens: 3900, cache_write_tokens: 0 },
      completion_tokens_details: { reasoning_tokens: 0 },
      server_tool_use_details: {
        web_search_requests: 2,
        tool_calls_executed: 3,
        tool_calls_requested: 3,
      },
    },
  },
];

export const WEB_SEARCH_STREAM_TEXT = WEB_SEARCH_PLAN_JSON;

/** Haiku-style: ignores `json_object` and wraps the JSON in a fence and prose. */
export const HAIKU_FENCED_TEXT = [
  'Here is the plan based on {current} docs:\n\n',
  '```json\n{"modules":[{"title":"Intro","note":"uses } braces"}]}\n```\n',
  '\nLet me know if you want changes.',
].join('');

/** Mid-stream failure, as OpenRouter reports it after the 200 status. */
export const MID_STREAM_ERROR_CHUNKS: readonly unknown[] = [
  {
    id: 'gen-2',
    model: 'anthropic/claude-haiku-4.5',
    choices: [{ index: 0, delta: { content: '{"modules":' } }],
  },
  {
    id: 'gen-2',
    error: { code: 502, message: 'Provider returned error' },
    choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }],
  },
];

/** Encodes chunks as an OpenRouter SSE body with a keep-alive comment. */
export function toSseBody(chunks: readonly unknown[]): string {
  return [
    ': OPENROUTER PROCESSING',
    ...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}`),
    'data: [DONE]',
  ]
    .map((event) => `${event}\n\n`)
    .join('');
}

/** A byte stream that splits `body` at awkward places, mid-line included. */
export function toByteStream(
  body: string,
  sliceSize = 37,
): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(body);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += sliceSize) {
        controller.enqueue(bytes.slice(offset, offset + sliceSize));
      }
      controller.close();
    },
  });
}
