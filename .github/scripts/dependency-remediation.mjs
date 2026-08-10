import { runCli } from './dependency-remediation/cli.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export { parseAudit } from './dependency-remediation/audit.mjs';
export { classifyRemediation } from './dependency-remediation/policy.mjs';
export { renderPlan, renderSummary } from './dependency-remediation/render.mjs';
export {
  compareResolvedVersionMaps,
  normalizeResolvedVersions,
  parseStableVersion,
} from './dependency-remediation/versions.mjs';
export { inspectWorkspaceDiff } from './dependency-remediation/workspace.mjs';

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
