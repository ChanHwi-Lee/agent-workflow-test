export interface ObjectStoreRef {
  bucket: string;
  key: string;
  versionId?: string;
  etag?: string;
}

export interface PutObjectRequest {
  key: string;
  body: Uint8Array | string;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface PutObjectResult {
  ref: ObjectStoreRef;
  sizeBytes: number;
}

export interface StoredObject {
  body: Uint8Array;
  contentType: string;
  metadata: Record<string, string>;
}

export interface ObjectStoreClient {
  putObject(request: PutObjectRequest): Promise<PutObjectResult>;
  getObject(ref: ObjectStoreRef): Promise<StoredObject>;
  deleteObject(ref: ObjectStoreRef): Promise<void>;
}

export interface CreateObjectStoreClientOptions {
  bucket: string;
}

function normalizeBody(body: Uint8Array | string): Uint8Array {
  if (typeof body === "string") {
    return new TextEncoder().encode(body);
  }
  return body;
}

class InMemoryObjectStoreClient implements ObjectStoreClient {
  private readonly bucket: string;
  private readonly store = new Map<string, StoredObject>();

  constructor(options: CreateObjectStoreClientOptions) {
    this.bucket = options.bucket;
  }

  async putObject(request: PutObjectRequest): Promise<PutObjectResult> {
    const body = normalizeBody(request.body);
    this.store.set(request.key, {
      body,
      contentType: request.contentType,
      metadata: request.metadata ?? {},
    });

    return {
      ref: {
        bucket: this.bucket,
        key: request.key,
      },
      sizeBytes: body.byteLength,
    };
  }

  async getObject(ref: ObjectStoreRef): Promise<StoredObject> {
    const stored = this.store.get(ref.key);
    if (!stored) {
      throw new Error(`Object not found: ${ref.bucket}/${ref.key}`);
    }
    return stored;
  }

  async deleteObject(ref: ObjectStoreRef): Promise<void> {
    this.store.delete(ref.key);
  }
}

export function createObjectStoreClient(
  options: CreateObjectStoreClientOptions,
): ObjectStoreClient {
  return new InMemoryObjectStoreClient(options);
}
