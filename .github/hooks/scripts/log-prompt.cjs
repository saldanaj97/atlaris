const crypto = require('node:crypto');
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

async function readStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return chunks.join('').trim();
}

function hashPrompt(prompt) {
  return crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 16);
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

  const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
  const logFile = ensureLogDir();

  fs.appendFileSync(
    logFile,
    `${JSON.stringify({
      event: 'userPromptSubmitted',
      timestamp: payload.timestamp ?? Date.now(),
      cwd: payload.cwd ?? '',
      promptLength: prompt.length,
      promptHash: prompt ? hashPrompt(prompt) : null,
    })}\n`
  );
}

void main();