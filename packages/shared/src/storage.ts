import { promises as fs } from "fs";
import path from "path";

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
