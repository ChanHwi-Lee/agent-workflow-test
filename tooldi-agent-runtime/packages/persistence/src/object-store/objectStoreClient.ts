import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

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
  mode?: "memory" | "filesystem";
  rootDir?: string;
  prefix?: string;
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

class FilesystemObjectStoreClient implements ObjectStoreClient {
  private readonly baseDir: string;

  constructor(private readonly options: CreateObjectStoreClientOptions) {
    if (!options.rootDir || options.rootDir.trim().length === 0) {
      throw new Error("Filesystem object store requires rootDir");
    }

    this.baseDir = resolve(
      options.rootDir,
      options.bucket,
      options.prefix ?? "default",
    );
  }

  async putObject(request: PutObjectRequest): Promise<PutObjectResult> {
    const body = normalizeBody(request.body);
    const objectPath = this.resolveObjectPath(request.key);
    const metadataPath = this.resolveMetadataPath(request.key);

    await mkdir(dirname(objectPath), { recursive: true });
    await writeFile(objectPath, body);
    await writeFile(
      metadataPath,
      JSON.stringify({
        contentType: request.contentType,
        metadata: request.metadata ?? {},
      }),
      "utf8",
    );

    return {
      ref: {
        bucket: this.options.bucket,
        key: request.key,
      },
      sizeBytes: body.byteLength,
    };
  }

  async getObject(ref: ObjectStoreRef): Promise<StoredObject> {
    const objectPath = this.resolveObjectPath(ref.key);
    const metadataPath = this.resolveMetadataPath(ref.key);

    const [body, metadataRaw] = await Promise.all([
      readFile(objectPath),
      this.readMetadata(metadataPath),
    ]);

    return {
      body,
      contentType: metadataRaw.contentType,
      metadata: metadataRaw.metadata,
    };
  }

  async deleteObject(ref: ObjectStoreRef): Promise<void> {
    const objectPath = this.resolveObjectPath(ref.key);
    const metadataPath = this.resolveMetadataPath(ref.key);

    await Promise.all([
      unlink(objectPath).catch(() => undefined),
      unlink(metadataPath).catch(() => undefined),
    ]);
  }

  private async readMetadata(metadataPath: string): Promise<{
    contentType: string;
    metadata: Record<string, string>;
  }> {
    try {
      const raw = await readFile(metadataPath, "utf8");
      const parsed = JSON.parse(raw) as {
        contentType?: string;
        metadata?: Record<string, string>;
      };

      return {
        contentType: parsed.contentType ?? "application/octet-stream",
        metadata: parsed.metadata ?? {},
      };
    } catch {
      return {
        contentType: "application/octet-stream",
        metadata: {},
      };
    }
  }

  private resolveObjectPath(key: string): string {
    const resolved = resolve(this.baseDir, key);
    if (!resolved.startsWith(this.baseDir)) {
      throw new Error(`Object key escaped object-store root: ${key}`);
    }
    return resolved;
  }

  private resolveMetadataPath(key: string): string {
    return `${this.resolveObjectPath(key)}.meta.json`;
  }
}

export function createObjectStoreClient(
  options: CreateObjectStoreClientOptions,
): ObjectStoreClient {
  if (options.mode === "filesystem") {
    return new FilesystemObjectStoreClient(options);
  }
  return new InMemoryObjectStoreClient(options);
}
