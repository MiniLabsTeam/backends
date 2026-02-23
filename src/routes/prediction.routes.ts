import { Router, Response } from 'express';
import { prismaClient } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { validate } from '../middleware/validator';
import Joi from 'joi';
import { getSuiClient } from '../config/blockchain';

const OCT_COIN_TYPE = '0x2::oct::OCT';
const OCT_DECIMALS = 9; // 1 OCT = 1_000_000_000 MIST

const router = Router();

/**
 * GET /api/prediction/pools
 * Get all active prediction pools
 */
router.get(
  '/pools',
  asyncHandler(async (req, res: Response) => {
    const pools = await prismaClient.predictionPool.findMany({
      where: {
        isSettled: false,
        room: {
          status: { notIn: ['FINISHED', 'CANCELLED', 'STARTED'] },
        },
      },
      include: {
        room: {
          include: {
            players: {
              include: {
                user: {
                  select: {
                    address: true,
                    username: true,
                  },
                },
              },
            },
          },
        },
        bets: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: pools,
    });
  })
);

/**
 * GET /api/prediction/pool/:roomUid
 * Get specific prediction pool with odds
 */
router.get(
  '/pool/:roomUid',
  asyncHandler(async (req, res: Response) => {
    const { roomUid } = req.params;

    const pool = await prismaClient.predictionPool.findUnique({
      where: { roomUid },
      include: {
        room: {
          include: {
            players: {
              include: {
                user: {
                  select: {
                    address: true,
                    username: true,
                  },
                },
              },
            },
          },
        },
        bets: true,
      },
    });

    if (!pool) {
      throw new AppError('Prediction pool not found', 404);
    }

    // Calculate odds for each player
    const playerBets: Record<string, { amount: bigint; count: number }> = {};

    for (const bet of pool.bets) {
      if (!playerBets[bet.predictedWinner]) {
        playerBets[bet.predictedWinner] = { amount: BigInt(0), count: 0 };
      }
      playerBets[bet.predictedWinner].amount += BigInt(bet.amount);
      playerBets[bet.predictedWinner].count++;
    }

    const totalPool = BigInt(pool.totalPool);
    const odds: Record<string, number> = {};

    for (const [player, data] of Object.entries(playerBets)) {
      if (data.amount > 0 && totalPool > 0) {
        // Odds = totalPool / playerBets
        odds[player] = Number(totalPool) / Number(data.amount);
      } else {
        odds[player] = 0;
      }
    }

    res.json({
      success: true,
      data: {
        ...pool,
        playerBets: Object.fromEntries(
          Object.entries(playerBets).map(([k, v]) => [
            k,
            { amount: v.amount.toString(), count: v.count },
          ])
        ),
        odds,
      },
    });
  })
);

/**
 * GET /api/prediction/my-bets
 * Get user's active bets
 */
router.get(
  '/my-bets',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const bets = await prismaClient.bet.findMany({
      where: { bettor: req.user.address },
      include: {
        pool: {
          include: {
            room: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: bets,
    });
  })
);

/**
 * GET /api/prediction/claimable
 * Get user's claimable payouts
 */
router.get(
  '/claimable',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const claimableBets = await prismaClient.bet.findMany({
      where: {
        bettor: req.user.address,
        hasClaimed: false,
        pool: {
          isSettled: true,
          actualWinner: {
            not: null,
          },
        },
      },
      include: {
        pool: {
          include: {
            room: true,
          },
        },
      },
    });

    // Filter only winning bets
    const winningBets = claimableBets.filter(
      (bet) => bet.predictedWinner === bet.pool.actualWinner
    );

    res.json({
      success: true,
      data: winningBets,
    });
  })
);

/**
 * GET /api/prediction/history
 * Get user's bet history
 */
router.get(
  '/history',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const limit = parseInt(req.query.limit as string, 10) || 20;

    const bets = await prismaClient.bet.findMany({
      where: { bettor: req.user.address },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        pool: {
          include: {
            room: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: bets,
    });
  })
);

/**
 * GET /api/prediction/stats
 * Get user's prediction statistics
 */
router.get(
  '/stats',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const [totalBets, wonBets, totalWagered, totalWon] = await Promise.all([
      prismaClient.bet.count({
        where: { bettor: req.user.address },
      }),
      prismaClient.bet.count({
        where: {
          bettor: req.user.address,
          pool: {
            isSettled: true,
            actualWinner: {
              not: null,
            },
          },
        },
      }),
      (prismaClient.bet as any).aggregate({
        where: { bettor: req.user.address },
        _sum: { amount: true },
      }),
      (prismaClient.bet as any).aggregate({
        where: {
          bettor: req.user.address,
          hasClaimed: true,
        },
        _sum: { payout: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalBets,
        wonBets,
        winRate: totalBets > 0 ? (wonBets / totalBets) * 100 : 0,
        totalWagered: totalWagered._sum?.amount || '0',
        totalWon: totalWon._sum?.payout || '0',
      },
    });
  })
);

/**
 * POST /api/prediction/bet
 * Place a bet on a prediction pool using in-game tokens
 */
router.post(
  '/bet',
  authenticate,
  validate(
    Joi.object({
      poolId: Joi.string().required(),
      predictedWinnerId: Joi.string().required(),
      amount: Joi.number().integer().min(1).required(),
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { poolId, predictedWinnerId, amount } = req.body;

    const pool = await prismaClient.predictionPool.findUnique({
      where: { id: poolId },
      include: { room: { include: { players: true } } },
    });
    if (!pool) throw new AppError('Prediction pool not found', 404);
    if (pool.isSettled) throw new AppError('Pool is already settled', 400);

    // Verify predictedWinnerId is a player in the room
    const isValidPlayer = pool.room.players.some(
      (p) => p.playerAddress === predictedWinnerId
    );
    if (!isValidPlayer) throw new AppError('Invalid predicted winner', 400);

    // Check on-chain OCT balance
    const client = getSuiClient();
    const betAmountMist = BigInt(amount) * BigInt(10 ** OCT_DECIMALS); // Convert OCT to MIST

    // Get total already-bet amount for this user (uncommitted bets)
    const existingBets = await (prismaClient.bet as any).aggregate({
      where: {
        bettor: req.user.address,
        pool: { isSettled: false },
      },
      _sum: { amount: true },
    });
    const alreadyBetMist = BigInt(existingBets._sum?.amount || '0');

    // Fetch on-chain balance
    const balanceResult = await client.getBalance({
      owner: req.user.address,
      coinType: OCT_COIN_TYPE,
    });
    const onChainBalance = BigInt(balanceResult.totalBalance);
    const availableBalance = onChainBalance - alreadyBetMist;
    const availableOCT = Number(availableBalance) / (10 ** OCT_DECIMALS);

    if (availableBalance < betAmountMist) {
      throw new AppError(
        `Not enough OCT. Need ${amount} OCT, available ${availableOCT.toFixed(2)} OCT (on-chain: ${(Number(onChainBalance) / 10 ** OCT_DECIMALS).toFixed(2)} OCT, already bet: ${(Number(alreadyBetMist) / 10 ** OCT_DECIMALS).toFixed(2)} OCT).`,
        400
      );
    }

    // Create bet & update pool atomically (store in MIST)
    await prismaClient.$transaction([
      prismaClient.bet.create({
        data: {
          poolId,
          bettor: req.user.address,
          predictedWinner: predictedWinnerId,
          amount: betAmountMist.toString(),
        },
      }),
      prismaClient.predictionPool.update({
        where: { id: poolId },
        data: {
          totalPool: (BigInt(pool.totalPool) + betAmountMist).toString(),
        },
      }),
    ]);

    res.json({ success: true, message: `Bet ${amount} OCT placed successfully` });
  })
);

/**
 * POST /api/prediction/claim/:betId
 * Claim payout for a winning bet (awarded as in-game tokens)
 */
router.post(
  '/claim/:betId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { betId } = req.params;

    const bet = await prismaClient.bet.findUnique({
      where: { id: betId },
      include: { pool: true },
    });
    if (!bet) throw new AppError('Bet not found', 404);
    if (bet.bettor !== req.user.address) throw new AppError('Not your bet', 403);
    if (bet.hasClaimed) throw new AppError('Already claimed', 400);
    if (!bet.pool.isSettled) throw new AppError('Pool not settled yet', 400);
    if (bet.predictedWinner !== bet.pool.actualWinner) {
      throw new AppError('This bet did not win', 400);
    }

    // Calculate payout: proportional share of total pool (in MIST)
    const winnerBetsAgg = await (prismaClient.bet as any).aggregate({
      where: { poolId: bet.poolId, predictedWinner: bet.pool.actualWinner! },
      _sum: { amount: true },
    });
    const totalPool = BigInt(bet.pool.totalPool);
    const winnerTotal = BigInt(winnerBetsAgg._sum?.amount || '0');
    const betAmount = BigInt(bet.amount);
    const payout = winnerTotal > 0n ? (betAmount * totalPool) / winnerTotal : 0n;
    const payoutOCT = Number(payout) / (10 ** OCT_DECIMALS);

    // Mark claimed in DB (on-chain payout via claim_payout contract)
    await prismaClient.bet.update({
      where: { id: betId },
      data: { hasClaimed: true, payout: payout.toString(), claimedAt: new Date() },
    });

    res.json({
      success: true,
      data: { payout: payout.toString(), payoutOCT },
      message: `Payout: ${payoutOCT.toFixed(2)} OCT`,
    });
  })
);

export default router;
