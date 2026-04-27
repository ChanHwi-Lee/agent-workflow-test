import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { interviewRecords } from "@tooldi/agent-persistence/schema/interview";
import type { Logger } from "@tooldi/agent-observability";

export type InterviewRecordInput = typeof interviewRecords.$inferInsert;

export async function insertInterviewRecord(
  db: NodePgDatabase,
  logger: Logger,
  input: InterviewRecordInput,
): Promise<void> {
  try {
    await db.insert(interviewRecords).values(input);
  } catch (error) {
    // best-effort: 적재 실패가 run 흐름을 차단하지 않는다.
    logger.warn("interview_records best-effort insert failed", {
      runId: input.runId,
      attemptSeq: input.attemptSeq,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
