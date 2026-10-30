// atlaris-jobs: background jobs Worker. Layout and modes:
// docs/architecture/cloudflare-jobs-runtime.md (Decisions 1, 2, 5).
// Without `--mode` the config is local-only (`pnpm workers dev`) and is never
// deployed. Bindings, vars, and secrets are per mode, so each mode lists its own.
// Job switches (JOBS_PAUSED, JOB_*_ENABLED) are Worker secrets in the deployed
// modes (design note, Decision 7): declared here so a deploy keeps them, and
// flipped with `cf workers secrets update`, never from Git.
import { bindings, defineConfig, exports, triggers } from 'cf/config';

type DeployedMode = 'staging' | 'production';

// nodejs_compat is on by default from compatibility date 2026-08-04.
const COMPATIBILITY_DATE = '2026-09-26';

/** atlaris-jobs Sentry project (not a secret). */
const SENTRY_DSN =
  'https://416c04d341072377c95d42ea58df1b80@o4510462002462720.ingest.us.sentry.io/4512206008745984';

/** Operator-managed secrets; `pnpm secrets:sync cloudflare <mode>` writes them. */
const DEPLOYED_SECRETS = [
  'JOBS_SIGNING_SECRET',
  'OPENROUTER_API_KEY',
  'OPENROUTER_PLAN_PRESET',
  'OPENROUTER_LESSON_PRESET',
  // Cloudflare AI Gateway in front of OpenRouter: the gateway's /openrouter URL
  // and its authentication token.
  'OPENROUTER_BASE_URL',
  'CF_AI_GATEWAY_TOKEN',
  // Parallel Search for direct plan research (DEV-171; `PARALLEL_DIRECT_RESEARCH`).
  'PARALLEL_API_KEY',
  'RESEND_API_KEY',
  'EMAIL_UNSUBSCRIBE_TOKEN_SECRET',
] as const;

/** Job switches; keep in step with JOB_NAMES in src/switches.ts. */
const JOB_SWITCHES = [
  'JOBS_PAUSED',
  'JOB_PLAN_CLEANUP_ENABLED',
  'JOB_RETENTION_CLEANUP_ENABLED',
  'JOB_EMAIL_DELIVERY_ENABLED',
  'JOB_REGENERATION_ENABLED',
  'JOB_MODULE_LESSONS_ENABLED',
  'JOB_PLAN_GENERATION_ENABLED',
  'JOB_POSTHOG_DELETION_ENABLED',
] as const;

const DEPLOYED: Record<
  DeployedMode,
  {
    domain: string;
    appUrl: string;
    resendFrom: string;
    /** Hyperdrive config for this mode's Supabase project (direct connection). */
    hyperdriveId: string;
  }
> = {
  staging: {
    domain: 'workers-staging.atlaris.app',
    // The develop deployment's custom domain (design note, open question 1, resolved 2026-10-06).
    appUrl: 'https://staging.atlaris.app',
    // Resend sender for staging email (B3b); the domain must be verified in Resend.
    resendFrom: 'Atlaris Staging <notifications@mail.atlaris.app>',
    // atlaris-jobs-db-staging (Supabase atlaris-dev).
    hyperdriveId: '3d880a7719be417eb9fbabc44380cf9c',
  },
  production: {
    domain: 'workers.atlaris.app',
    appUrl: 'https://atlaris.app',
    // Resend sender for production email (B3b); same as the production app.
    resendFrom: 'Atlaris <notifications@mail.atlaris.app>',
    // atlaris-jobs-db-production (Supabase atlaris-prod).
    hyperdriveId: 'd655ad23c1624151b787d53cf3188056',
  },
};

function secrets(names: readonly string[]) {
  return Object.fromEntries(names.map((name) => [name, bindings.secret()]));
}

// Plan regeneration (B4): no dead-letter queue; job_queue stays the record
// and the 15-minute sweep re-sends lost work (design note, Decision 8).
function regenerationQueue(name: string) {
  return {
    trigger: triggers.queue({
      name,
      maxBatchSize: 1,
      maxBatchTimeout: 0,
      maxRetries: 3,
      maxConcurrency: 2,
    }),
    binding: bindings.queue({ name }),
  };
}

/**
 * Workflows: email delivery (B3b), module lesson generation (B5, started by
 * POST /v1/module-lessons/start or the regeneration consumer), and plan
 * create/retry generation (B6, started by POST /v1/plan-generation/start).
 * Deployed modes start email delivery from Workflow `schedules` (design note,
 * Decision 8); locally it runs only from the manual command.
 */
function workflows(worker: string, suffix: string, deployed: boolean) {
  const name = (base: string) => `${base}${suffix}`;
  return {
    env: {
      EMAIL_DELIVERY_WORKFLOW: bindings.workflow({
        name: name('atlaris-email-delivery'),
        worker,
        exportName: 'EmailDeliveryWorkflow',
      }),
      MODULE_LESSONS_WORKFLOW: bindings.workflow({
        name: name('atlaris-module-lessons'),
        worker,
        exportName: 'ModuleLessonsWorkflow',
      }),
      PLAN_GENERATION_WORKFLOW: bindings.workflow({
        name: name('atlaris-plan-generation'),
        worker,
        exportName: 'PlanGenerationWorkflow',
      }),
    },
    exports: {
      EmailDeliveryWorkflow: exports.workflow({
        name: name('atlaris-email-delivery'),
        // Cloudflare weekdays start at 1 = Sunday, so Monday is MON.
        ...(deployed ? { schedules: ['0 14 * * *', '30 14 * * MON'] } : {}),
      }),
      ModuleLessonsWorkflow: exports.workflow({
        name: name('atlaris-module-lessons'),
      }),
      PlanGenerationWorkflow: exports.workflow({
        name: name('atlaris-plan-generation'),
      }),
    },
  };
}

const shared = {
  compatibilityDate: COMPATIBILITY_DATE,
  entrypoint: 'src/index.ts',
  workersDev: false,
  previewUrls: false,
  observability: { enabled: true, headSamplingRate: 1 },
} as const;

function deployedWorker(mode: DeployedMode) {
  const target = DEPLOYED[mode];
  const name = `atlaris-jobs-${mode}`;
  const queue = regenerationQueue(`atlaris-regeneration-${mode}`);
  const workflow = workflows(name, `-${mode}`, true);
  // Workers Builds exposes the deployed commit; Sentry reads it as the release
  // (src/index.ts falls back to the version id when it is absent).
  const commitSha = process.env.WORKERS_CI_COMMIT_SHA;
  return {
    ...shared,
    name,
    domains: [target.domain],
    triggers: [
      triggers.scheduled({ schedule: '*/15 * * * *' }),
      triggers.scheduled({ schedule: '0 3 * * *' }),
      queue.trigger,
    ],
    env: {
      NODE_ENV: bindings.text('production'),
      WORKER_ENV: bindings.text(mode),
      APP_URL: bindings.text(target.appUrl),
      SENTRY_DSN: bindings.text(SENTRY_DSN),
      ...(commitSha ? { SENTRY_RELEASE: bindings.text(commitSha) } : {}),
      RESEND_FROM: bindings.text(target.resendFrom),
      RESEND_REPLY_TO: bindings.text('support@atlaris.app'),
      LOG_LEVEL: bindings.text('info'),
      ...secrets(DEPLOYED_SECRETS),
      ...secrets(JOB_SWITCHES),
      HYPERDRIVE: bindings.hyperdrive({ id: target.hyperdriveId }),
      REGENERATION_QUEUE: queue.binding,
      ...workflow.env,
      CF_VERSION_METADATA: bindings.versionMetadata(),
    },
    exports: workflow.exports,
  };
}

function localWorker() {
  const name = 'atlaris-jobs';
  const queue = regenerationQueue('atlaris-regeneration-local');
  const workflow = workflows(name, '', false);
  return {
    ...shared,
    name,
    triggers: [queue.trigger],
    env: {
      NODE_ENV: bindings.text('development'),
      WORKER_ENV: bindings.text('development'),
      APP_URL: bindings.text('http://localhost:3000'),
      SENTRY_DSN: bindings.text(''),
      LOG_LEVEL: bindings.text('debug'),
      // `pnpm workers dev` sets CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE
      // to this worktree's native Supabase stack, which takes precedence over this id.
      HYPERDRIVE: bindings.hyperdrive({
        id: '00000000000000000000000000000000',
      }),
      REGENERATION_QUEUE: queue.binding,
      ...workflow.env,
      CF_VERSION_METADATA: bindings.versionMetadata(),
    },
    exports: workflow.exports,
  };
}

export default defineConfig((ctx) => ({
  worker:
    ctx.mode === 'staging' || ctx.mode === 'production'
      ? deployedWorker(ctx.mode)
      : localWorker(),
}));
