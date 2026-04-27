// agent-worker 의 v6 노드들을 poc 에서 재사용하기 위한 re-export.
// 원칙: agent-worker 소스는 수정하지 않는다.
// 빌드 산출물(dist) 을 상대 경로로 직접 참조해 추가 barrel 없이 pick.
//
// dist 상대 경로 분해:
//   poc/interview/src/lib  →  ../../../..  =  agent-workflow-test/
//   거기서 tooldi-agent-runtime/apps/agent-worker/dist/phases/*.js
//
// Build-time 에 TypeScript NodeNext 해석이 옆의 `.d.ts` 를 자동으로 매핑한다.

export {
  runV6HtmlGen,
  V6HtmlGenerationError,
  stripMarkdownFences,
} from "../../../../tooldi-agent-runtime/apps/agent-worker/dist/phases/v6HtmlGen.js";

export type {
  V6HtmlGenOptions,
  V6HtmlGenResult,
  V6Usage,
} from "../../../../tooldi-agent-runtime/apps/agent-worker/dist/phases/v6HtmlGen.js";

export {
  renderAndExtract,
  launchEphemeralBrowser,
  extractFromPage,
} from "../../../../tooldi-agent-runtime/apps/agent-worker/dist/phases/v6BrowserRender.js";

export type { V6RenderOptions } from "../../../../tooldi-agent-runtime/apps/agent-worker/dist/phases/v6BrowserRender.js";

export type {
  V6Canvas,
  V6ExtractionResult,
  V6RenderedElement,
} from "../../../../tooldi-agent-runtime/apps/agent-worker/dist/phases/v6Types.js";

export {
  V6_DEFAULT_MODEL,
  V6_SYSTEM_PROMPT,
  buildV6UserMessage,
} from "../../../../tooldi-agent-runtime/apps/agent-worker/dist/phases/v6SystemPrompt.js";

export type { V6UserInput } from "../../../../tooldi-agent-runtime/apps/agent-worker/dist/phases/v6SystemPrompt.js";
