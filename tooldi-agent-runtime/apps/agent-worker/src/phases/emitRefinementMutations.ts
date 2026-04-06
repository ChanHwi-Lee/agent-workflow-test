import type { WaitMutationAckResponse } from "@tooldi/agent-contracts";
import type {
  AssetStorageClient,
  ImagePrimitiveClient,
} from "@tooldi/tool-adapters";

import type {
  HydratedPlanningInput,
  NormalizedIntent,
  RefinementMutationBatch,
} from "../types.js";

export interface EmitRefinementMutationsDependencies {
  imagePrimitiveClient: ImagePrimitiveClient;
  assetStorageClient: AssetStorageClient;
}

export async function emitRefinementMutations(
  input: HydratedPlanningInput,
  normalizedIntent: NormalizedIntent,
  lastMutationAck: WaitMutationAckResponse | null,
  dependencies: EmitRefinementMutationsDependencies,
): Promise<RefinementMutationBatch> {
  if (lastMutationAck?.status !== "acked") {
    return {
      proposedMutationIds: [],
      lastMutationAck,
    };
  }

  const candidate = await dependencies.imagePrimitiveClient.generate(
    normalizedIntent.goalSummary,
  );
  await dependencies.assetStorageClient.persistDraftAsset({
    assetId: candidate.assetId,
    source: input.job.runId,
  });

  return {
    proposedMutationIds: [],
    lastMutationAck,
  };
}
