import { proxyIngestRequest } from '@/lib/posthog/ingest-proxy';

export const dynamic = 'force-dynamic';

export const GET = proxyIngestRequest;
export const HEAD = proxyIngestRequest;
export const POST = proxyIngestRequest;
export const PUT = proxyIngestRequest;
export const PATCH = proxyIngestRequest;
export const DELETE = proxyIngestRequest;
export const OPTIONS = proxyIngestRequest;
