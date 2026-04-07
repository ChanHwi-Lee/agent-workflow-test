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
  _input: HydratedPlanningInput,
  _normalizedIntent: NormalizedIntent,
  lastMutationAck: WaitMutationAckResponse | null,
  _dependencies: EmitRefinementMutationsDependencies,
): Promise<RefinementMutationBatch> {
  if (lastMutationAck?.status !== "acked") {
    return {
      proposedMutationIds: [],
      lastMutationAck,
    };
  }

  return {
    proposedMutationIds: [],
    lastMutationAck,
  };
}
