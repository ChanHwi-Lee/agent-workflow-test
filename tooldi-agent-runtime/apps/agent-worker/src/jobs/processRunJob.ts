import type {
  RunJobEnvelope,
} from "@tooldi/agent-contracts";
import { buildLangGraphThreadId } from "@tooldi/agent-graph";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
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

import type { BackendCallbackClient } from "../clients/backendCallbackClient.js";
import { buildRunJobGraph, type RunJobGraphDependencies } from "../graph/runJobGraph.js";
import type { ProcessRunJobResult } from "../types.js";

export interface ProcessRunJobDependencies extends RunJobGraphDependencies {
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
}

export async function processRunJob(
  job: RunJobEnvelope,
  dependencies: ProcessRunJobDependencies,
): Promise<ProcessRunJobResult> {
  const graph = buildRunJobGraph(dependencies);
  const finalState = await graph.invoke(
    {
      job,
    },
    {
      configurable: {
        thread_id: buildLangGraphThreadId(job.runId, job.attemptSeq),
      },
    },
  );

  if (!finalState.result) {
    throw new Error("LangGraph run completed without a ProcessRunJobResult");
  }

  return finalState.result;
}
