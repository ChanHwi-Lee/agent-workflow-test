import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/interview.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.AGENT_RUNTIME_POSTGRES_URL ??
      process.env.LANGGRAPH_CHECKPOINTER_POSTGRES_URL ??
      process.env.POSTGRES_URL ??
      "",
  },
});
