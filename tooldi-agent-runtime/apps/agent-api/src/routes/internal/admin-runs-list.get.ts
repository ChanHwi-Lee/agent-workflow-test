import type { FastifyPluginAsync } from "fastify";

import {
  AdminRunsListQuerySchema,
  AdminRunsListResponseSchema,
  type AdminRunsListQuery,
  type AdminRunsListResponse,
} from "@tooldi/agent-contracts";

import { AdminRunRepository } from "../../repositories/AdminRunRepository.js";
import { AdminArtifactDiscoveryService } from "../../services/AdminArtifactDiscoveryService.js";

interface AdminRunsListRoute {
  Querystring: AdminRunsListQuery;
  Reply: AdminRunsListResponse;
}

export const adminRunsListRoute: FastifyPluginAsync = async (app) => {
  app.get<AdminRunsListRoute>(
    "/api/admin/runs",
    {
      schema: {
        querystring: AdminRunsListQuerySchema,
        response: { 200: AdminRunsListResponseSchema },
      },
    },
    async (request) => {
      const repository = new AdminRunRepository({
        pg: app.db,
        objectStore: app.objectStore,
        objectStoreBucket: app.config.objectStoreBucket,
        artifactDiscovery: new AdminArtifactDiscoveryService(app.objectStore),
      });
      const params: Parameters<AdminRunRepository["list"]>[0] = {};
      if (request.query.limit !== undefined) params.limit = request.query.limit;
      if (request.query.status !== undefined) params.status = request.query.status;
      if (request.query.before !== undefined) params.before = request.query.before;
      return repository.list(params);
    },
  );
};
