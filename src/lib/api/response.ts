import { AppError } from './errors';

interface JsonOptions<Meta = Record<string, unknown> | undefined> {
  status?: number;
  headers?: Record<string, string>;
  meta?: Meta;
}

export function json<Data, Meta = Record<string, unknown> | undefined>(
  data: Data,
  options: JsonOptions<Meta> = {}
) {
  const { status = 200, headers = {}, meta } = options;
  return Response.json({ data, meta }, { status, headers });
}

export function jsonError(
  error: string,
  code: string,
  status = 400,
  details?: unknown
) {
  return Response.json({ error, code, details }, { status });
}

export function notImplemented() {
  return jsonError('Not Implemented', 'NOT_IMPLEMENTED', 501);
}

export function methodNotAllowed() {
  return jsonError('Method Not Allowed', 'METHOD_NOT_ALLOWED', 405);
}

export function assert(condition: unknown, err: AppError) {
  if (!condition) throw err;
}
