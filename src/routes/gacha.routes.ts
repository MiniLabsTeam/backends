import { Router, Response } from 'express';
import { SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { gachaService } from '../services/gacha/GachaService';
import { authenticate, AuthRequest } from '../middleware/auth';
import { gachaLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validator';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { questService } from '../services/quest/QuestService';
import { env } from '../config/env';
import logger from '../config/logger';
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
  // NOTE: No rate limiter here! Reveal MUST always succeed after commit.
  // Rate limiting on /pricing is sufficient to prevent abuse.
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

/**
 * POST /api/gacha/clear-stuck
 * Admin clears a stuck pending commit for the authenticated user.
 * Call this when commit succeeded but reveal failed, leaving the user stuck.
 */
router.post(
  '/clear-stuck',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const playerAddress = req.user.address;
    const RPC_URL = env.onechainRpcUrl || 'https://rpc-testnet.onelabs.cc:443';
    const PACKAGE_ID = env.packageId;
    const GACHA_CONFIG_ID = env.gachaConfigId;
    const GACHA_STATE_ID = env.gachaStateId;

    if (!PACKAGE_ID || !GACHA_CONFIG_ID || !GACHA_STATE_ID) {
      throw new AppError('Contract not configured', 500);
    }

    try {
      const client = new SuiClient({ url: RPC_URL });
      const keypair = Ed25519Keypair.fromSecretKey(
        Buffer.from(env.backendPrivateKey.replace('0x', ''), 'hex')
      );
      const sender = keypair.toSuiAddress();

      const coins = await client.getCoins({ owner: sender, coinType: '0x2::oct::OCT' });
      if (coins.data.length === 0) {
        throw new AppError('Backend wallet has no gas', 500);
      }

      const tx = new TransactionBlock();
      tx.setGasPayment([{
        objectId: coins.data[0].coinObjectId,
        version: coins.data[0].version,
        digest: coins.data[0].digest,
      }]);

      tx.moveCall({
        target: `${PACKAGE_ID}::gacha::admin_clear_commit`,
        typeArguments: ['0x2::oct::OCT'],
        arguments: [
          tx.object(GACHA_CONFIG_ID),
          tx.object(GACHA_STATE_ID),
          tx.pure(playerAddress, 'address'),
        ],
      });

      const result = await client.signAndExecuteTransactionBlock({
        signer: keypair,
        transactionBlock: tx,
        options: { showEffects: true },
      });

      logger.info(`Cleared stuck commit for ${playerAddress}. Digest: ${result.digest}`);

      res.json({
        success: true,
        data: {
          message: 'Stuck commit cleared. You can gacha again.',
          digest: result.digest,
        },
      });
    } catch (error: any) {
      logger.error(`Failed to clear stuck commit for ${playerAddress}:`, error);
      throw new AppError(`Failed to clear stuck commit: ${error.message}`, 500);
    }
  })
);

export default router;
