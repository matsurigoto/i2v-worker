import path from "path";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-insecure-secret-change-me",
  authUsername: process.env.AUTH_USERNAME ?? "admin",
  // Password is stored/compared as a bcrypt hash. Default hash below is for
  // the password "admin" and MUST be overridden via AUTH_PASSWORD_HASH in
  // any non-local environment.
  authPasswordHash:
    process.env.AUTH_PASSWORD_HASH ??
    "$2a$10$Ar7JzAIi8fWs6g3JR/PHduOj4GqI1iSjQqR6ho1bCB0LM6ylv1FJ6",
  cookieName: "i2v_session",
  mediaRootDir: process.env.MEDIA_ROOT_DIR ?? path.join(process.cwd(), "data", "media"),
  mediaPublicBasePath: process.env.MEDIA_PUBLIC_BASE_PATH ?? "/media",
  storageDriver: process.env.STORAGE_DRIVER ?? "local",
  azureStorageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
  azureStorageContainerName: process.env.AZURE_STORAGE_CONTAINER_NAME,
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  imagesPageSizeDefault: 24,
};
