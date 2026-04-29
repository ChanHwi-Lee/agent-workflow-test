# Suggested Commands

Run commands from `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime` unless noted otherwise.

- Install dependencies: `pnpm install`
- Build all packages/apps: `pnpm build`
- Typecheck all packages/apps: `pnpm typecheck`
- Run all tests: `pnpm test`
- Lint all packages/apps: `pnpm lint`
- Check formatting: `pnpm format:check`
- Apply formatting: `pnpm format:write`
- Run all dev scripts in parallel: `pnpm dev`
- Start built API app: `pnpm --filter @tooldi/agent-api start`
- Start built worker app: `pnpm --filter @tooldi/agent-worker start`
- Worker/local stack helpers: `pnpm local:toolditor:api`, `pnpm local:toolditor:worker`, `pnpm local:toolditor:stack`
- Smoke checks: `pnpm smoke:object-native`, `pnpm smoke:retry`, `pnpm smoke:transport`
- v6 stale symbol check from `agent-workflow-test`: `rg -n "v5HtmlValidator|v5MethodBHtmlGen|v5MethodBSystemPrompt|v5PipelineOrchestrator|emitV5SkeletonMutations|v5Transpile|v5PipelineNode|V5PipelineDependencies|V5_APPLY_OPERATION" agent-workflow-test/tooldi-agent-runtime --glob '!dist/**'`
- Useful Linux tools: use `rg` for search, `ls` for directory inspection, `git status`/`git diff` for VCS state. Avoid destructive git commands unless explicitly requested.