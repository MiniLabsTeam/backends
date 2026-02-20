import { prismaClient } from '../../config/database';
import logger from '../../config/logger';

export class QuestService {
  private static instance: QuestService;

  public static getInstance(): QuestService {
    if (!QuestService.instance) QuestService.instance = new QuestService();
    return QuestService.instance;
  }

  /**
   * Update quest progress when a game event occurs.
   * Call this from route/service handlers (fire-and-forget, never throws).
   */
  public async updateProgress(
    playerAddress: string,
    eventType: string,
    amount = 1
  ): Promise<void> {
    try {
      const now = new Date();
      const activeQuests = await prismaClient.quest.findMany({
        where: {
          isActive: true,
          startDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
      });

      for (const quest of activeQuests) {
        const req = JSON.parse(quest.requirement) as { type: string; count: number };
        if (req.type !== eventType) continue;

        const existing = await prismaClient.questProgress.findUnique({
          where: { questId_playerAddress: { questId: quest.id, playerAddress } },
        });

        if (existing?.isCompleted) continue;

        const newProgress = Math.min((existing?.progress ?? 0) + amount, req.count);
        const isCompleted = newProgress >= req.count;

        await prismaClient.questProgress.upsert({
          where: { questId_playerAddress: { questId: quest.id, playerAddress } },
          create: {
            questId: quest.id,
            playerAddress,
            progress: newProgress,
            isCompleted,
            isClaimed: false,
            completedAt: isCompleted ? now : null,
          },
          update: {
            progress: newProgress,
            isCompleted,
            ...(isCompleted ? { completedAt: now } : {}),
          },
        });

        if (isCompleted) {
          logger.info(`✅ Quest completed: "${quest.name}" by ${playerAddress}`);
        }
      }
    } catch (error) {
      logger.error(`Quest progress update failed (${eventType}): ${error}`);
    }
  }

  /**
   * Claim quest reward. Throws on invalid state.
   */
  public async claimReward(questId: string, playerAddress: string): Promise<{ reward: any }> {
    const quest = await prismaClient.quest.findUnique({ where: { id: questId } });
    if (!quest || !quest.isActive) throw new Error('Quest not found or inactive');

    const progress = await prismaClient.questProgress.findUnique({
      where: { questId_playerAddress: { questId, playerAddress } },
    });

    if (!progress) throw new Error('Quest not started');
    if (!progress.isCompleted) throw new Error('Quest not completed yet');
    if (progress.isClaimed) throw new Error('Reward already claimed');

    await prismaClient.questProgress.update({
      where: { id: progress.id },
      data: { isClaimed: true, claimedAt: new Date() },
    });

    const reward = JSON.parse(quest.reward) as Record<string, number>;

    // Credit token balance if reward includes tokens
    if (reward.tokens && reward.tokens > 0) {
      await prismaClient.user.update({
        where: { address: playerAddress },
        data: { tokenBalance: { increment: reward.tokens } },
      });
    }

    logger.info(`🎁 Quest reward claimed: "${quest.name}" by ${playerAddress} (+${reward.tokens ?? 0} tokens)`);
    return { reward };
  }
}

export const questService = QuestService.getInstance();
