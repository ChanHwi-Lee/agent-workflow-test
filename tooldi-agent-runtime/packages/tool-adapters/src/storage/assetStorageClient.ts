export interface StoredAssetRecord {
  assetId: string;
  persistedAt: string;
}

export interface AssetStorageClient {
  persistDraftAsset(input: {
    assetId: string;
    source: string;
  }): Promise<StoredAssetRecord>;
}

class PlaceholderAssetStorageClient implements AssetStorageClient {
  async persistDraftAsset(input: {
    assetId: string;
    source: string;
  }): Promise<StoredAssetRecord> {
    return {
      assetId: input.assetId,
      persistedAt: new Date().toISOString(),
    };
  }
}

export function createAssetStorageClient(): AssetStorageClient {
  return new PlaceholderAssetStorageClient();
}
