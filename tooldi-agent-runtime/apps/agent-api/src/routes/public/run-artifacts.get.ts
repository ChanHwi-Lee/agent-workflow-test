import type { FastifyPluginAsync } from "fastify";

import type { RunIdParams } from "@tooldi/agent-contracts";
import { RunIdParamsSchema } from "@tooldi/agent-contracts";

import { ValidationError } from "../../lib/errors.js";

interface RunArtifactGetRoute {
  Params: RunIdParams;
  Querystring: Record<string, unknown>;
}

export const runArtifactsGetRoute: FastifyPluginAsync = async (app) => {
  app.get<RunArtifactGetRoute>(
    "/api/agent-workflow/runs/:runId/artifacts",
    {
      schema: {
        params: RunIdParamsSchema,
      },
    },
    async (request, reply) => {
      const { runId } = request.params;
      const key = request.query.key;
      if (typeof key !== "string" || key.trim().length === 0) {
        throw new ValidationError("Missing artifact key");
      }
      const allowedPrefix = `runs/${runId}/`;
      if (!key.startsWith(allowedPrefix) || key.includes("..")) {
        throw new ValidationError("artifact key is outside the requested run");
      }

      const artifact = await app.objectStore.getObject({
        bucket: app.config.objectStoreBucket,
        key,
      });

      reply.header("content-type", artifact.contentType);
      return reply.send(Buffer.from(artifact.body));
    },
  );
};
