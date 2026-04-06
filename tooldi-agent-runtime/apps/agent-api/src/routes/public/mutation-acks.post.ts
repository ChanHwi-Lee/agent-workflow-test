import type { FastifyPluginAsync } from "fastify";

import type {
  MutationApplyAckRequest,
  MutationApplyAckResponse,
  RunIdParams,
} from "@tooldi/agent-contracts";
import {
  MutationApplyAckRequestSchema,
  MutationApplyAckResponseSchema,
  RunIdParamsSchema,
} from "@tooldi/agent-contracts";

import { ValidationError } from "../../lib/errors.js";

interface MutationAcksPostRoute {
  Params: RunIdParams;
  Body: MutationApplyAckRequest;
  Reply: MutationApplyAckResponse;
}

export const mutationAcksPostRoute: FastifyPluginAsync = async (app) => {
  app.post<MutationAcksPostRoute>(
    "/api/agent-workflow/runs/:runId/mutation-acks",
    {
      schema: {
        params: RunIdParamsSchema,
        body: MutationApplyAckRequestSchema,
        response: {
          200: MutationApplyAckResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (request.body.runId !== request.params.runId) {
        throw new ValidationError(
          `Path runId ${request.params.runId} does not match body runId ${request.body.runId}`,
        );
      }

      const response = await app.services.runAckService.acceptMutationAck(request.body);
      return reply.code(200).send(response);
    },
  );
};
