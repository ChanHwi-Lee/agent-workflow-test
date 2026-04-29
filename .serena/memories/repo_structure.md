# Repository Structure

- Repository root `agent-workflow-test` contains Tooldi natural-language agent/workflow docs, PoCs, benchmarks, fonts, and the TypeScript runtime workspace.
- `tooldi-agent-runtime/apps/agent-api`: Fastify/BullMQ API app for backend/control-plane style runtime endpoints and run lifecycle services.
- `tooldi-agent-runtime/apps/agent-worker`: worker/execution-plane app with job processing, graph nodes, v6 phases, persistence clients, and tests.
- `tooldi-agent-runtime/packages/*`: shared workspace packages such as `agent-llm`, `agent-graph`, `config`, `contracts`, `domain`, `observability`, `persistence`, `testkit`, `tool-adapters`, and `tool-registry`.
- `bench/method-compare-phase1/`: benchmark evidence path required for model/default pipeline changes.
- Normative docs are listed in `AGENTS.md`; start with doc index and v6 SSOT for architecture work.