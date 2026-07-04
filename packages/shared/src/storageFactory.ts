import { AzureBlobStorage, BlobStorage, LocalFsStorage } from "./storage";

export interface StorageEnvOptions {
  /** "local" (default) or "azure-blob". */
  driver?: string;
  localRootDir: string;
  localPublicBasePath: string;
  azureConnectionString?: string;
  azureContainerName?: string;
}

/**
 * Builds a BlobStorage instance based on the STORAGE_DRIVER environment
 * convention shared by the API and worker services:
 *   STORAGE_DRIVER=local (default)     -> LocalFsStorage
 *   STORAGE_DRIVER=azure-blob          -> AzureBlobStorage
 */
export function createStorageFromEnv(options: StorageEnvOptions): BlobStorage {
  const driver = options.driver ?? "local";
  if (driver === "azure-blob") {
    if (!options.azureConnectionString || !options.azureContainerName) {
      throw new Error(
        "AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER_* must be set when STORAGE_DRIVER=azure-blob",
      );
    }
    return new AzureBlobStorage({
      connectionString: options.azureConnectionString,
      containerName: options.azureContainerName,
    });
  }
  return new LocalFsStorage({
    rootDir: options.localRootDir,
    publicBasePath: options.localPublicBasePath,
  });
}
