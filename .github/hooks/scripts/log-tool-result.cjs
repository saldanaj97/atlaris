const fs = require('node:fs');
const path = require('node:path');

function getHooksDir() {
  return path.resolve(__dirname, '..');
}

function ensureLogDir() {
  const logDir = path.join(getHooksDir(), 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  return path.join(logDir, 'audit.jsonl');
}

function truncate(text, maxLength = 400) {
  if (typeof text !== 'string' || text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}…`;
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

  const logFile = ensureLogDir();
  const result = payload.toolResult ?? {};

  fs.appendFileSync(
    logFile,
    `${JSON.stringify({
      event: 'postToolUse',
      timestamp: payload.timestamp ?? Date.now(),
      cwd: payload.cwd ?? '',
      toolName: payload.toolName ?? '',
      resultType: result.resultType ?? 'unknown',
      summary: truncate(result.textResultForLlm ?? ''),
    })}\n`
  );
}

void main();