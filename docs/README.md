# Agent Workflow Docs Routing

이 폴더는 root 문서의 보조 자료다. 에이전트가 작업 기준을 찾을 때는 아래 순서만 따른다.

## Current Guides

- Root 기준선: [`../README.md`](../README.md)
- 현재 AS-IS: [`../tooldi-agent-workflow-v1-create-template-current-state-as-is.md`](../tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
- 현재 roadmap: [`../tooldi-agent-workflow-v1-next-implementation-roadmap.md`](../tooldi-agent-workflow-v1-next-implementation-roadmap.md)
- 설계 SSOT: [`../tooldi-agent-workflow-v6-layout-freedom-ssot.md`](../tooldi-agent-workflow-v6-layout-freedom-ssot.md)
- 문서 인덱스: [`../tooldi-agent-workflow-v1-doc-index.md`](../tooldi-agent-workflow-v1-doc-index.md)

## Active Design Drafts

- [`design/phase6-rag-assets/`](design/phase6-rag-assets/)는 현재/미래 설계 draft다.
- Phase 6의 목표는 v6 HTML의 `placeholder://<hint>`를 실제 Tooldi photo/graphic asset으로 치환하는 것이다.
- 이 설계는 template prior, adaptive composition, legacy retrieval을 되살리는 근거가 아니다.

## Archive

- [`archive/handoff/`](archive/handoff/)는 과거 세션/PR handoff와 evidence archive다.
- [`archive/historical-audits/`](archive/historical-audits/)는 과거 capability 조사와 audit archive다.
- archive 문서는 당시 작업 지시와 경로를 그대로 포함할 수 있다. 현재 구현 기준으로 사용하지 말고, 필요한 근거만 root current 문서와 대조해서 읽는다.

## Agent Rule

새 작업을 시작할 때 archive 문서가 먼저 발견되면 중단하고 root current 문서를 먼저 확인한다. archive 문서는 “왜 이렇게 됐는가”를 설명하는 보조 evidence이고, “지금 무엇을 해야 하는가”의 authority가 아니다.
