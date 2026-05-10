import type { onRequestAsyncHookHandler } from "fastify";

/**
 * onRequest hook that returns 404 for any /api/admin/* request while
 * NODE_ENV === "production". Non-admin routes always pass through.
 *
 * V0 scope only — V1 will replace this with a proper auth check.
 */
export const adminGuard: onRequestAsyncHookHandler = async (request, reply) => {
  if (!request.url.startsWith("/api/admin/")) {
    return;
  }
  if (process.env.NODE_ENV === "production") {
    await reply.code(404).send({ error: "not_found" });
  }
};
