import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import type { AgentApiEnv } from "@tooldi/agent-config";

import { createHttpRequestId } from "./lib/ids.js";
import { AgentApiError } from "./lib/errors.js";
import { configPlugin } from "./plugins/config.js";
import { dbPlugin } from "./plugins/db.js";
import { loggerPlugin } from "./plugins/logger.js";
import { queuePlugin } from "./plugins/queue.js";
import { sseHubPlugin } from "./plugins/sseHub.js";
import { CompletionRepository } from "./repositories/completionRepository.js";
import { CostSummaryRepository } from "./repositories/costSummaryRepository.js";
import { DraftBundleRepository } from "./repositories/draftBundleRepository.js";
import { MutationLedgerRepository } from "./repositories/mutationLedgerRepository.js";
import { RunAttemptRepository } from "./repositories/runAttemptRepository.js";
import { RunEventRepository } from "./repositories/runEventRepository.js";
import { RunRepository } from "./repositories/runRepository.js";
import { RunRequestRepository } from "./repositories/runRequestRepository.js";
import { RunAckService } from "./services/runAckService.js";
import { RunBootstrapService } from "./services/runBootstrapService.js";
import { RunCancelService } from "./services/runCancelService.js";
import { RunEventService } from "./services/runEventService.js";
import { RunFinalizeService } from "./services/runFinalizeService.js";
import { RunRecoveryService } from "./services/runRecoveryService.js";
import { RunTransportService } from "./services/runTransportService.js";
import { eventsPostRoute } from "./routes/internal/events.post.js";
import { finalizePostRoute } from "./routes/internal/finalize.post.js";
import { heartbeatsPostRoute } from "./routes/internal/heartbeats.post.js";
import { mutationAcksGetRoute } from "./routes/internal/mutation-acks.get.js";
import { cancelPostRoute } from "./routes/public/cancel.post.js";
import { mutationAcksPostRoute } from "./routes/public/mutation-acks.post.js";
import { runEventsSseRoute } from "./routes/public/run-events.sse.js";
import { runsPostRoute } from "./routes/public/runs.post.js";

export interface AgentApiServices {
  runBootstrapService: RunBootstrapService;
  runEventService: RunEventService;
  runAckService: RunAckService;
  runFinalizeService: RunFinalizeService;
  runCancelService: RunCancelService;
  runRecoveryService: RunRecoveryService;
}

export interface BuildAppOptions {
  env?: AgentApiEnv;
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  if (options.env) {
    await configPlugin(app, { env: options.env });
  } else {
    await configPlugin(app, {});
  }
  await loggerPlugin(app, {});
  await dbPlugin(app, {});
  await queuePlugin(app, {});
  await sseHubPlugin(app, {});

  const runRequestRepository = new RunRequestRepository(app.db);
  const runRepository = new RunRepository(app.db);
  const runAttemptRepository = new RunAttemptRepository(app.db);
  const runEventRepository = new RunEventRepository(app.db);
  const mutationLedgerRepository = new MutationLedgerRepository(app.db);
  const costSummaryRepository = new CostSummaryRepository(app.db);
  const draftBundleRepository = new DraftBundleRepository(app.db);
  const completionRepository = new CompletionRepository(app.db);

  const runEventService = new RunEventService(
    runEventRepository,
    app.sseHub,
    app.appLogger.child({ service: "run-event-service" }),
  );
  const runTransportService = new RunTransportService(
    runRepository,
    runAttemptRepository,
    app.appLogger.child({ service: "run-transport-service" }),
  );

  const services: AgentApiServices = {
    runBootstrapService: new RunBootstrapService(
      runRequestRepository,
      runRepository,
      runAttemptRepository,
      runEventService,
      app.objectStore,
      app.runQueue,
      app.appLogger.child({ service: "run-bootstrap-service" }),
    ),
    runEventService,
    runAckService: new RunAckService(
      mutationLedgerRepository,
      runRepository,
      runEventService,
      app.appLogger.child({ service: "run-ack-service" }),
    ),
    runFinalizeService: new RunFinalizeService(
      runRepository,
      runAttemptRepository,
      costSummaryRepository,
      draftBundleRepository,
      completionRepository,
      runEventService,
      app.appLogger.child({ service: "run-finalize-service" }),
    ),
    runCancelService: new RunCancelService(
      runRepository,
      runEventService,
      app.appLogger.child({ service: "run-cancel-service" }),
    ),
    runRecoveryService: new RunRecoveryService(
      runRepository,
      runAttemptRepository,
      mutationLedgerRepository,
      runEventService,
      app.appLogger.child({ service: "run-recovery-service" }),
    ),
  };

  app.decorate("services", services);
  app.runQueue.observeTransport((signal) => runTransportService.observeSignal(signal));

  await app.register(runsPostRoute);
  await app.register(runEventsSseRoute);
  await app.register(mutationAcksPostRoute);
  await app.register(cancelPostRoute);
  await app.register(eventsPostRoute);
  await app.register(mutationAcksGetRoute);
  await app.register(finalizePostRoute);
  await app.register(heartbeatsPostRoute);

  app.addHook("onRequest", async (request, reply) => {
    const headerValue = request.headers["x-request-id"];
    request.httpRequestId =
      (typeof headerValue === "string" && headerValue.trim().length > 0
        ? headerValue
        : createHttpRequestId());
    reply.header("x-request-id", request.httpRequestId);
  });

  app.addHook("onResponse", async (request, reply) => {
    app.appLogger.info("HTTP request completed", {
      httpRequestId: request.httpRequestId,
      method: request.method,
      route: request.routeOptions.url,
      statusCode: reply.statusCode,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const agentApiError =
      error instanceof AgentApiError
        ? error
        : new AgentApiError(
            "internal_error",
            error instanceof Error ? error.message : "Unexpected internal error",
            500,
          );

    app.appLogger.error("Request failed", {
      httpRequestId: request.httpRequestId,
      code: agentApiError.code,
      statusCode: agentApiError.statusCode,
      message: agentApiError.message,
      details: agentApiError.details,
    });

    reply.status(agentApiError.statusCode).send({
      code: agentApiError.code,
      message: agentApiError.message,
      details: agentApiError.details ?? null,
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      code: "not_found",
      message: `No route registered for ${request.method} ${request.url}`,
    });
  });

  return app;
}
