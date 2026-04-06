import type { StartAgentWorkflowRunRequest } from "@tooldi/agent-contracts";

export function createFakeRunRequest(
  overrides: Partial<StartAgentWorkflowRunRequest> = {},
): StartAgentWorkflowRunRequest {
  return {
    clientRequestId: "client-request-1",
    editorSessionId: "editor-session-1",
    surface: "toolditor",
    userInput: {
      prompt: "봄 세일 프로모션 템플릿을 만들어줘",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    },
    editorContext: {
      documentId: "document-1",
      pageId: "page-1",
      canvasState: "empty",
      canvasWidth: 1080,
      canvasHeight: 1080,
      sizeSerial: "1080x1080@1",
      workingTemplateCode: null,
      canvasSnapshotRef: null,
      selectedLayerIds: [],
    },
    brandContext: {
      brandName: null,
      palette: [],
      logoAssetId: null,
    },
    referenceAssets: [],
    runPolicy: {
      mode: "live_commit",
      approvalMode: "none",
      timeBudgetMs: 120000,
      milestoneTargetsMs: {
        firstVisible: 1000,
        editableMinimum: 3000,
        saveStarted: 5000,
      },
      milestoneDeadlinesMs: {
        planValidated: 1000,
        firstVisible: 2000,
        editableMinimum: 5000,
        mutationCutoff: 10000,
        hardDeadline: 120000,
      },
      requestedOutputCount: 1,
      allowInternalAiPrimitives: true,
    },
    clientInfo: {
      pagePath: "/editor",
      viewportWidth: 1440,
      viewportHeight: 900,
    },
    ...overrides,
  };
}
