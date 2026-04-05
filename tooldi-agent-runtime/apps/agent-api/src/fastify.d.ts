import type { AgentApiEnv } from "@tooldi/agent-config";
import type { Logger } from "@tooldi/agent-observability";
import type { ObjectStoreClient, PgClient } from "@tooldi/agent-persistence";
import type { RunQueueProducer } from "./plugins/queue.js";
import type { SseHub } from "./plugins/sseHub.js";
import type { AgentApiServices } from "./app.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AgentApiEnv;
    appLogger: Logger;
    db: PgClient;
    objectStore: ObjectStoreClient;
    runQueue: RunQueueProducer;
    sseHub: SseHub;
    services: AgentApiServices;
  }

  interface FastifyRequest {
    httpRequestId: string;
  }
}
