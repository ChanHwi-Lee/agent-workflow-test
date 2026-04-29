# Project Overview

- `agent-workflow-test` is the Tooldi natural-language agent/workflow documentation and runtime workspace.
- Current design authority is `tooldi-agent-workflow-v6-layout-freedom-ssot.md`, replacing the older v5 constrained HTML pipeline.
- The runtime implementation lives mainly under `tooldi-agent-runtime` and is a TypeScript workspace for the Tooldi agent backend/worker runtime.
- Core v6 pipeline direction: free HTML -> browser layout -> deterministic primitive extraction, with runtime semantic contracts documented in `tooldi-natural-language-agent-v1-architecture.md`.
- Representative scenario: empty 1200x628 canvas, Korean prompt for a spring sale event banner, live commit within 2 minutes, editable banner draft output.