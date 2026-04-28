import type { AgentWorkerEnv } from "@tooldi/agent-config";
import type { Logger } from "@tooldi/agent-observability";
import type { ObjectStoreClient } from "@tooldi/agent-persistence";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { BackendCallbackClient } from "../clients/backendCallbackClient.js";
import type { V6NodeOverrides } from "./v6PipelineNode.js";
import type { V6TrendResearcher } from "../phases/v6TrendResearch.js";

export interface RunJobGraphDependencies {
  env: AgentWorkerEnv;
  logger: Logger;
  objectStore: ObjectStoreClient;
  callbackClient: BackendCallbackClient;
  langGraphCheckpointer: BaseCheckpointSaver;
  interviewRecordsDb?: NodePgDatabase;
  v6Overrides?: V6NodeOverrides;
  v6TrendResearcher?: V6TrendResearcher;
}
