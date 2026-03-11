const fs = require('node:fs');
const path = require('node:path');

const EDIT_TOOL_NAMES = new Set(['create', 'edit', 'multiedit', 'write']);
const SUBAGENT_TOOL_NAMES = new Set(['runsubagent', 'subagent']);
const SUBAGENT_MODEL_GUIDANCE =
  'Use Claude Opus 4.6 for difficult complex tasks or GPT 5.4 for long tasks that require large context windows for the subagent model.';

const DANGEROUS_COMMAND_PATTERNS = [
  {
    regex: /(?:^|\b)(?:pnpm\s+(?:run\s+)?test:all|\.\/scripts\/full-test-suite\.sh)\b/i,
    reason: 'Running the full test suite is forbidden here. Use scoped test commands instead.',
  },
  {
    regex: /(?:^|\b)(?:pnpm\s+(?:run\s+)?db:push|drizzle-kit\s+push)\b/i,
    reason: 'Schema push is blocked because it mutates the database directly.',
  },
  {
    regex: /(?:^|\b)(?:pnpm\s+(?:run\s+)?db:migrate|drizzle-kit\s+migrate)\b/i,
    reason: 'Database migrations are blocked from automated execution. Review and run them intentionally.',
  },
  {
    regex: /\b(?:sudo|su|runas)\b/i,
    reason: 'Privilege escalation commands are not allowed via automated execution.',
  },
  {
    regex: /\bgit\s+reset\s+--hard\b/i,
    reason: 'git reset --hard is blocked because it can destroy uncommitted work.',
  },
  {
    regex: /\bgit\s+clean\s+-f(?:d|x|dx|xdf)?\b/i,
    reason: 'git clean with force flags is blocked because it can delete workspace files.',
  },
  {
    regex: /\brm\s+-rf\b/i,
    reason: 'rm -rf is blocked because it is trivially destructive.',
  },
  {
    regex: /\b(?:mkfs|dd|format)\b/i,
    reason: 'System-level destructive operations are not allowed via automated execution.',
  },
  {
    regex: /(?:curl|wget)[^\n|]*\|\s*(?:bash|sh)\b/i,
    reason: 'Download-and-execute patterns are blocked from automated execution.',
  },
];

const WARNING_PATTERNS = [
  {
    regex: /process\.env\./,
    message: 'Use `@/lib/config/env` instead of `process.env`.',
  },
  {
    regex: /console\./,
    message: 'Use the repo logging utilities instead of `console.*` in app code.',
  },
  {
    regex: /@ts-ignore/,
    message: 'Avoid `@ts-ignore`; fix the type issue or model the boundary with safer types.',
  },
  {
    regex: /\bas any\b/,
    message: 'Avoid `as any`; prefer narrowing, Zod validation, or a real type.',
  },
  {
    regex: /import\s*\(/,
    message: 'Dynamic or inline imports need scrutiny here because this workspace prefers imports at the top of the module.',
  },
];

const REQUEST_LAYER_REGEX = /(^|\/)src\/(app\/api|lib\/api|lib\/integrations)\//;
const SERVICE_ROLE_IMPORT_REGEX = /service-role/;
const REDACTION_PATTERNS = [
  [/gh[pous]_[A-Za-z0-9]{20,}/g, '[REDACTED_TOKEN]'],
  [/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer [REDACTED]'],
  [/(--password(?:=|\s+))\S+/gi, '$1[REDACTED]'],
  [/(--token(?:=|\s+))\S+/gi, '$1[REDACTED]'],
];

function ensureLogDir() {
  const logDir = path.join(path.resolve(__dirname, '..'), 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  return path.join(logDir, 'audit.jsonl');
}

function appendLog(entry) {
  const logFile = ensureLogDir();
  fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
}

function redact(value) {
  if (typeof value !== 'string') {
    return value;
  }

  return REDACTION_PATTERNS.reduce((text, [regex, replacement]) => text.replace(regex, replacement), value);
}

function safeJsonParse(rawValue) {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

function normalizePath(candidatePath, cwd) {
  if (typeof candidatePath !== 'string' || candidatePath.length === 0) {
    return null;
  }

  return path.isAbsolute(candidatePath) ? path.relative(cwd, candidatePath) : candidatePath;
}

function collectStringValues(value, results = []) {
  if (typeof value === 'string') {
    results.push(value);
    return results;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringValues(item, results);
    }

    return results;
  }

  if (value && typeof value === 'object') {
    for (const nestedValue of Object.values(value)) {
      collectStringValues(nestedValue, results);
    }
  }

  return results;
}

function collectPathCandidates(value, cwd, results = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPathCandidates(item, cwd, results);
    }

    return results;
  }

  if (!value || typeof value !== 'object') {
    return results;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (typeof nestedValue === 'string' && /(path|filePath|targetPath)$/i.test(key)) {
      const normalized = normalizePath(nestedValue, cwd);
      if (normalized) {
        results.add(normalized);
      }
    } else {
      collectPathCandidates(nestedValue, cwd, results);
    }
  }

  return results;
}

function warn(message) {
  process.stderr.write(`${message}\n`);
}

function isSubagentRelatedTool(toolName, toolArgs) {
  if (SUBAGENT_TOOL_NAMES.has(toolName)) {
    return true;
  }

  if (!toolArgs || typeof toolArgs !== 'object') {
    return false;
  }

  return (
    typeof toolArgs.agentName === 'string' ||
    typeof toolArgs.subagentName === 'string' ||
    typeof toolArgs.modelAgentName === 'string'
  );
}

function deny(reason, details) {
  const output = {
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  };

  appendLog({
    event: 'policyDeny',
    timestamp: Date.now(),
    ...details,
    reason,
  });

  process.stdout.write(JSON.stringify(output));
}

async function readStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return chunks.join('').trim();
}

async function main() {
  const rawInput = await readStdin();

  if (!rawInput) {
    return;
  }

  let payload;

  try {
    payload = JSON.parse(rawInput);
  } catch {
    return;
  }

  const toolName = typeof payload.toolName === 'string' ? payload.toolName.toLowerCase() : '';
  const cwd = typeof payload.cwd === 'string' && payload.cwd.length > 0 ? payload.cwd : process.cwd();
  const toolArgsRaw = typeof payload.toolArgs === 'string' ? payload.toolArgs : '';
  const toolArgs = safeJsonParse(toolArgsRaw) ?? {};

  if (isSubagentRelatedTool(toolName, toolArgs)) {
    appendLog({
      event: 'policyWarn',
      timestamp: payload.timestamp ?? Date.now(),
      cwd,
      toolName,
      warnings: [SUBAGENT_MODEL_GUIDANCE],
    });
    warn(`Hook warning (${toolName}): ${SUBAGENT_MODEL_GUIDANCE}`);
  }

  if (toolName === 'bash') {
    const command = typeof toolArgs.command === 'string' ? toolArgs.command.replace(/\s+/g, ' ').trim() : '';

    appendLog({
      event: 'preToolUse',
      timestamp: payload.timestamp ?? Date.now(),
      cwd,
      toolName,
      command: redact(command),
    });

    for (const { regex, reason } of DANGEROUS_COMMAND_PATTERNS) {
      if (regex.test(command)) {
        deny(`${reason} Blocked command: ${redact(command)}`, {
          cwd,
          toolName,
          command: redact(command),
        });
        return;
      }
    }

    return;
  }

  if (!EDIT_TOOL_NAMES.has(toolName)) {
    return;
  }

  const paths = [...collectPathCandidates(toolArgs, cwd)];
  const stringValues = collectStringValues(toolArgs);

  appendLog({
    event: 'preToolUse',
    timestamp: payload.timestamp ?? Date.now(),
    cwd,
    toolName,
    paths,
  });

  const isRequestLayerEdit = paths.some((candidatePath) => REQUEST_LAYER_REGEX.test(candidatePath));
  const hasServiceRoleImport = stringValues.some((value) => SERVICE_ROLE_IMPORT_REGEX.test(value));

  if (isRequestLayerEdit && hasServiceRoleImport) {
    const reason = 'service-role imports are forbidden in request-handling code.';
    deny(reason, { cwd, toolName, paths });
    return;
  }

  const warnings = new Set();

  for (const candidateValue of stringValues) {
    for (const { regex, message } of WARNING_PATTERNS) {
      if (regex.test(candidateValue)) {
        warnings.add(message);
      }
    }
  }

  if (warnings.size > 0) {
    const warningList = [...warnings];
    appendLog({
      event: 'policyWarn',
      timestamp: payload.timestamp ?? Date.now(),
      cwd,
      toolName,
      paths,
      warnings: warningList,
    });
    warn(`Hook warning (${toolName}${paths.length > 0 ? `: ${paths.join(', ')}` : ''}): ${warningList.join(' ')}`);
  }
}

void main();