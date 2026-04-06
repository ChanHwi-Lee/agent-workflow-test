import type { FastifyPluginAsync } from "fastify";

import {
  createObjectStoreClient,
  createPgClient,
} from "@tooldi/agent-persistence";

export const dbPlugin: FastifyPluginAsync = async (app) => {
  const db = createPgClient({
    connectionString: app.config.postgresUrl,
    applicationName: "tooldi-agent-api",
    schema: "agent_runtime",
  });
  await db.connect();

  const objectStore = createObjectStoreClient({
    mode: app.config.objectStoreMode,
    rootDir: app.config.objectStoreRootDir,
    bucket: app.config.objectStoreBucket,
    prefix: app.config.objectStorePrefix,
  });

  app.decorate("db", db);
  app.decorate("objectStore", objectStore);

  app.addHook("onClose", async () => {
    await db.end();
  });
};
