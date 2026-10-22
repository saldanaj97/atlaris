/**
 * Collects one eval arm for one tier (JCS-163): creates a plan per topic on
 * staging, generates every module's lessons, times each module, reads the
 * tier key's spend per plan, and writes the lessons to a manifest.
 *
 * It never changes flags: run it once with grounded generation off (v15) and
 * once with it on for the tier (grounded). See docs/testing/grounded-eval.md.
 *
 *   pnpm exec tsx scripts/eval/grounded/run.ts collect --arm v15 --tier pro [--concurrency 3]
 *   pnpm exec tsx scripts/eval/grounded/run.ts classify --manifest <file>
 *   pnpm exec tsx scripts/eval/grounded/run.ts cleanup --manifest <file>
 */
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { LessonContent } from '@/shared/types/lesson-content.types';

import {
  classifyWorkflowSteps,
  type EvalArm,
  type ModuleRun,
  type WorkflowStep,
} from './scoring';
import { EVAL_TOPICS, type EvalTopic, planRequestBody } from './topics';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';

const REQUEST_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 10_000;
const PLAN_TIMEOUT_MS = 15 * 60_000;
const MODULE_TIMEOUT_MS = 20 * 60_000;
/** Lessons in flight per plan; the outline auto-starts the first two. */
const MAX_MODULES_IN_FLIGHT = 2;
const MAX_RATE_LIMIT_WAIT_MS = 15 * 60_000;
/** Consecutive 5xx answers to one module's generate call before it counts as failed. */
const MAX_GENERATE_SERVER_ERRORS = 3;
/** OpenRouter key usage lags generation; wait before the closing reading. */
const COST_SETTLE_MS = 60_000;
const CLERK_API = 'https://api.clerk.com/v1';
const ALLOWED_HOSTS = new Set(['staging.atlaris.app', 'localhost']);
/** Supabase project behind staging.atlaris.app (`atlaris-dev`). */
const STAGING_PROJECT_REF = 'wbdvgscqvnoxaaydkxkv';

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
  /** Throwaway Clerk user created for this plan. */
  readonly throwawayUser: boolean;
  readonly status: 'ready' | 'failed';
  /** The batch's key spend divided by `costBatchSize`. */
  readonly costUsd: number | null;
  /** Plans that ran together and share one cost reading; absent means 1. */
  readonly costBatchSize?: number;
  readonly modules: readonly (ModuleRun & { readonly title: string })[];
  readonly tasks: readonly ManifestTask[];
};

/**
 * A topic run that threw after its throwaway user was created. It is left out
 * of scoring and retried on rerun; `cleanup` deletes what it created.
 */
export type AbandonedRun = {
  readonly topicId: string;
  readonly clerkUserId: string;
  /** `null` when the plan create never answered; cleanup lists the user's plans. */
  readonly planId: string | null;
  readonly error: string;
};

export type Manifest = {
  readonly arm: EvalArm;
  readonly tier: SubscriptionTier;
  readonly baseUrl: string;
  readonly plans: ManifestPlan[];
  abandoned?: AbandonedRun[];
};

/**
 * A problem every topic would hit (missing env, wrong linked project, waitlist
 * redirect, flags on for a v15 run). `collect` stops after the batch.
 */
class SetupError extends Error {}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new SetupError(`Missing ${name}; see docs/testing/grounded-eval.md`);
  }
  return value;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

const NETWORK_RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 40_000];

/**
 * `fetch` that retries network failures and timeouts (never HTTP errors) when
 * `retry` is set. Only pass it for requests that are safe to repeat.
 */
async function fetchRetrying(
  url: string,
  init: RequestInit,
  retry: boolean,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const delay = NETWORK_RETRY_DELAYS_MS[attempt];
      if (!retry || delay === undefined) {
        throw error;
      }
      log(
        `${init.method ?? 'GET'} ${new URL(url).pathname} failed (${
          error instanceof Error ? error.message : String(error)
        }); retrying in ${delay / 1000}s`,
      );
      await sleep(delay);
    }
  }
}

class ClerkError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function clerk<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? 'GET';
  // Minting a session token has no side effect worth guarding against.
  const retry = method === 'GET' || path.endsWith('/tokens');
  const response = await fetchRetrying(
    `${CLERK_API}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${requireEnv('EVAL_CLERK_SECRET_KEY')}`,
        'Content-Type': 'application/json',
      },
    },
    retry,
  );
  if (!response.ok) {
    throw new ClerkError(
      response.status,
      `Clerk ${method} ${path}: ${response.status} ${await response.text()}`,
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

  // Best-effort: the session expires on its own, and a failed revoke must not
  // discard a run or cleanup that already finished.
  async revoke(): Promise<void> {
    try {
      await clerk(`/sessions/${this.sessionId}/revoke`, { method: 'POST' });
    } catch (error) {
      log(`Could not revoke session ${this.sessionId}: ${errorMessage(error)}`);
    }
  }
}

/** The only domain on the staging Clerk allowlist. */
const THROWAWAY_EMAIL_DOMAIN = 'atlaris.app';

async function createThrowawayUser(label: string): Promise<string> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await clerk<{ id: string }>('/users', {
    method: 'POST',
    body: JSON.stringify({
      email_address: [`eval-${label}-${stamp}@${THROWAWAY_EMAIL_DOMAIN}`],
      // The staging instance requires a name and username.
      username: `eval-${label}-${stamp}`.slice(0, 64),
      first_name: 'Eval',
      last_name: label,
      skip_password_requirement: true,
      public_metadata: { atlarisEval: 'JCS-163' },
    }),
  });
  return user.id;
}

const execFileAsync = promisify(execFile);

/**
 * Sets a provisioned user's tier on the staging database through the Supabase
 * CLI, run from `EVAL_SUPABASE_LINKED_DIR` (a checkout linked to staging).
 * Refuses any other linked project.
 */
async function setStagingTier(
  clerkUserId: string,
  tier: SubscriptionTier,
): Promise<void> {
  const dir = requireEnv('EVAL_SUPABASE_LINKED_DIR');
  const ref = readFileSync(
    join(dir, 'supabase/.temp/project-ref'),
    'utf8',
  ).trim();
  if (ref !== STAGING_PROJECT_REF) {
    throw new SetupError(`Refusing to set tiers on linked project ${ref}`);
  }
  if (!/^user_[A-Za-z0-9]+$/.test(clerkUserId)) {
    throw new SetupError(`Unexpected Clerk user id ${clerkUserId}`);
  }
  const { stdout } = await execFileAsync(
    'supabase',
    [
      'db',
      'query',
      '--linked',
      `update users set subscription_tier = '${tier}' where auth_user_id = '${clerkUserId}' returning id`,
    ],
    { cwd: dir, timeout: 60_000 },
  );
  const { rows } = JSON.parse(stdout.slice(stdout.indexOf('{'))) as {
    rows: unknown[];
  };
  if (rows.length !== 1) {
    throw new Error(
      `Tier update for ${clerkUserId} matched ${rows.length} rows`,
    );
  }
}

type ApiResult = { status: number; body: unknown; retryAfterS: number | null };

/**
 * Calls the app API. GETs also retry 5xx and 429 answers, so a transient
 * error while polling does not end a topic's run.
 */
async function api(
  baseUrl: string,
  session: ClerkSession,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult> {
  for (let attempt = 0; ; attempt++) {
    const result = await apiOnce(baseUrl, session, method, path, body);
    const delay = NETWORK_RETRY_DELAYS_MS[attempt];
    if (
      method !== 'GET' ||
      delay === undefined ||
      (result.status < 500 && result.status !== 429)
    ) {
      return result;
    }
    const waitMs = Math.max(delay, (result.retryAfterS ?? 0) * 1000);
    log(`GET ${path}: ${result.status}; retrying in ${waitMs / 1000}s`);
    await sleep(waitMs);
  }
}

async function apiOnce(
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
  const response = await fetchRetrying(
    `${baseUrl}${path}`,
    {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    },
    method === 'GET',
  );
  if (response.status >= 300 && response.status < 400) {
    throw new SetupError(
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
  const response = await fetchRetrying(
    'https://openrouter.ai/api/v1/key',
    { headers: { Authorization: `Bearer ${key}` } },
    true,
  );
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
  topicId: string,
  planId: string,
  modules: readonly DetailModule[],
): Promise<(ModuleRun & { title: string })[]> {
  const startedAt = new Map<string, number>();
  const done = new Map<string, ModuleRun & { title: string }>();
  /** Consecutive 5xx answers to a module's generate call. */
  const serverErrors = new Map<string, number>();
  let rateLimitedUntil = 0;
  const lessonPath = (moduleId: string) =>
    `/api/v1/plans/${planId}/modules/${moduleId}/lesson-content`;

  while (done.size < modules.length) {
    for (const module of modules) {
      if (done.has(module.id)) {
        continue;
      }
      const { status, workflowRunId } = expectOk(
        await api(baseUrl, session, 'GET', `${lessonPath(module.id)}/status`),
        'lesson status',
      ) as { status: string; workflowRunId?: string };
      const now = Date.now();
      const started = startedAt.get(module.id);

      if (status === 'ready' || status === 'failed') {
        done.set(module.id, {
          moduleId: module.id,
          title: module.title,
          status,
          durationMs: started === undefined ? 0 : now - started,
          workflowRunId,
        });
        log(`${topicId}: module "${module.title}": ${status}`);
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
            workflowRunId,
          });
          log(`${topicId}: module "${module.title}": timed out`);
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
          `${topicId}: lesson generation rate-limited; retrying in ${Math.round(waitMs / 60_000)} min`,
        );
        continue;
      }
      if (result.status >= 500) {
        // The next poll rereads the status, so a start that did land is seen
        // before the call is repeated.
        const errors = (serverErrors.get(module.id) ?? 0) + 1;
        serverErrors.set(module.id, errors);
        log(
          `${topicId}: module "${module.title}": generate answered ${result.status} (${errors}/${MAX_GENERATE_SERVER_ERRORS})`,
        );
        if (errors >= MAX_GENERATE_SERVER_ERRORS) {
          done.set(module.id, {
            moduleId: module.id,
            title: module.title,
            status: 'failed',
            durationMs: 0,
          });
        }
        continue;
      }
      serverErrors.delete(module.id);
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
    throw new SetupError(
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

type PlanRun = Omit<ManifestPlan, 'costUsd' | 'costBatchSize'>;

type TopicOutcome =
  | { readonly ok: true; readonly run: PlanRun }
  | {
      readonly ok: false;
      readonly abandoned: AbandonedRun;
      readonly setupError: boolean;
    };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Creates and generates one topic's plan under a new throwaway user. Every
 * tier gets its own user per plan so per-user rate limits never queue plans.
 * Once the user exists, a failure returns what was created instead of
 * throwing, so the manifest keeps it for `cleanup`. `onCreated` reports the
 * user and then the plan as each is created.
 */
async function runTopic(
  baseUrl: string,
  options: { arm: EvalArm; tier: SubscriptionTier },
  topic: EvalTopic,
  onCreated: (created: Pick<AbandonedRun, 'clerkUserId' | 'planId'>) => void,
): Promise<TopicOutcome> {
  const clerkUserId = await createThrowawayUser(topic.id);
  let planId: string | null = null;
  onCreated({ clerkUserId, planId });
  try {
    const run = await runTopicAs(baseUrl, options, topic, clerkUserId, (id) => {
      planId = id;
      onCreated({ clerkUserId, planId });
    });
    return { ok: true, run };
  } catch (error) {
    return {
      ok: false,
      abandoned: {
        topicId: topic.id,
        clerkUserId,
        planId,
        error: errorMessage(error),
      },
      setupError: error instanceof SetupError,
    };
  }
}

async function runTopicAs(
  baseUrl: string,
  options: { arm: EvalArm; tier: SubscriptionTier },
  topic: EvalTopic,
  clerkUserId: string,
  onPlanCreated: (planId: string) => void,
): Promise<PlanRun> {
  const session = await ClerkSession.open(clerkUserId);
  try {
    if (options.tier !== 'free') {
      // The first authenticated request provisions the app's user row.
      expectOk(
        await api(baseUrl, session, 'GET', '/api/v1/user/profile'),
        'user profile',
      );
      await setStagingTier(clerkUserId, options.tier);
    }
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
    onPlanCreated(planId);

    const planStatus = await waitForPlan(baseUrl, session, planId);
    log(`${topic.id}: outline ${planStatus}`);
    const detail = expectOk(
      await api(baseUrl, session, 'GET', `/api/v1/plans/${planId}`),
      'plan detail',
    ) as { modules: DetailModule[] };
    const modules = [...detail.modules].sort((a, b) => a.order - b.order);
    const moduleRuns =
      planStatus === 'ready'
        ? await generateModules(baseUrl, session, topic.id, planId, modules)
        : [];
    const tasks = await collectTasks(baseUrl, session, planId, modules);
    checkArm(options.arm, tasks);
    return {
      topicId: topic.id,
      planId,
      clerkUserId,
      throwawayUser: true,
      status: planStatus,
      modules: moduleRuns,
      tasks,
    };
  } finally {
    await session.revoke();
  }
}

/**
 * Runs topics in batches of `concurrency`. The tier key is read before and
 * after each batch, so a batch's plans share its spend evenly.
 */
async function collect(options: {
  arm: EvalArm;
  tier: SubscriptionTier;
  out: string;
  topicIds: readonly string[] | null;
  concurrency: number;
}): Promise<void> {
  const baseUrl = resolveBaseUrl();
  const manifest: Manifest = existsSync(options.out)
    ? readManifest(options.out)
    : { arm: options.arm, tier: options.tier, baseUrl, plans: [] };
  if (manifest.arm !== options.arm || manifest.tier !== options.tier) {
    throw new Error(`${options.out} holds ${manifest.arm}/${manifest.tier}`);
  }
  const topics = EVAL_TOPICS.filter((t) => {
    if (options.topicIds && !options.topicIds.includes(t.id)) {
      return false;
    }
    if (manifest.plans.some((p) => p.topicId === t.id)) {
      log(`skip ${t.id}: already in manifest`);
      return false;
    }
    return true;
  });

  for (let i = 0; i < topics.length; i += options.concurrency) {
    const batch = topics.slice(i, i + options.concurrency);
    const usageBefore = await readKeyUsageUsd();
    // Record each run's user and plan as they are created, so an interrupted
    // runner still leaves them in the manifest for `cleanup`.
    const inFlight = new Map<string, AbandonedRun>();
    const results = await Promise.allSettled(
      batch.map((topic) =>
        runTopic(baseUrl, options, topic, (created) => {
          const previous = inFlight.get(topic.id);
          const entry: AbandonedRun = {
            topicId: topic.id,
            ...created,
            error: 'interrupted: the runner stopped before this run finished',
          };
          inFlight.set(topic.id, entry);
          manifest.abandoned = [
            ...(manifest.abandoned ?? []).filter((r) => r !== previous),
            entry,
          ];
          writeManifest(options.out, manifest);
        }),
      ),
    );
    const finished = new Set(inFlight.values());
    manifest.abandoned = manifest.abandoned?.filter((r) => !finished.has(r));
    const runs: PlanRun[] = [];
    let setupError: string | null = null;
    results.forEach((result, index) => {
      let error: string;
      if (result.status === 'rejected') {
        error = errorMessage(result.reason);
        if (result.reason instanceof SetupError) {
          setupError = error;
        }
      } else if (result.value.ok) {
        runs.push(result.value.run);
        return;
      } else {
        error = result.value.abandoned.error;
        (manifest.abandoned ??= []).push(result.value.abandoned);
        if (result.value.setupError) {
          setupError = error;
        }
      }
      log(`${batch[index]!.id}: run failed (${error}); rerun to retry it`);
    });

    let batchCostUsd: number | null = null;
    if (usageBefore !== null && runs.length > 0) {
      await sleep(COST_SETTLE_MS);
      try {
        const usageAfter = await readKeyUsageUsd();
        batchCostUsd = usageAfter === null ? null : usageAfter - usageBefore;
      } catch (error) {
        // The batch's runs are still recorded; their cost reads as unmeasured.
        log(`closing key usage read failed (${errorMessage(error)})`);
      }
    }
    for (const run of runs) {
      // A failed run's spend lands on the batch's recorded plans.
      const costUsd = batchCostUsd === null ? null : batchCostUsd / runs.length;
      manifest.plans.push({ ...run, costUsd, costBatchSize: runs.length });
      log(
        `${run.topicId}: ${run.status}, ${run.modules.filter((m) => m.status === 'ready').length}/${run.modules.length} modules ready, ${run.tasks.length} lessons, cost ${
          costUsd === null ? 'unmeasured' : `$${costUsd.toFixed(4)}`
        }`,
      );
    }
    writeManifest(options.out, manifest);
    if (setupError !== null) {
      throw new Error(
        `Stopping before the next batch: ${setupError}. Fix the setup, then rerun.`,
      );
    }
    if (runs.length < batch.length) {
      process.exitCode = 1;
    }
  }
}

/** The staging lesson Workflow; the eval never reads production instances. */
const STAGING_LESSONS_WORKFLOW = 'atlaris-module-lessons-staging';
const JOBS_WORKER_DIR = 'workers/jobs';

/**
 * Reads each module's lesson workflow instance on staging and records its
 * failure cause and longest provider call in the manifest.
 */
async function classify(manifestPath: string): Promise<void> {
  const manifest = readManifest(manifestPath);
  if (new URL(manifest.baseUrl).hostname !== 'staging.atlaris.app') {
    throw new Error('classify reads staging workflow instances only');
  }
  const plans = [];
  for (const plan of manifest.plans) {
    const modules = [];
    for (const module of plan.modules) {
      if (!module.workflowRunId || module.longestCallMs !== undefined) {
        modules.push(module);
        continue;
      }
      let instance: { steps?: WorkflowStep[] };
      try {
        const { stdout } = await execFileAsync(
          resolve(JOBS_WORKER_DIR, 'node_modules/.bin/wrangler'),
          [
            'workflows',
            'instances',
            'describe',
            STAGING_LESSONS_WORKFLOW,
            module.workflowRunId,
            '--json',
          ],
          { cwd: JOBS_WORKER_DIR, maxBuffer: 64 * 1024 * 1024 },
        );
        // Wrangler prints a banner before the JSON.
        instance = JSON.parse(stdout.slice(stdout.indexOf('{'))) as {
          steps?: WorkflowStep[];
        };
      } catch (error) {
        // Leave this module unclassified so a rerun retries it.
        log(
          `${plan.topicId}: module "${module.title}": could not read workflow ${module.workflowRunId}: ${errorMessage(error)}`,
        );
        process.exitCode = 1;
        modules.push(module);
        continue;
      }
      const result = classifyWorkflowSteps(
        instance.steps ?? [],
        module.status === 'failed',
      );
      log(
        `${plan.topicId}: module "${module.title}": ${module.status}${
          result.failureCause ? ` (${result.failureCause})` : ''
        }, longest call ${((result.longestCallMs ?? 0) / 1000).toFixed(1)} s`,
      );
      modules.push({ ...module, ...result });
    }
    plans.push({ ...plan, modules });
    // Save after each plan so an interrupted run keeps what it classified.
    writeManifest(manifestPath, {
      ...manifest,
      plans: [...plans, ...manifest.plans.slice(plans.length)],
    });
  }
}

type CleanupEntry = {
  readonly clerkUserId: string;
  readonly planId: string | null;
  readonly throwawayUser: boolean;
};

/**
 * Deletes one entry's plans: its recorded plan, or every plan the user owns
 * when the create never answered. True when none is left.
 */
async function deletePlans(
  baseUrl: string,
  entry: CleanupEntry,
): Promise<boolean> {
  const session = await ClerkSession.open(entry.clerkUserId);
  try {
    const planIds = entry.planId
      ? [entry.planId]
      : (
          expectOk(
            await api(baseUrl, session, 'GET', '/api/v1/plans'),
            'list plans',
          ) as { id: string }[]
        ).map((p) => p.id);
    let allDeleted = true;
    for (const planId of planIds) {
      const result = await api(
        baseUrl,
        session,
        'DELETE',
        `/api/v1/plans/${planId}`,
      );
      log(`plan ${planId}: delete ${result.status}`);
      allDeleted &&=
        (result.status >= 200 && result.status < 300) || result.status === 404;
    }
    return allDeleted;
  } finally {
    await session.revoke();
  }
}

/**
 * Deletes the manifest's plans, abandoned runs included, then their throwaway
 * Clerk users. A user is deleted only once its plans are; one entry's failure
 * is logged and the rest still run.
 */
async function cleanup(manifestPath: string): Promise<void> {
  const baseUrl = resolveBaseUrl();
  const manifest = readManifest(manifestPath);
  const entries: CleanupEntry[] = [
    ...manifest.plans,
    ...(manifest.abandoned ?? []).map((run) => ({
      ...run,
      throwawayUser: true,
    })),
  ];
  for (const entry of entries) {
    try {
      // A generating plan answers 409; keep its user so a rerun can delete it.
      if (!(await deletePlans(baseUrl, entry))) {
        process.exitCode = 1;
        continue;
      }
      if (entry.throwawayUser) {
        await clerk(`/users/${entry.clerkUserId}`, { method: 'DELETE' });
        log(`clerk user ${entry.clerkUserId}: deleted`);
      }
    } catch (error) {
      if (error instanceof ClerkError && error.status === 404) {
        log(`clerk user ${entry.clerkUserId}: already deleted`);
        continue;
      }
      log(
        `clerk user ${entry.clerkUserId}: cleanup failed (${errorMessage(error)})`,
      );
      process.exitCode = 1;
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
      concurrency: { type: 'string' },
    },
  });
  const command = positionals[0];
  if (command === 'classify') {
    if (!values.manifest) {
      throw new Error('classify needs --manifest <file>');
    }
    await classify(values.manifest);
    return;
  }
  if (command === 'cleanup') {
    if (!values.manifest) {
      throw new Error('cleanup needs --manifest <file>');
    }
    await cleanup(values.manifest);
    return;
  }
  if (command !== 'collect') {
    throw new Error(
      'usage: run.ts collect --arm v15|grounded --tier free|starter|pro [--concurrency N] | classify --manifest <file> | cleanup --manifest <file>',
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
  const concurrency = Number(values.concurrency ?? '1');
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('--concurrency needs a positive integer');
  }
  await collect({
    arm,
    tier,
    out: values.out ?? `tests/results/grounded-eval/${arm}-${tier}.json`,
    topicIds: values.topics ? values.topics.split(',') : null,
    concurrency,
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
