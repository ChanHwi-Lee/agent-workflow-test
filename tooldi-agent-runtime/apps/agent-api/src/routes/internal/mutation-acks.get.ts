import type { FastifyPluginAsync } from "fastify";

import type {
  MutationIdParams,
  WaitMutationAckQuery,
  WaitMutationAckResponse,
} from "@tooldi/agent-contracts";
import {
  MutationIdParamsSchema,
  WaitMutationAckQuerySchema,
  WaitMutationAckResponseSchema,
} from "@tooldi/agent-contracts";

interface MutationAcksGetRoute {
  Params: MutationIdParams;
  Querystring: WaitMutationAckQuery;
  Reply: WaitMutationAckResponse;
}

export const mutationAcksGetRoute: FastifyPluginAsync = async (app) => {
  app.get<MutationAcksGetRoute>(
    "/internal/agent-workflow/runs/:runId/mutations/:mutationId/acks",
    {
      schema: {
        params: MutationIdParamsSchema,
        querystring: WaitMutationAckQuerySchema,
        response: {
          200: WaitMutationAckResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const response = await app.services.runRecoveryService.waitForMutationAck({
        runId: request.params.runId,
        mutationId: request.params.mutationId,
        waitMs: request.query.waitMs ?? 15000,
      });

      return reply.code(200).send(response);
    },
  );
};
