import { prismaClient } from '../../config/database';
import logger from '../../config/logger';

// ─── Quest templates (same content every day/week, ID encodes the period) ────

interface QuestTemplate {
  suffix: string;          // appended to date/week ID
  name: string;
  description: string;
  requirementType: string;
  requirementCount: number;
  rewardTokens: number;
}

const DAILY_TEMPLATES: QuestTemplate[] = [
  { suffix: 'race',     name: 'Daily Racer',      description: 'Complete 1 race today',         requirementType: 'RACE_COMPLETE',    requirementCount: 1,  rewardTokens: 100 },
  { suffix: 'win',      name: 'Victory Lap',       description: 'Win 1 race today',              requirementType: 'RACE_WIN',         requirementCount: 1,  rewardTokens: 200 },
  { suffix: 'gacha',    name: 'Lucky Pull',        description: 'Do 1 gacha pull today',         requirementType: 'GACHA_PULL',       requirementCount: 1,  rewardTokens: 150 },
  { suffix: 'distance', name: 'Road Warrior',      description: 'Cover 500m in races today',     requirementType: 'DISTANCE_COVERED', requirementCount: 500, rewardTokens: 80 },
];

const WEEKLY_TEMPLATES: QuestTemplate[] = [
  { suffix: 'races',    name: 'Weekly Grinder',    description: 'Complete 5 races this week',    requirementType: 'RACE_COMPLETE',    requirementCount: 5,  rewardTokens: 500 },
  { suffix: 'wins',     name: 'Champion',          description: 'Win 3 races this week',         requirementType: 'RACE_WIN',         requirementCount: 3,  rewardTokens: 1000 },
  { suffix: 'gacha',    name: 'Gacha Addict',      description: 'Do 5 gacha pulls this week',    requirementType: 'GACHA_PULL',       requirementCount: 5,  rewardTokens: 750 },
  { suffix: 'distance', name: 'Long Hauler',       description: 'Cover 3000m in races this week',requirementType: 'DISTANCE_COVERED', requirementCount: 3000, rewardTokens: 400 },
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0]; // '2026-02-21'
}

/** ISO string for the Monday of the current week */
function weekStartStr(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun…6=Sat
  const diff = (day === 0 ? -6 : 1 - day); // shift to Monday
  const mon = new Date(now);
  mon.setUTCDate(now.getUTCDate() + diff);
  return mon.toISOString().split('T')[0];
}

function startOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function endOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999Z`);
}

function addDays(dateStr: string, n: number): Date {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────

export class QuestService {
  private static instance: QuestService;

  public static getInstance(): QuestService {
    if (!QuestService.instance) QuestService.instance = new QuestService();
    return QuestService.instance;
  }

  // ── Auto-creation ──────────────────────────────────────────────────────────

  /**
   * Ensure today's daily quests and this week's weekly quests exist in the DB.
   * Called lazily on every quest fetch — idempotent via upsert.
   */
  public async ensureQuestsExist(): Promise<void> {
    try {
      await Promise.all([
        this.ensureDailyQuests(),
        this.ensureWeeklyQuests(),
      ]);
    } catch (err) {
      logger.error(`ensureQuestsExist failed: ${err}`);
    }
  }

  private async ensureDailyQuests(): Promise<void> {
    const date = todayStr();
    const start = startOfDay(date);
    const end = endOfDay(date);

    for (const t of DAILY_TEMPLATES) {
      const id = `daily-${t.suffix}-${date}`;
      await prismaClient.quest.upsert({
        where: { id },
        create: {
          id,
          name: t.name,
          description: t.description,
          requirement: JSON.stringify({ type: t.requirementType, count: t.requirementCount }),
          reward: JSON.stringify({ tokens: t.rewardTokens }),
          type: 'DAILY',
          isActive: true,
          startDate: start,
          endDate: end,
        },
        update: { isActive: true, type: 'DAILY' },
      });
    }
  }

  private async ensureWeeklyQuests(): Promise<void> {
    const weekStart = weekStartStr();
    const start = startOfDay(weekStart);
    const end = addDays(weekStart, 7); // next Monday 00:00 UTC

    for (const t of WEEKLY_TEMPLATES) {
      const id = `weekly-${t.suffix}-${weekStart}`;
      await prismaClient.quest.upsert({
        where: { id },
        create: {
          id,
          name: t.name,
          description: t.description,
          requirement: JSON.stringify({ type: t.requirementType, count: t.requirementCount }),
          reward: JSON.stringify({ tokens: t.rewardTokens }),
          type: 'WEEKLY',
          isActive: true,
          startDate: start,
          endDate: end,
        },
        update: { isActive: true, type: 'WEEKLY' },
      });
    }
  }

  // ── Progress tracking ──────────────────────────────────────────────────────

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

  // ── Claim ──────────────────────────────────────────────────────────────────

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
