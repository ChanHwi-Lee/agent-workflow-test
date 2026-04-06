export interface GeneratedImageCandidate {
  assetId: string;
  promptSummary: string;
}

export interface ImagePrimitiveClient {
  generate(prompt: string): Promise<GeneratedImageCandidate>;
  edit(assetId: string, instruction: string): Promise<GeneratedImageCandidate>;
}

class PlaceholderImagePrimitiveClient implements ImagePrimitiveClient {
  async generate(prompt: string): Promise<GeneratedImageCandidate> {
    return {
      assetId: "asset_placeholder_generated",
      promptSummary: prompt,
    };
  }

  async edit(assetId: string, instruction: string): Promise<GeneratedImageCandidate> {
    return {
      assetId,
      promptSummary: instruction,
    };
  }
}

export function createImagePrimitiveClient(): ImagePrimitiveClient {
  return new PlaceholderImagePrimitiveClient();
}
