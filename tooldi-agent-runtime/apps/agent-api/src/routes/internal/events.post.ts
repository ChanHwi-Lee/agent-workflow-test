import type { FastifyPluginAsync } from "fastify";

import type {
  RunIdParams,
  WorkerAppendEventRequest,
  WorkerAppendEventResponse,
} from "@tooldi/agent-contracts";
import {
  RunIdParamsSchema,
  WorkerAppendEventResponseSchema,
  firstWorkerAppendEventRequestError,
  isWorkerAppendEventRequest,
} from "@tooldi/agent-contracts";

import { ValidationError } from "../../lib/errors.js";

interface EventsPostRoute {
  Params: RunIdParams;
  Body: unknown;
  Reply: WorkerAppendEventResponse;
}

export const eventsPostRoute: FastifyPluginAsync = async (app) => {
  app.post<EventsPostRoute>(
    "/internal/agent-workflow/runs/:runId/events",
    {
      schema: {
        params: RunIdParamsSchema,
        response: {
          200: WorkerAppendEventResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!isWorkerAppendEventRequest(request.body)) {
        throw new ValidationError(
          firstWorkerAppendEventRequestError(request.body) ??
            "Worker append event request failed contract validation",
        );
      }

      const body: WorkerAppendEventRequest = request.body;
      const response = await app.services.runRecoveryService.appendWorkerEvent({
        runId: request.params.runId,
        traceId: body.traceId,
        attemptSeq: body.attempt,
        queueJobId: body.queueJobId,
        event: body.event,
      });

      return reply.code(200).send(response);
    },
  );
};
