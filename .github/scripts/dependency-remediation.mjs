import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { runCli } from './dependency-remediation/cli.mjs';

export { parseAudit } from './dependency-remediation/audit.mjs';
export { parseAudit as parseAuditJson } from './dependency-remediation/audit.mjs';
export {
  classifyRemediation,
} from './dependency-remediation/policy.mjs';
export {
  classifyRemediation as buildPlan,
  classifyRemediation as classifyPlan,
} from './dependency-remediation/policy.mjs';
export {
  renderPlan,
  renderSummary,
} from './dependency-remediation/render.mjs';
export {
  renderPlan as renderPrBody,
  renderPlan as renderRemediationPlan,
} from './dependency-remediation/render.mjs';
export {
  compareResolvedVersions,
  normalizeResolvedVersions,
  parseStableVersion,
} from './dependency-remediation/versions.mjs';
export {
  normalizeResolvedVersions as normalizeVersions,
  parseStableVersion as parseStableSemver,
} from './dependency-remediation/versions.mjs';
export {
  inspectWorkspaceDiff,
} from './dependency-remediation/workspace.mjs';
export { inspectWorkspaceDiff as validateWorkspaceDiff } from './dependency-remediation/workspace.mjs';

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
