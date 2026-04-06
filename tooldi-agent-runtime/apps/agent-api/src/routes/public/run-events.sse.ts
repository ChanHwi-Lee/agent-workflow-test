import type { FastifyPluginAsync } from "fastify";

import type {
  RunEventsQuery,
  RunIdParams,
} from "@tooldi/agent-contracts";
import {
  RunEventsQuerySchema,
  RunIdParamsSchema,
} from "@tooldi/agent-contracts";

import type { BufferedSseEvent } from "../../plugins/sseHub.js";

interface RunEventsSseRoute {
  Params: RunIdParams;
  Querystring: RunEventsQuery;
  Headers: {
    "last-event-id"?: string | string[];
  };
}

export const runEventsSseRoute: FastifyPluginAsync = async (app) => {
  app.get<RunEventsSseRoute>(
    "/api/agent-workflow/runs/:runId/events",
    {
      schema: {
        params: RunIdParamsSchema,
        querystring: RunEventsQuerySchema,
      },
    },
    async (request, reply) => {
      const runId = request.params.runId;
      const afterEventId =
        request.query.afterEventId ?? coerceHeaderValue(request.headers["last-event-id"]);

      reply.hijack();
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });

      const deliveredEventIds = new Set<string>();
      const writeBufferedEvent = (bufferedEvent: BufferedSseEvent): void => {
        if (deliveredEventIds.has(bufferedEvent.eventId) || reply.raw.writableEnded) {
          return;
        }

        deliveredEventIds.add(bufferedEvent.eventId);
        reply.raw.write(
          `id: ${bufferedEvent.eventId}\nevent: ${bufferedEvent.event.type}\ndata: ${JSON.stringify(bufferedEvent.event)}\n\n`,
        );
      };

      const unsubscribe = app.sseHub.subscribe(runId, writeBufferedEvent);
      const storedEvents = await app.services.runEventService.listAfter(runId, afterEventId);

      reply.raw.write(": connected\n\n");
      for (const storedEvent of storedEvents) {
        writeBufferedEvent({
          eventId: storedEvent.eventId,
          event: storedEvent.event,
        });
      }

      const keepAliveTimer = setInterval(() => {
        if (!reply.raw.destroyed && !reply.raw.writableEnded) {
          reply.raw.write(": keepalive\n\n");
        }
      }, 15000);

      let cleaned = false;
      const cleanup = (): void => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        clearInterval(keepAliveTimer);
        unsubscribe();
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
      };

      request.raw.on("close", cleanup);
      request.raw.on("error", cleanup);
      reply.raw.on("close", cleanup);
      reply.raw.on("error", cleanup);
    },
  );
};

function coerceHeaderValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.find((entry) => entry.trim().length > 0);
  }
  return undefined;
}
