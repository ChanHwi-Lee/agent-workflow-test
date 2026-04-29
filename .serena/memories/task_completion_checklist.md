# Task Completion Checklist

- For runtime code changes, run targeted checks first when possible, then broader checks according to risk: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm lint`, and/or `pnpm format:check` from `tooldi-agent-runtime`.
- If a change touches v6 pipeline philosophy or contracts, verify documentation authority alignment with `AGENTS.md` and update the authoritative document before projections.
- If changing model defaults, provide benchmark evidence from `bench/method-compare-phase1/` before updating SSOT or implementation registry.
- If removing/replacing v5 pipeline remnants, run the v6 stale symbol `rg` check listed in `suggested_commands.md` and expect 0 hits for completed migration.
- Summarize verification performed and any skipped checks in the final response.