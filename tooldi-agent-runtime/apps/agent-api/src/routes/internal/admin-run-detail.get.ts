import type { FastifyPluginAsync } from "fastify";

import {
  AdminRunDetailParamsSchema,
  AdminRunDetailSchema,
  type AdminRunDetail,
  type AdminRunDetailParams,
} from "@tooldi/agent-contracts";

import { AdminRunRepository } from "../../repositories/AdminRunRepository.js";
import { AdminArtifactDiscoveryService } from "../../services/AdminArtifactDiscoveryService.js";

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
      const repository = new AdminRunRepository({
        pg: app.db,
        objectStore: app.objectStore,
        objectStoreBucket: app.config.objectStoreBucket,
        artifactDiscovery: new AdminArtifactDiscoveryService(app.objectStore),
      });
      const detail = await repository.getDetail(request.params.runId);
      if (!detail) {
        return reply.code(404).send({ error: "not_found" } as never);
      }
      return detail;
    },
  );
};
