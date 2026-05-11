import type { FastifyPluginAsync } from "fastify";

import {
  AdminRunsListQuerySchema,
  AdminRunsListResponseSchema,
  type AdminRunsListQuery,
  type AdminRunsListResponse,
} from "@tooldi/agent-contracts";

import type { AdminRunRepository } from "../../repositories/AdminRunRepository.js";

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
      const params: Parameters<AdminRunRepository["list"]>[0] = {};
      if (request.query.limit !== undefined) params.limit = request.query.limit;
      if (request.query.status !== undefined) params.status = request.query.status;
      if (request.query.before !== undefined) params.before = request.query.before;
      return app.services.adminRunRepository.list(params);
    },
  );
};
