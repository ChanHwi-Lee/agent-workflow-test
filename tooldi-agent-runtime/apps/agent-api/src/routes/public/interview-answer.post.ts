import type { FastifyPluginAsync } from "fastify";

import type {
  InterviewAnswerRequest,
  InterviewAnswerResponse,
  RunIdParams,
} from "@tooldi/agent-contracts";
import {
  InterviewAnswerRequestSchema,
  InterviewAnswerResponseSchema,
  RunIdParamsSchema,
} from "@tooldi/agent-contracts";

interface InterviewAnswerPostRoute {
  Params: RunIdParams;
  Body: InterviewAnswerRequest;
  Reply: InterviewAnswerResponse;
}

export const interviewAnswerPostRoute: FastifyPluginAsync = async (app) => {
  app.post<InterviewAnswerPostRoute>(
    "/api/agent-workflow/runs/:runId/interview-answer",
    {
      schema: {
        params: RunIdParamsSchema,
        body: InterviewAnswerRequestSchema,
        response: {
          202: InterviewAnswerResponseSchema,
        },
      },
    },
    async (request, reply) => {
      // TODO(polishing): authn + rate-limit + run owner 검증.
      const response = await app.services.runRecoveryService.acceptInterviewAnswer({
        runId: request.params.runId,
        traceId: request.body.traceId,
        answers: request.body.answers,
      });
      return reply.code(202).send(response);
    },
  );
};
