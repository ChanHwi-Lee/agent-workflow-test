import type { AgentWorkerEnv } from "@tooldi/agent-config";
import type {
  TemplateAbstractLayoutGenerator,
  TemplateCopyPlanGenerator,
  TemplatePlanner,
  TemplatePlannerProvider,
} from "@tooldi/agent-llm";
import type { Logger } from "@tooldi/agent-observability";
import type { ObjectStoreClient } from "@tooldi/agent-persistence";
import type {
  AssetStorageClient,
  ImagePrimitiveClient,
  TemplateCatalogClient,
  TextLayoutHelper,
  TooldiCatalogSourceClient,
} from "@tooldi/tool-adapters";
import type { ToolRegistry } from "@tooldi/tool-registry";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

import type { BackendCallbackClient } from "../clients/backendCallbackClient.js";
import type {
  AdaptiveCompositionDecision,
  MessageAtomPlan,
  ProjectedObjectGraph,
  SceneStylePlan,
} from "../types.js";
import type { V6NodeOverrides } from "./v6PipelineNode.js";

export interface AdaptiveCompositionDecisionBuilderInput {
  runId: string;
  traceId: string;
  projectedGraph: ProjectedObjectGraph;
  messageAtomPlan: MessageAtomPlan;
  sceneStylePlan?: SceneStylePlan | null;
  palette: string[];
  provider: TemplatePlannerProvider | null;
  modelName: string | null;
  temperature: number;
}

export type AdaptiveCompositionDecisionBuilder = (
  input: AdaptiveCompositionDecisionBuilderInput,
) => Promise<AdaptiveCompositionDecision | null>;

export interface RunJobGraphDependencies {
  env: AgentWorkerEnv;
  logger: Logger;
  objectStore: ObjectStoreClient;
  callbackClient: BackendCallbackClient;
  toolRegistry: ToolRegistry;
  imagePrimitiveClient: ImagePrimitiveClient;
  assetStorageClient: AssetStorageClient;
  textLayoutHelper: TextLayoutHelper;
  templateCatalogClient: TemplateCatalogClient;
  tooldiCatalogSourceClient?: TooldiCatalogSourceClient;
  langGraphCheckpointer?: BaseCheckpointSaver;
  templatePlanner?: TemplatePlanner;
  templateCopyPlanGenerator?: TemplateCopyPlanGenerator;
  templateAbstractLayoutGenerator?: TemplateAbstractLayoutGenerator;
  adaptiveCompositionDecisionBuilder?: AdaptiveCompositionDecisionBuilder;
  v6Overrides?: V6NodeOverrides;
}
