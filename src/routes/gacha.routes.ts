import { Router, Response } from 'express';
import { gachaService } from '../services/gacha/GachaService';
import { authenticate, AuthRequest } from '../middleware/auth';
import { gachaLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validator';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { questService } from '../services/quest/QuestService';
import Joi from 'joi';

const router = Router();

/**
 * GET /api/gacha/tiers
 * Get all gacha tiers information
 */
router.get(
  '/tiers',
  asyncHandler(async (req, res: Response) => {
    const tiers = gachaService.getAllTiers();

    res.json({
      success: true,
      data: tiers,
    });
  })
);

/**
 * GET /api/gacha/tier/:tierId
 * Get specific tier information
 */
router.get(
  '/tier/:tierId',
  validate(
    Joi.object({
      tierId: Joi.number().integer().min(1).max(3).required(),
    })
  ),
  asyncHandler(async (req, res: Response) => {
    const tierId = parseInt(req.params.tierId, 10);
    const tier = gachaService.getTierInfo(tierId);

    if (!tier) {
      throw new AppError('Tier not found', 404);
    }

    res.json({
      success: true,
      data: tier,
    });
  })
);

/**
 * POST /api/gacha/pricing
 * Get pricing with backend signature
 */
router.post(
  '/pricing',
  authenticate,
  gachaLimiter,
  validate(
    Joi.object({
      tierId: Joi.number().integer().min(1).max(3).required(),
      discountPercent: Joi.number().integer().min(0).max(50).optional(),
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { tierId, discountPercent = 0 } = req.body;

    const pricing = await gachaService.getPricing(
      req.user.address,
      tierId,
      discountPercent
    );

    res.json({
      success: true,
      data: pricing,
    });
  })
);

/**
 * POST /api/gacha/reveal
 * Generate reveal data (after commit is confirmed on-chain)
 */
router.post(
  '/reveal',
  authenticate,
  gachaLimiter,
  validate(
    Joi.object({
      tierId: Joi.number().integer().min(1).max(3).required(),
      is_car: Joi.boolean().required(),
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { tierId, is_car } = req.body;

    const reveal = await gachaService.generateReveal(req.user.address, tierId, is_car);

    // Update quest progress (fire-and-forget)
    questService.updateProgress(req.user.address, 'GACHA_PULL', 1);

    res.json({
      success: true,
      data: reveal,
    });
  })
);

/**
 * GET /api/gacha/history
 * Get user's gacha history
 */
router.get(
  '/history',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const limit = parseInt(req.query.limit as string, 10) || 20;
    const history = await gachaService.getHistory(req.user.address, limit);

    res.json({
      success: true,
      data: history,
    });
  })
);

/**
 * GET /api/gacha/stats
 * Get user's gacha statistics
 */
router.get(
  '/stats',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const stats = await gachaService.getStats(req.user.address);

    res.json({
      success: true,
      data: stats,
    });
  })
);

/**
 * POST /api/gacha/simulate
 * Simulate gacha pulls (testing/preview)
 */
router.post(
  '/simulate',
  validate(
    Joi.object({
      tierId: Joi.number().integer().min(1).max(3).required(),
      count: Joi.number().integer().min(1).max(100).optional(),
    })
  ),
  asyncHandler(async (req, res: Response) => {
    const { tierId, count = 10 } = req.body;

    const simulation = gachaService.simulateGacha(tierId, count);

    res.json({
      success: true,
      data: simulation,
    });
  })
);

// Token costs per tier for token-based gacha
const TOKEN_GACHA_COSTS: Record<number, number> = { 1: 500, 2: 1500, 3: 3000 };

/**
 * POST /api/gacha/pull-with-tokens
 * Spend in-game tokens to do a gacha pull (no blockchain needed)
 */
router.post(
  '/pull-with-tokens',
  authenticate,
  gachaLimiter,
  validate(
    Joi.object({
      tierId: Joi.number().integer().min(1).max(3).required(),
      is_car: Joi.boolean().required(),
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { tierId, is_car } = req.body;
    const cost = TOKEN_GACHA_COSTS[tierId];
    if (!cost) throw new AppError('Invalid tier', 400);

    // Check balance
    const { prismaClient } = await import('../config/database');
    const user = await prismaClient.user.findUnique({ where: { address: req.user.address } });
    if (!user) throw new AppError('User not found', 404);

    const balance = (user as any).tokenBalance ?? 0;
    if (balance < cost) {
      throw new AppError(`Not enough tokens. Need ${cost}, have ${balance}.`, 400);
    }

    // Deduct tokens
    await prismaClient.user.update({
      where: { address: req.user.address },
      data: { tokenBalance: { decrement: cost } },
    });

    // Generate gacha result
    const reveal = await gachaService.generateReveal(req.user.address, tierId, is_car);

    // Update quest progress
    questService.updateProgress(req.user.address, 'GACHA_PULL', 1);

    // Return result with new balance
    const updatedUser = await prismaClient.user.findUnique({ where: { address: req.user.address } });

    res.json({
      success: true,
      data: {
        ...reveal,
        tokenCost: cost,
        newTokenBalance: (updatedUser as any)?.tokenBalance ?? 0,
      },
    });
  })
);

export default router;
