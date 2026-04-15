import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runObjectNativeSmokeInProcess } from "./smoke-in-process.mjs";

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(currentDir, "..");
const queueName = `agent-workflow-object-native-smoke-${Date.now()}`;

await runObjectNativeSmokeInProcess({
  workspaceRoot,
  queueName,
});
