# Integrations Module

**Parent:** [Root AGENTS.md](../../../AGENTS.md)

## Overview

Integrations are currently UI placeholders only. There is no active third-party OAuth or token-storage flow in this module right now.

## Structure

```
integrations/
```

## Current State

- The Google Calendar integration is intentionally not implemented.
- The settings UI may still show placeholder cards for future integrations.

## Anti-Patterns

- Reintroducing OAuth-specific helpers here without a scoped product requirement
- Re-adding partial mock integrations that imply production parity when the feature is not actually shipped
