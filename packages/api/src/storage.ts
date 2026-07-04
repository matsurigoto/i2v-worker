import { createStorageFromEnv } from "@i2v/shared";
import { config } from "./config";

/** Process-wide BlobStorage instance, selected via STORAGE_DRIVER. */
export const storage = createStorageFromEnv({
  driver: config.storageDriver,
  localRootDir: config.mediaRootDir,
  localPublicBasePath: config.mediaPublicBasePath,
  azureConnectionString: config.azureStorageConnectionString,
  azureContainerName: config.azureStorageContainerName,
});
