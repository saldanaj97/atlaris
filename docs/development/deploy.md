# Deployment Notes

## PDF Removal Cutover

Migration `0027_windy_agent_zero` is not safe to run against an older app binary that still writes `origin='pdf'` or expects legacy PDF columns.

Required order:

1. Deploy the application release that no longer reads or writes PDF plan artifacts.
2. Wait for the rollout to finish across all pods/instances.
3. Verify the new release is healthy.
4. Run `pnpm db:migrate` (or the equivalent Drizzle migration step in your deploy pipeline).

Do not reverse the order. Running the migration first can break rolling deploys or failovers against still-old binaries.
