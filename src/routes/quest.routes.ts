import { Router, Response } from 'express';
import { prismaClient } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';

const router = Router();

/**
 * GET /api/quest/daily
 * Get daily quests with user's progress
 */
router.get(
  '/daily',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const dailyQuests = await prismaClient.quest.findMany({
      where: {
        type: 'DAILY',
        isActive: true,
        startDate: { lte: new Date() },
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
      },
      include: {
        progress: {
          where: { playerAddress: req.user.address },
        },
      },
    });

    const questsWithProgress = dailyQuests.map((quest) => {
      const userProgress = quest.progress[0];
      return {
        id: quest.id,
        name: quest.name,
        description: quest.description,
        type: quest.type,
        requirement: quest.requirement,
        reward: quest.reward,
        progress: userProgress?.progress || 0,
        isCompleted: userProgress?.isCompleted || false,
        isClaimed: userProgress?.isClaimed || false,
        completedAt: userProgress?.completedAt,
        claimedAt: userProgress?.claimedAt,
      };
    });

    res.json({
      success: true,
      data: questsWithProgress,
    });
  })
);

/**
 * GET /api/quest/weekly
 * Get weekly quests with user's progress
 */
router.get(
  '/weekly',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const weeklyQuests = await prismaClient.quest.findMany({
      where: {
        type: 'WEEKLY',
        isActive: true,
        startDate: { lte: new Date() },
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
      },
      include: {
        progress: {
          where: { playerAddress: req.user.address },
        },
      },
    });

    const questsWithProgress = weeklyQuests.map((quest) => {
      const userProgress = quest.progress[0];
      return {
        id: quest.id,
        name: quest.name,
        description: quest.description,
        type: quest.type,
        requirement: quest.requirement,
        reward: quest.reward,
        progress: userProgress?.progress || 0,
        isCompleted: userProgress?.isCompleted || false,
        isClaimed: userProgress?.isClaimed || false,
        completedAt: userProgress?.completedAt,
        claimedAt: userProgress?.claimedAt,
      };
    });

    res.json({
      success: true,
      data: questsWithProgress,
    });
  })
);

/**
 * GET /api/quest/all
 * Get all active quests
 */
router.get(
  '/all',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const quests = await prismaClient.quest.findMany({
      where: {
        isActive: true,
        startDate: { lte: new Date() },
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
      },
      include: {
        progress: {
          where: { playerAddress: req.user.address },
        },
      },
      orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
    });

    const questsWithProgress = quests.map((quest) => {
      const userProgress = quest.progress[0];
      return {
        id: quest.id,
        name: quest.name,
        description: quest.description,
        type: quest.type,
        requirement: quest.requirement,
        reward: quest.reward,
        progress: userProgress?.progress || 0,
        isCompleted: userProgress?.isCompleted || false,
        isClaimed: userProgress?.isClaimed || false,
        completedAt: userProgress?.completedAt,
        claimedAt: userProgress?.claimedAt,
      };
    });

    res.json({
      success: true,
      data: questsWithProgress,
    });
  })
);

/**
 * GET /api/quest/:questId
 * Get specific quest details
 */
router.get(
  '/:questId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { questId } = req.params;

    const quest = await prismaClient.quest.findUnique({
      where: { id: questId },
      include: {
        progress: {
          where: { playerAddress: req.user.address },
        },
      },
    });

    if (!quest) {
      throw new AppError('Quest not found', 404);
    }

    const userProgress = quest.progress[0];

    res.json({
      success: true,
      data: {
        id: quest.id,
        name: quest.name,
        description: quest.description,
        type: quest.type,
        requirement: quest.requirement,
        reward: quest.reward,
        startDate: quest.startDate,
        endDate: quest.endDate,
        progress: userProgress?.progress || 0,
        isCompleted: userProgress?.isCompleted || false,
        isClaimed: userProgress?.isClaimed || false,
        completedAt: userProgress?.completedAt,
        claimedAt: userProgress?.claimedAt,
      },
    });
  })
);

/**
 * GET /api/quest/claimable
 * Get user's claimable quests
 */
router.get(
  '/claimable',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const claimableProgress = await prismaClient.questProgress.findMany({
      where: {
        playerAddress: req.user.address,
        isCompleted: true,
        isClaimed: false,
      },
      include: {
        quest: true,
      },
    });

    const claimableQuests = claimableProgress.map((progress) => ({
      id: progress.quest.id,
      name: progress.quest.name,
      description: progress.quest.description,
      type: progress.quest.type,
      reward: progress.quest.reward,
      completedAt: progress.completedAt,
    }));

    res.json({
      success: true,
      data: claimableQuests,
    });
  })
);

/**
 * GET /api/quest/stats
 * Get user's quest statistics
 */
router.get(
  '/stats',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const [totalCompleted, totalClaimed, dailyCompleted, weeklyCompleted] =
      await Promise.all([
        prismaClient.questProgress.count({
          where: {
            playerAddress: req.user.address,
            isCompleted: true,
          },
        }),
        prismaClient.questProgress.count({
          where: {
            playerAddress: req.user.address,
            isClaimed: true,
          },
        }),
        prismaClient.questProgress.count({
          where: {
            playerAddress: req.user.address,
            isCompleted: true,
            quest: { type: 'DAILY' },
          },
        }),
        prismaClient.questProgress.count({
          where: {
            playerAddress: req.user.address,
            isCompleted: true,
            quest: { type: 'WEEKLY' },
          },
        }),
      ]);

    res.json({
      success: true,
      data: {
        totalCompleted,
        totalClaimed,
        dailyCompleted,
        weeklyCompleted,
      },
    });
  })
);

export default router;
