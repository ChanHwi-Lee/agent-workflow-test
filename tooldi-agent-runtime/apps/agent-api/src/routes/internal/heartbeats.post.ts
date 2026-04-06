import type { FastifyPluginAsync } from "fastify";

import { isAttemptState } from "@tooldi/agent-domain";
import type {
  RunIdParams,
  WorkerHeartbeatRequest,
  WorkerHeartbeatResponse,
} from "@tooldi/agent-contracts";
import {
  RunIdParamsSchema,
  WorkerHeartbeatRequestSchema,
  WorkerHeartbeatResponseSchema,
} from "@tooldi/agent-contracts";

import { ValidationError } from "../../lib/errors.js";

interface HeartbeatsPostRoute {
  Params: RunIdParams;
  Body: WorkerHeartbeatRequest;
  Reply: WorkerHeartbeatResponse;
}

export const heartbeatsPostRoute: FastifyPluginAsync = async (app) => {
  app.post<HeartbeatsPostRoute>(
    "/internal/agent-workflow/runs/:runId/heartbeats",
    {
      schema: {
        params: RunIdParamsSchema,
        body: WorkerHeartbeatRequestSchema,
        response: {
          200: WorkerHeartbeatResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!isAttemptState(request.body.attemptState)) {
        throw new ValidationError(
          `Unsupported attemptState for worker heartbeat: ${request.body.attemptState}`,
        );
      }

      const command = {
        runId: request.params.runId,
        traceId: request.body.traceId,
        attemptSeq: request.body.attempt,
        queueJobId: request.body.queueJobId,
        workerId: request.body.workerId,
        attemptState: request.body.attemptState,
        heartbeatAt: request.body.heartbeatAt,
        ...(request.body.phase ? { phase: toWorkerPhase(request.body.phase) } : {}),
      };

      const response = await app.services.runRecoveryService.acceptHeartbeat(command);
      return reply.code(200).send(response);
    },
  );
};

function toWorkerPhase(
  phase: string,
): "planning" | "executing" | "applying" | "saving" {
  switch (phase) {
    case "planning":
    case "executing":
    case "applying":
    case "saving":
      return phase;
    default:
      throw new ValidationError(`Unsupported worker heartbeat phase: ${phase}`);
  }
}
