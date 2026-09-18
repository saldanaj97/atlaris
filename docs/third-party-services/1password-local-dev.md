# 1Password local development

Laptop `pnpm dev` loads app secrets with `op run --environment <id>`. Authentication
uses a **tightly scoped 1Password service account**. The token lives in the macOS
keychain, not the repository. Cloud agents stay on
[1password-agents-setup.md](./1password-agents-setup.md).

## What you create once

1. In 1Password, create a service account that can read only the Atlaris local
   Environment. Copy the token once.
2. Copy the Environment ID from Developer → View Environments → Manage
   environment.

`op run --environment` still needs that ID. The service account only authenticates
`op`; it does not select the Environment.

## Install the machine-local wrapper

From the repo root:

```bash
bash scripts/dev/install-local-op.sh --environment-id YOUR_ENVIRONMENT_ID --token-stdin --force-config
```

The script prints `Paste the service-account token, then press Enter`. Paste the
token (it is hidden), press Enter, and approve the macOS keychain dialog if one
appears. Ctrl-C cancels a wait.

That command:

- Stores the token in the keychain (`service atlaris.op-service-account`)
- Writes `~/.local/bin/op-atlaris`, which exports the token for that `op`
  invocation only
- Writes `~/.config/atlaris/dev.sh` with `OP_EXECUTABLE` and `OP_ENVIRONMENT_ID`

Re-run without `--token-stdin` to refresh the wrapper after moving `op`. Existing
config is left alone unless you pass `--force-config`.

Never put the token in `.env.local`, `.dev-env.local.sh`, or the user config file.
The launcher strips `OP_SERVICE_ACCOUNT_TOKEN` before Portless and Next start.

## Confirm

```bash
pnpm dev doctor
pnpm dev
```

`pnpm dev doctor` should report 1Password authentication and Environment access
without a biometric prompt.

## Files

| Path | Role |
| ---- | ---- |
| `~/.local/bin/op-atlaris` | Wrapper. Reads the keychain, execs the real `op`. |
| `~/.config/atlaris/dev.sh` | Non-secret `OP_EXECUTABLE` and `OP_ENVIRONMENT_ID`. Example: `scripts/dev/dev.sh.example`. |
| Checkout `.dev-env.local.sh` | Deprecated fallback if the user-level file is missing. |

Worktrees inherit the same user-level config automatically. Do not commit either
machine-local file.
