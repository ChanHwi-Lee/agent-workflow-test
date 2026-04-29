# Code Style And Conventions

- Runtime code is TypeScript ESM (`type: module`) with workspace packages under `tooldi-agent-runtime/apps/*` and `tooldi-agent-runtime/packages/*`.
- Use 2-space indentation, LF line endings, UTF-8, final newline, and trim trailing whitespace per `.editorconfig`.
- Prefer strict TypeScript types and existing workspace package boundaries. Avoid introducing `any`; use explicit types or `unknown` where needed.
- Follow local package APIs and type definitions before adding new abstractions.
- For docs in `agent-workflow-test`, respect authority order in `AGENTS.md`: v6 SSOT first for pipeline philosophy, architecture for runtime semantic contract, then functional/backend/client/scope docs as projections.
- If v6 principles, runtime contracts, public schema, or current implementation truth change, update the authoritative document first and then projections.
- Current v6 direction: free HTML -> browser layout -> deterministic primitive extraction. Do not revive v5 constrained HTML grammar or deterministic DOM-to-Tooldi transpiler paths unless the SSOT changes.