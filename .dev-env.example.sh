# Copy to .dev-env.local.sh (ignored). Keep only non-secret configuration here.
# Select the development Environment assigned to your local app in 1Password.
: "${OP_ENVIRONMENT_ID:=}"

# Optional: absolute path to a machine-local wrapper which retrieves its service
# account credential from your OS keychain. Otherwise a trusted op CLI on PATH
# is used with normal 1Password desktop authentication.
# : "${OP_EXECUTABLE:=$HOME/.local/bin/op-atlaris}"

# Never put authentication tokens or app secrets in this file. The launcher
# injects the Environment at runtime and removes service-account credentials
# before starting Portless / Next.js.
