import { promises as fs } from "fs";
import path from "path";
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";

/**
 * Storage abstraction so the API/worker code is not coupled to a specific
 * backend. `LocalFsStorage` is used for local development / tests;
 * `AzureBlobStorage` (packages/api & packages/worker "azureBlobStorage.ts")
 * should be wired in for production via STORAGE_DRIVER=azure-blob.
 */
export interface BlobStorage {
  /** Persist a buffer under `key` and return a URL/path clients can use to fetch it. */
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  /** Fetch the raw bytes stored under `key`. */
  get(key: string): Promise<Buffer>;
  /** Delete the object stored under `key`, if it exists. */
  delete(key: string): Promise<void>;
  /** Return a URL (absolute or relative) that can be used to download/display the object. */
  urlFor(key: string): string;
}

export interface LocalFsStorageOptions {
  rootDir: string;
  /** Public base path/URL prefix under which files are served, e.g. "/media". */
  publicBasePath: string;
}

export class LocalFsStorage implements BlobStorage {
  constructor(private readonly options: LocalFsStorageOptions) {}

  private resolvePath(key: string): string {
    const safeKey = key.replace(/^\/+/, "");
    return path.join(this.options.rootDir, safeKey);
  }

  async put(key: string, data: Buffer, _contentType?: string): Promise<string> {
    void _contentType;
    const filePath = this.resolvePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    return this.urlFor(key);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolvePath(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolvePath(key), { force: true });
  }

  urlFor(key: string): string {
    const safeKey = key.replace(/^\/+/, "");
    return `${this.options.publicBasePath.replace(/\/+$/, "")}/${safeKey}`;
  }
}

export interface AzureBlobStorageOptions {
  connectionString: string;
  containerName: string;
}

/**
 * Azure Blob Storage backed implementation of BlobStorage, intended for
 * production use (see infra/bicep/main.bicep and docs/architecture.md).
 * Container access is private; `urlFor` returns the blob's plain URL, so
 * callers needing time-limited public access should generate a SAS token
 * (not implemented here to keep the default container private-by-default).
 */
export class AzureBlobStorage implements BlobStorage {
  private readonly containerClient: ContainerClient;

  constructor(options: AzureBlobStorageOptions) {
    const serviceClient = BlobServiceClient.fromConnectionString(options.connectionString);
    this.containerClient = serviceClient.getContainerClient(options.containerName);
  }

  async put(key: string, data: Buffer, contentType: string): Promise<string> {
    const blockBlobClient = this.containerClient.getBlockBlobClient(key);
    await blockBlobClient.uploadData(data, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
    return this.urlFor(key);
  }

  async get(key: string): Promise<Buffer> {
    const blockBlobClient = this.containerClient.getBlockBlobClient(key);
    return blockBlobClient.downloadToBuffer();
  }

  async delete(key: string): Promise<void> {
    const blockBlobClient = this.containerClient.getBlockBlobClient(key);
    await blockBlobClient.deleteIfExists();
  }

  urlFor(key: string): string {
    return this.containerClient.getBlockBlobClient(key).url;
  }
}
