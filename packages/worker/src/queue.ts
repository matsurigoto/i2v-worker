import type { PrismaClient } from "@i2v/db";

export interface ClaimedMessage {
  id: string;
  videoJobId: string;
}

/**
 * Claims the oldest unprocessed queue message, marking it as processed so no
 * other worker instance picks it up concurrently. This table stands in for
 * Azure Storage Queue / Service Bus in local dev & tests (see
 * packages/db/prisma/schema.prisma `QueueMessage`).
 *
 * Note: this is an at-most-once claim (no visibility-timeout/retry). If the
 * worker crashes mid-chain, the affected VideoJob is left in "running" status
 * and must be retried manually (e.g. by re-triggering video generation).
 */
export async function claimNextMessage(
  prisma: PrismaClient,
): Promise<ClaimedMessage | null> {
  return prisma.$transaction(async (tx) => {
    const message = await tx.queueMessage.findFirst({
      where: { processed: false, visibleAt: { lte: new Date() } },
      orderBy: { createdAt: "asc" },
    });
    if (!message) return null;

    await tx.queueMessage.update({
      where: { id: message.id },
      data: { processed: true, dequeueCount: { increment: 1 } },
    });

    return { id: message.id, videoJobId: message.videoJobId };
  });
}
