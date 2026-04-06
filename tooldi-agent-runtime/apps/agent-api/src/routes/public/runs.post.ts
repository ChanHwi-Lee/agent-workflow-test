import type { FastifyPluginAsync } from "fastify";

import type {
  RunAccepted,
  StartAgentWorkflowRunRequest,
} from "@tooldi/agent-contracts";
import {
  RunAcceptedSchema,
  StartAgentWorkflowRunRequestSchema,
} from "@tooldi/agent-contracts";

interface StartRunRoute {
  Body: StartAgentWorkflowRunRequest;
  Reply: RunAccepted;
}

export const runsPostRoute: FastifyPluginAsync = async (app) => {
  app.post<StartRunRoute>(
    "/api/agent-workflow/runs",
    {
      schema: {
        body: StartAgentWorkflowRunRequestSchema,
        response: {
          202: RunAcceptedSchema,
        },
      },
    },
    async (request, reply) => {
      const accepted = await app.services.runBootstrapService.startRun({
        httpRequestId: request.httpRequestId,
        request: request.body,
        publicBaseUrl: app.config.publicBaseUrl,
      });

      reply.header("x-agent-run-id", accepted.runId);
      reply.header("x-agent-trace-id", accepted.traceId);
      return reply.code(202).send(accepted);
    },
  );
};
