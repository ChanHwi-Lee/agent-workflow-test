import type { FastifyPluginAsync } from "fastify";

import {
  AdminRunDetailParamsSchema,
  AdminRunDetailSchema,
  type AdminRunDetail,
  type AdminRunDetailParams,
} from "@tooldi/agent-contracts";

interface AdminRunDetailRoute {
  Params: AdminRunDetailParams;
  Reply: AdminRunDetail;
}

export const adminRunDetailRoute: FastifyPluginAsync = async (app) => {
  app.get<AdminRunDetailRoute>(
    "/api/admin/runs/:runId",
    {
      schema: {
        params: AdminRunDetailParamsSchema,
        response: { 200: AdminRunDetailSchema },
      },
    },
    async (request, reply) => {
      const detail = await app.services.adminRunRepository.getDetail(
        request.params.runId,
      );
      if (!detail) {
        return reply.code(404).send({ error: "not_found" } as never);
      }
      return detail;
    },
  );
};
