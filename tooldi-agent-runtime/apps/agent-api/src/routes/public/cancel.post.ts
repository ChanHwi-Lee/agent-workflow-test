import type { FastifyPluginAsync } from "fastify";

import type {
  CancelRunRequest,
  CancelRunResponse,
  RunIdParams,
} from "@tooldi/agent-contracts";
import {
  CancelRunRequestSchema,
  CancelRunResponseSchema,
  RunIdParamsSchema,
} from "@tooldi/agent-contracts";

interface CancelPostRoute {
  Params: RunIdParams;
  Body: CancelRunRequest;
  Reply: CancelRunResponse;
}

export const cancelPostRoute: FastifyPluginAsync = async (app) => {
  app.post<CancelPostRoute>(
    "/api/agent-workflow/runs/:runId/cancel",
    {
      schema: {
        params: RunIdParamsSchema,
        body: CancelRunRequestSchema,
        response: {
          202: CancelRunResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const response = await app.services.runCancelService.acceptCancel(
        request.params.runId,
        request.body.traceId,
        request.body.reason,
      );

      return reply.code(202).send(response);
    },
  );
};
