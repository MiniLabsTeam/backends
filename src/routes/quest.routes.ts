import { Router, Response } from 'express';
import { prismaClient } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { questService } from '../services/quest/QuestService';

const router = Router();

/** Parse requirement + reward JSON stored in DB, attach helper fields */
function formatQuest(quest: any, userProgress?: any) {
  const req = JSON.parse(quest.requirement) as { type: string; count: number };
  const rew = JSON.parse(quest.reward);
  return {
    id: quest.id,
    name: quest.name,
    description: quest.description,
    type: quest.type,
    requirementType: req.type,
    requirementCount: req.count,
    reward: rew,
    endDate: quest.endDate,
    progress: userProgress?.progress ?? 0,
    isCompleted: userProgress?.isCompleted ?? false,
    isClaimed: userProgress?.isClaimed ?? false,
    completedAt: userProgress?.completedAt ?? null,
    claimedAt: userProgress?.claimedAt ?? null,
  };
}

function activeWhere(type?: string) {
  const now = new Date();
  return {
    isActive: true,
    ...(type ? { type } : {}),
    startDate: { lte: now },
    OR: [{ endDate: null }, { endDate: { gte: now } }],
  };
}

/**
 * GET /api/quest/daily
 */
router.get('/daily', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401);

  // Auto-create today's quests if they don't exist yet
  await questService.ensureQuestsExist();

  const quests = await prismaClient.quest.findMany({
    where: activeWhere('DAILY'),
    include: { progress: { where: { playerAddress: req.user.address } } },
    orderBy: { createdAt: 'asc' },
  });

  res.json({ success: true, data: quests.map(q => formatQuest(q, q.progress[0])) });
}));

/**
 * GET /api/quest/weekly
 */
router.get('/weekly', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401);

  // Auto-create this week's quests if they don't exist yet
  await questService.ensureQuestsExist();

  const quests = await prismaClient.quest.findMany({
    where: activeWhere('WEEKLY'),
    include: { progress: { where: { playerAddress: req.user.address } } },
    orderBy: { createdAt: 'asc' },
  });

  res.json({ success: true, data: quests.map(q => formatQuest(q, q.progress[0])) });
}));

/**
 * GET /api/quest/all
 */
router.get('/all', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401);

  const quests = await prismaClient.quest.findMany({
    where: activeWhere(),
    include: { progress: { where: { playerAddress: req.user.address } } },
    orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
  });

  res.json({ success: true, data: quests.map(q => formatQuest(q, q.progress[0])) });
}));

/**
 * GET /api/quest/claimable
 * NOTE: Must be before /:questId
 */
router.get('/claimable', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401);

  const rows = await prismaClient.questProgress.findMany({
    where: { playerAddress: req.user.address, isCompleted: true, isClaimed: false },
    include: { quest: true },
  });

  res.json({
    success: true,
    data: rows.map(r => formatQuest(r.quest, r)),
  });
}));

/**
 * GET /api/quest/stats
 * NOTE: Must be before /:questId
 */
router.get('/stats', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401);

  const [totalCompleted, totalClaimed, dailyCompleted, weeklyCompleted] = await Promise.all([
    prismaClient.questProgress.count({ where: { playerAddress: req.user.address, isCompleted: true } }),
    prismaClient.questProgress.count({ where: { playerAddress: req.user.address, isClaimed: true } }),
    prismaClient.questProgress.count({ where: { playerAddress: req.user.address, isCompleted: true, quest: { type: 'DAILY' } } }),
    prismaClient.questProgress.count({ where: { playerAddress: req.user.address, isCompleted: true, quest: { type: 'WEEKLY' } } }),
  ]);

  res.json({ success: true, data: { totalCompleted, totalClaimed, dailyCompleted, weeklyCompleted } });
}));

/**
 * POST /api/quest/:questId/claim
 */
router.post('/:questId/claim', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401);

  const { questId } = req.params;
  const result = await questService.claimReward(questId, req.user.address);

  res.json({ success: true, data: result, message: 'Reward claimed!' });
}));

/**
 * GET /api/quest/:questId
 * NOTE: Must be last (wildcard)
 */
router.get('/:questId', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401);

  const quest = await prismaClient.quest.findUnique({
    where: { id: req.params.questId },
    include: { progress: { where: { playerAddress: req.user.address } } },
  });

  if (!quest) throw new AppError('Quest not found', 404);

  res.json({ success: true, data: formatQuest(quest, quest.progress[0]) });
}));

export default router;
