import type { EvalArm, ModuleRun } from './scoring';
/**
 * Collects one eval arm for one tier (JCS-163): creates a plan per topic on
 * staging, generates every module's lessons, times each module, reads the
 * tier key's spend per plan, and writes the lessons to a manifest.
 *
 * It never changes flags: run it once with grounded generation off (v15) and
 * once with it on for the tier (grounded). See docs/testing/grounded-eval.md.
 *
 *   pnpm exec tsx scripts/eval/grounded/run.ts collect --arm v15 --tier pro
 *   pnpm exec tsx scripts/eval/grounded/run.ts cleanup --manifest <file>
 */
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { LessonContent } from '@/shared/types/lesson-content.types';

import { EVAL_TOPICS, planRequestBody } from './topics';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const REQUEST_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 10_000;
const PLAN_TIMEOUT_MS = 15 * 60_000;
const MODULE_TIMEOUT_MS = 20 * 60_000;
/** Lessons in flight per plan; the outline auto-starts the first two. */
const MAX_MODULES_IN_FLIGHT = 2;
const MAX_RATE_LIMIT_WAIT_MS = 15 * 60_000;
/** OpenRouter key usage lags generation; wait before the closing reading. */
const COST_SETTLE_MS = 60_000;
const CLERK_API = 'https://api.clerk.com/v1';
const ALLOWED_HOSTS = new Set(['staging.atlaris.app', 'localhost']);

export type ManifestTask = {
  readonly taskId: string;
  readonly moduleId: string;
  readonly moduleTitle: string;
  readonly title: string;
  readonly estimatedMinutes: number;
  readonly lessonContent: LessonContent | null;
};

export type ManifestPlan = {
  readonly topicId: string;
  readonly planId: string;
  readonly clerkUserId: string;
  /** Throwaway Clerk user created for this plan (free tier). */
  readonly throwawayUser: boolean;
  readonly status: 'ready' | 'failed';
  readonly costUsd: number | null;
  readonly modules: readonly (ModuleRun & { readonly title: string })[];
  readonly tasks: readonly ManifestTask[];
};

export type Manifest = {
  readonly arm: EvalArm;
  readonly tier: SubscriptionTier;
  readonly baseUrl: string;
  readonly plans: ManifestPlan[];
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}; see docs/testing/grounded-eval.md`);
  }
  return value;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function clerk<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${CLERK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireEnv('EVAL_CLERK_SECRET_KEY')}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Clerk ${init.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
}

/** A Clerk session for one user; session JWTs last about a minute. */
class ClerkSession {
  private token: { jwt: string; at: number } | null = null;

  private constructor(
    readonly userId: string,
    private readonly sessionId: string,
  ) {}

  static async open(userId: string): Promise<ClerkSession> {
    const session = await clerk<{ id: string }>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
    return new ClerkSession(userId, session.id);
  }

  async jwt(): Promise<string> {
    if (!this.token || Date.now() - this.token.at > 30_000) {
      const { jwt } = await clerk<{ jwt: string }>(
        `/sessions/${this.sessionId}/tokens`,
        { method: 'POST' },
      );
      this.token = { jwt, at: Date.now() };
    }
    return this.token.jwt;
  }

  async revoke(): Promise<void> {
    await clerk(`/sessions/${this.sessionId}/revoke`, { method: 'POST' });
  }
}

async function createThrowawayUser(label: string): Promise<string> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await clerk<{ id: string }>('/users', {
    method: 'POST',
    body: JSON.stringify({
      email_address: [`eval-${label}-${stamp}@example.com`],
      skip_password_requirement: true,
      public_metadata: { atlarisEval: 'JCS-163' },
    }),
  });
  return user.id;
}

type ApiResult = { status: number; body: unknown; retryAfterS: number | null };

async function api(
  baseUrl: string,
  session: ClerkSession,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await session.jwt()}`,
    Accept: 'application/json',
  };
  const bypass = process.env.EVAL_VERCEL_BYPASS;
  if (bypass) {
    headers['x-vercel-protection-bypass'] = bypass;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error(
      `${method} ${path} redirected to ${response.headers.get('location')}; is the launch waitlist on or the bypass missing?`,
    );
  }
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON error pages stay as text for the error message.
  }
  const retryAfter = Number(response.headers.get('retry-after'));
  return {
    status: response.status,
    body: parsed,
    retryAfterS:
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
  };
}

function expectOk(result: ApiResult, what: string): unknown {
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${what}: ${result.status} ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

/** Total spend on the tier key, USD; `null` when no key is configured. */
async function readKeyUsageUsd(): Promise<number | null> {
  const key = process.env.EVAL_TIER_OPENROUTER_API_KEY;
  if (!key) {
    return null;
  }
  const response = await fetch('https://openrouter.ai/api/v1/key', {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`OpenRouter key read failed: ${response.status}`);
  }
  const { data } = (await response.json()) as { data: { usage: number } };
  return data.usage;
}

async function waitForPlan(
  baseUrl: string,
  session: ClerkSession,
  planId: string,
): Promise<'ready' | 'failed'> {
  const deadline = Date.now() + PLAN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const body = expectOk(
      await api(baseUrl, session, 'GET', `/api/v1/plans/${planId}/status`),
      'plan status',
    ) as { status: string; latestError: string | null };
    if (body.status === 'ready') {
      return 'ready';
    }
    if (body.status === 'failed') {
      log(`plan ${planId} failed: ${body.latestError ?? 'no error recorded'}`);
      return 'failed';
    }
    await sleep(POLL_INTERVAL_MS);
  }
  log(`plan ${planId} timed out after ${PLAN_TIMEOUT_MS / 60_000} min`);
  return 'failed';
}

type DetailModule = { id: string; order: number; title: string };

/**
 * Drives every module to a terminal state, at most two at a time. A module's
 * clock starts when it is first seen generating (auto-started ones) or when
 * the runner starts it, so times can be up to one poll interval short.
 */
async function generateModules(
  baseUrl: string,
  session: ClerkSession,
  planId: string,
  modules: readonly DetailModule[],
): Promise<(ModuleRun & { title: string })[]> {
  const startedAt = new Map<string, number>();
  const done = new Map<string, ModuleRun & { title: string }>();
  let rateLimitedUntil = 0;
  const lessonPath = (moduleId: string) =>
    `/api/v1/plans/${planId}/modules/${moduleId}/lesson-content`;

  while (done.size < modules.length) {
    for (const module of modules) {
      if (done.has(module.id)) {
        continue;
      }
      const { status } = expectOk(
        await api(baseUrl, session, 'GET', `${lessonPath(module.id)}/status`),
        'lesson status',
      ) as { status: string };
      const now = Date.now();
      const started = startedAt.get(module.id);

      if (status === 'ready' || status === 'failed') {
        done.set(module.id, {
          moduleId: module.id,
          title: module.title,
          status,
          durationMs: started === undefined ? 0 : now - started,
        });
        log(`module "${module.title}": ${status}`);
        continue;
      }
      if (status === 'generating') {
        if (started === undefined) {
          startedAt.set(module.id, now);
        } else if (now - started > MODULE_TIMEOUT_MS) {
          done.set(module.id, {
            moduleId: module.id,
            title: module.title,
            status: 'failed',
            durationMs: now - started,
          });
          log(`module "${module.title}": timed out`);
        }
        continue;
      }
      const inFlight = [...startedAt.keys()].filter((id) => !done.has(id));
      if (inFlight.length >= MAX_MODULES_IN_FLIGHT || now < rateLimitedUntil) {
        continue;
      }
      const result = await api(
        baseUrl,
        session,
        'POST',
        `${lessonPath(module.id)}/generate`,
      );
      if (result.status === 429) {
        const waitMs = Math.min(
          (result.retryAfterS ?? 600) * 1000,
          MAX_RATE_LIMIT_WAIT_MS,
        );
        rateLimitedUntil = now + waitMs;
        log(
          `lesson generation rate-limited; retrying in ${Math.round(waitMs / 60_000)} min`,
        );
        continue;
      }
      const body = expectOk(result, 'lesson generate') as { state: string };
      if (body.state === 'generating' || body.state === 'ready') {
        startedAt.set(module.id, now);
      } else {
        throw new Error(`lesson generate returned state ${body.state}`);
      }
    }
    if (done.size < modules.length) {
      await sleep(POLL_INTERVAL_MS);
    }
  }
  return modules.map((m) => done.get(m.id)!);
}

async function collectTasks(
  baseUrl: string,
  session: ClerkSession,
  planId: string,
  modules: readonly DetailModule[],
): Promise<ManifestTask[]> {
  const rows = expectOk(
    await api(baseUrl, session, 'GET', `/api/v1/plans/${planId}/tasks`),
    'plan tasks',
  ) as {
    id: string;
    moduleId: string;
    order: number;
    title: string;
    estimatedMinutes: number;
    lessonContent: LessonContent | null;
  }[];
  const moduleById = new Map(modules.map((m) => [m.id, m]));
  return [...rows]
    .sort(
      (a, b) =>
        (moduleById.get(a.moduleId)?.order ?? 0) -
          (moduleById.get(b.moduleId)?.order ?? 0) || a.order - b.order,
    )
    .map((row) => ({
      taskId: row.id,
      moduleId: row.moduleId,
      moduleTitle: moduleById.get(row.moduleId)?.title ?? '',
      title: row.title,
      estimatedMinutes: row.estimatedMinutes,
      lessonContent: row.lessonContent,
    }));
}

/** v15 lessons never carry `sourceIds`; grounded ones should. */
function checkArm(arm: EvalArm, tasks: readonly ManifestTask[]): void {
  const cited = tasks.filter((t) => t.lessonContent?.sourceIds?.length).length;
  if (arm === 'v15' && cited > 0) {
    throw new Error(
      `${cited} lesson(s) cite sources, so grounded generation is on; this is not a v15 run`,
    );
  }
  if (arm === 'grounded' && cited === 0) {
    log(
      'warning: no lesson cites a source; check the grounded flags for this tier',
    );
  }
}

function readManifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

function writeManifest(path: string, manifest: Manifest): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function resolveBaseUrl(): string {
  const baseUrl = requireEnv('EVAL_BASE_URL').replace(/\/$/, '');
  const { hostname } = new URL(baseUrl);
  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new Error(
      `Refusing ${hostname}: the eval runs on staging or localhost only`,
    );
  }
  return baseUrl;
}

async function collect(options: {
  arm: EvalArm;
  tier: SubscriptionTier;
  out: string;
  topicIds: readonly string[] | null;
}): Promise<void> {
  const baseUrl = resolveBaseUrl();
  const manifest: Manifest = existsSync(options.out)
    ? readManifest(options.out)
    : { arm: options.arm, tier: options.tier, baseUrl, plans: [] };
  if (manifest.arm !== options.arm || manifest.tier !== options.tier) {
    throw new Error(`${options.out} holds ${manifest.arm}/${manifest.tier}`);
  }
  const topics = EVAL_TOPICS.filter(
    (t) => !options.topicIds || options.topicIds.includes(t.id),
  );

  for (const topic of topics) {
    if (manifest.plans.some((p) => p.topicId === topic.id)) {
      log(`skip ${topic.id}: already in manifest`);
      continue;
    }
    // Free allows one lifetime plan, so each free plan gets its own user.
    const throwawayUser = options.tier === 'free';
    const clerkUserId = throwawayUser
      ? await createThrowawayUser(topic.id)
      : requireEnv('EVAL_CLERK_USER_ID');
    const session = await ClerkSession.open(clerkUserId);
    try {
      const usageBefore = await readKeyUsageUsd();
      log(`${topic.id}: creating plan (${options.arm}, ${options.tier})`);
      const { planId } = expectOk(
        await api(
          baseUrl,
          session,
          'POST',
          '/api/v1/plans',
          planRequestBody(topic, new Date()),
        ),
        'create plan',
      ) as { planId: string };

      const planStatus = await waitForPlan(baseUrl, session, planId);
      const detail = expectOk(
        await api(baseUrl, session, 'GET', `/api/v1/plans/${planId}`),
        'plan detail',
      ) as { modules: DetailModule[] };
      const modules = [...detail.modules].sort((a, b) => a.order - b.order);
      const moduleRuns =
        planStatus === 'ready'
          ? await generateModules(baseUrl, session, planId, modules)
          : [];
      const tasks = await collectTasks(baseUrl, session, planId, modules);
      checkArm(options.arm, tasks);

      let costUsd: number | null = null;
      if (usageBefore !== null) {
        await sleep(COST_SETTLE_MS);
        const usageAfter = await readKeyUsageUsd();
        costUsd = usageAfter === null ? null : usageAfter - usageBefore;
      }

      manifest.plans.push({
        topicId: topic.id,
        planId,
        clerkUserId,
        throwawayUser,
        status: planStatus,
        costUsd,
        modules: moduleRuns,
        tasks,
      });
      writeManifest(options.out, manifest);
      log(
        `${topic.id}: ${planStatus}, ${moduleRuns.length} modules, ${tasks.length} lessons, cost ${
          costUsd === null ? 'unmeasured' : `$${costUsd.toFixed(4)}`
        }`,
      );
    } finally {
      await session.revoke();
    }
  }
}

/** Deletes the manifest's plans, then its throwaway Clerk users. */
async function cleanup(manifestPath: string): Promise<void> {
  const baseUrl = resolveBaseUrl();
  const manifest = readManifest(manifestPath);
  for (const plan of manifest.plans) {
    const session = await ClerkSession.open(plan.clerkUserId);
    try {
      const result = await api(
        baseUrl,
        session,
        'DELETE',
        `/api/v1/plans/${plan.planId}`,
      );
      log(`plan ${plan.planId}: delete ${result.status}`);
    } finally {
      await session.revoke();
    }
    if (plan.throwawayUser) {
      await clerk(`/users/${plan.clerkUserId}`, { method: 'DELETE' });
      log(`clerk user ${plan.clerkUserId}: deleted`);
    }
  }
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      arm: { type: 'string' },
      tier: { type: 'string' },
      topics: { type: 'string' },
      out: { type: 'string' },
      manifest: { type: 'string' },
    },
  });
  const command = positionals[0];
  if (command === 'cleanup') {
    if (!values.manifest) {
      throw new Error('cleanup needs --manifest <file>');
    }
    await cleanup(values.manifest);
    return;
  }
  if (command !== 'collect') {
    throw new Error(
      'usage: run.ts collect --arm v15|grounded --tier free|starter|pro | cleanup --manifest <file>',
    );
  }
  const arm = values.arm as EvalArm;
  const tier = values.tier as SubscriptionTier;
  if (
    !['v15', 'grounded'].includes(arm) ||
    !['free', 'starter', 'pro'].includes(tier)
  ) {
    throw new Error(
      'collect needs --arm v15|grounded and --tier free|starter|pro',
    );
  }
  await collect({
    arm,
    tier,
    out: values.out ?? `tests/results/grounded-eval/${arm}-${tier}.json`,
    topicIds: values.topics ? values.topics.split(',') : null,
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
