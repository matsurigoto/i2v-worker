import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

let prisma: PrismaClient | undefined;

/** Returns a process-wide singleton PrismaClient instance. */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}
