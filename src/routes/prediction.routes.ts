import { Router, Response } from 'express';
import { prismaClient } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { validate } from '../middleware/validator';
import Joi from 'joi';
import { getSuiClient, blockchainConfig } from '../config/blockchain';

const OCT_COIN_TYPE = '0x2::oct::OCT';
const OCT_DECIMALS = 9; // 1 OCT = 1_000_000_000 MIST

const router = Router();

// ==================== Pool Endpoints ====================

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

// ==================== Deposit / Withdraw / Balance ====================

/**
 * GET /api/prediction/balance
 * Get user's deposited prediction balance
 */
router.get(
  '/balance',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Authentication required', 401);

    const user = await prismaClient.user.findUnique({
      where: { address: req.user.address },
      select: { predictionBalance: true },
    });

    const balanceMist = BigInt(user?.predictionBalance || '0');
    const balanceOCT = Number(balanceMist) / (10 ** OCT_DECIMALS);

    res.json({
      success: true,
      data: {
        balanceMist: balanceMist.toString(),
        balanceOCT: balanceOCT,
      },
    });
  })
);

/**
 * POST /api/prediction/deposit
 * Verify an on-chain OCT transfer to treasury and credit predictionBalance
 * User sends OCT to treasury address via wallet, then calls this with the txDigest
 */
router.post(
  '/deposit',
  authenticate,
  validate(
    Joi.object({
      txDigest: Joi.string().required(),
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { txDigest } = req.body;

    // Check if this tx was already credited
    const existing = await prismaClient.predictionDeposit.findUnique({
      where: { txDigest },
    });
    if (existing) {
      throw new AppError('This transaction has already been credited', 400);
    }

    // Verify the transaction on-chain
    const client = getSuiClient();
    let txResponse: any;
    try {
      txResponse = await client.getTransactionBlock({
        digest: txDigest,
        options: {
          showBalanceChanges: true,
          showInput: true,
          showEffects: true,
        },
      });
    } catch (err) {
      throw new AppError('Transaction not found on-chain', 404);
    }

    // Verify sender is the authenticated user
    const sender = txResponse.transaction?.data?.sender;
    if (sender !== req.user.address) {
      throw new AppError('Transaction sender does not match your wallet', 403);
    }

    // Check transaction status
    const status = txResponse.effects?.status?.status;
    const statusError = txResponse.effects?.status?.error;

    if (status !== 'success') {
      // Transaction failed - calculate gas consumed and provide recovery info
      const gasUsed = BigInt(txResponse.effects?.gasUsed?.computationCost || '0') +
        BigInt(txResponse.effects?.gasUsed?.storageCost || '0') -
        BigInt(txResponse.effects?.gasUsed?.storageRebate || '0');
      const gasUsedOCT = Number(gasUsed) / (10 ** OCT_DECIMALS);

      const errorMessage = statusError || 'Unknown error';
      const helpMessage = errorMessage.includes('is not available for consumption')
        ? 'This error occurs when coin objects have version conflicts. Your coins were consumed as gas fees. Please report this with your transaction digest for a refund.'
        : 'The transaction failed on-chain. Your coins were consumed as gas fees.';

      throw new AppError(
        `Deposit failed: ${errorMessage}. Gas consumed: ${gasUsedOCT.toFixed(6)} OCT. ${helpMessage}`,
        400
      );
    }

    // Find the OCT balance change to treasury
    const treasuryAddr = blockchainConfig.treasuryAddress;
    const balanceChanges = txResponse.balanceChanges || [];

    let depositAmount = 0n;
    for (const change of balanceChanges) {
      // Look for positive OCT change to treasury address
      if (
        change.owner?.AddressOwner === treasuryAddr &&
        change.coinType === OCT_COIN_TYPE &&
        BigInt(change.amount) > 0n
      ) {
        depositAmount = BigInt(change.amount);
        break;
      }
    }

    if (depositAmount <= 0n) {
      throw new AppError('No OCT transfer to treasury found in this transaction', 400);
    }

    // Note: minimum deposit (10 OCT) is enforced on frontend BEFORE signing.
    // Backend always credits valid deposits to avoid losing user funds
    // if they already signed the on-chain transaction.

    // Credit the user's prediction balance
    const user = await prismaClient.user.findUnique({
      where: { address: req.user.address },
      select: { predictionBalance: true },
    });
    const currentBalance = BigInt(user?.predictionBalance || '0');
    const newBalance = currentBalance + depositAmount;

    await prismaClient.$transaction([
      prismaClient.user.update({
        where: { address: req.user.address },
        data: { predictionBalance: newBalance.toString() },
      }),
      prismaClient.predictionDeposit.create({
        data: {
          txDigest,
          depositor: req.user.address,
          amount: depositAmount.toString(),
          type: 'DEPOSIT',
        },
      }),
    ]);

    const depositOCT = Number(depositAmount) / (10 ** OCT_DECIMALS);

    res.json({
      success: true,
      data: {
        deposited: depositAmount.toString(),
        depositedOCT: depositOCT,
        newBalance: newBalance.toString(),
        newBalanceOCT: Number(newBalance) / (10 ** OCT_DECIMALS),
      },
      message: `Deposited ${depositOCT.toFixed(2)} OCT successfully`,
    });
  })
);

/**
 * POST /api/prediction/recover-deposit
 * Report a failed deposit transaction and request recovery
 * User provides the failed tx digest and the system verifies and credits the gas loss
 */
router.post(
  '/recover-deposit',
  authenticate,
  validate(
    Joi.object({
      txDigest: Joi.string().required(),
      gasLostOCT: Joi.number().positive().required(), // Amount in OCT that was lost as gas
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { txDigest, gasLostOCT } = req.body;

    // Check if recovery already processed
    const existingRecovery = await prismaClient.predictionDeposit.findUnique({
      where: { txDigest },
    });
    if (existingRecovery) {
      if (existingRecovery.type === 'RECOVERY') {
        throw new AppError('Recovery for this transaction has already been processed', 400);
      }
      throw new AppError('This transaction has already been credited as a deposit', 400);
    }

    // Verify the transaction on-chain
    const client = getSuiClient();
    let txResponse: any;
    try {
      txResponse = await client.getTransactionBlock({
        digest: txDigest,
        options: {
          showBalanceChanges: true,
          showInput: true,
          showEffects: true,
        },
      });
    } catch (err) {
      throw new AppError('Transaction not found on-chain', 404);
    }

    // Verify sender is the authenticated user
    const sender = txResponse.transaction?.data?.sender;
    if (sender !== req.user.address) {
      throw new AppError('Transaction sender does not match your wallet', 403);
    }

    // Verify transaction actually failed
    const status = txResponse.effects?.status?.status;
    if (status === 'success') {
      throw new AppError('This transaction succeeded - no recovery needed. Use deposit endpoint instead.', 400);
    }

    // Validate gas lost amount is reasonable
    const calculatedGas = BigInt(txResponse.effects?.gasUsed?.computationCost || '0') +
      BigInt(txResponse.effects?.gasUsed?.storageCost || '0') -
      BigInt(txResponse.effects?.gasUsed?.storageRebate || '0');
    const calculatedGasOCT = Number(calculatedGas) / (10 ** OCT_DECIMALS);

    // Allow reasonable variance (user submits amount, we verify it's realistic)
    const variance = Math.abs(gasLostOCT - calculatedGasOCT) / (Math.max(gasLostOCT, calculatedGasOCT) || 1);
    if (variance > 0.5) {
      // More than 50% difference - reject
      throw new AppError(
        `Gas amount mismatch. You claim ${gasLostOCT} OCT but on-chain shows ~${calculatedGasOCT.toFixed(6)} OCT. Please check and try again.`,
        400
      );
    }

    // Use the smaller conservative amount
    const recoverAmount = Math.min(gasLostOCT, calculatedGasOCT);
    const recoverMist = BigInt(Math.floor(recoverAmount * 10 ** OCT_DECIMALS));

    // Credit the user's prediction balance
    const user = await prismaClient.user.findUnique({
      where: { address: req.user.address },
      select: { predictionBalance: true },
    });
    const currentBalance = BigInt(user?.predictionBalance || '0');
    const newBalance = currentBalance + recoverMist;

    await prismaClient.$transaction([
      prismaClient.predictionDeposit.create({
        data: {
          txDigest,
          depositor: req.user.address,
          amount: recoverMist.toString(),
          type: 'RECOVERY',
        },
      }),
      prismaClient.user.update({
        where: { address: req.user.address },
        data: { predictionBalance: newBalance.toString() },
      }),
    ]);

    res.json({
      success: true,
      data: {
        recovered: recoverMist.toString(),
        recoveredOCT: recoverAmount,
        newBalance: newBalance.toString(),
        newBalanceOCT: Number(newBalance) / (10 ** OCT_DECIMALS),
      },
      message: `Recovery processed: ${recoverAmount.toFixed(6)} OCT credited to your prediction balance`,
    });
  })
);

/**
 * POST /api/prediction/withdraw
 * Withdraw OCT from prediction balance back to wallet (backend sends OCT)
 */
router.post(
  '/withdraw',
  authenticate,
  validate(
    Joi.object({
      amount: Joi.number().positive().required(), // Amount in OCT (supports decimals)
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { amount } = req.body;
    // Convert OCT (may be decimal) to MIST
    let withdrawMist = BigInt(Math.floor(amount * (10 ** OCT_DECIMALS)));

    const user = await prismaClient.user.findUnique({
      where: { address: req.user.address },
      select: { predictionBalance: true },
    });
    const currentBalance = BigInt(user?.predictionBalance || '0');

    // Handle floating-point rounding: if very close to balance, cap to exact balance
    if (withdrawMist > currentBalance && withdrawMist - currentBalance < BigInt(10 ** OCT_DECIMALS)) {
      withdrawMist = currentBalance;
    }

    if (currentBalance < withdrawMist) {
      const currentOCT = Number(currentBalance) / (10 ** OCT_DECIMALS);
      throw new AppError(
        `Not enough balance. You have ${currentOCT} OCT, trying to withdraw ${amount} OCT.`,
        400
      );
    }

    // Deduct balance first
    const newBalance = currentBalance - withdrawMist;
    await prismaClient.user.update({
      where: { address: req.user.address },
      data: { predictionBalance: newBalance.toString() },
    });

    // Send OCT from treasury to user on-chain
    // For now, we use the backend keypair to sign a transfer
    // The backend/treasury must hold enough OCT
    try {
      const { TransactionBlock } = await import('@mysten/sui.js/transactions');
      const { getBackendKeypair } = await import('../config/blockchain');
      const client = getSuiClient();
      const keypair = getBackendKeypair();

      // Fetch OCT coins owned by backend wallet for gas payment
      // @mysten/sui.js looks for 0x2::sui::SUI by default, but OneChain uses 0x2::oct::OCT
      const coins = await client.getCoins({
        owner: keypair.getPublicKey().toSuiAddress(),
        coinType: OCT_COIN_TYPE,
      });

      if (coins.data.length === 0) {
        // Restore balance since transfer failed
        await prismaClient.user.update({
          where: { address: req.user.address },
          data: { predictionBalance: currentBalance.toString() },
        });
        throw new AppError('Treasury has no OCT coins for withdrawal', 500);
      }

      const tx = new TransactionBlock();

      // Manually set gas payment to OCT coins (OneChain uses OCT as gas, not SUI)
      tx.setGasPayment(coins.data.map(c => ({
        objectId: c.coinObjectId,
        version: c.version,
        digest: c.digest,
      })));

      // Split withdrawal amount from gas coin and transfer to user
      const [coin] = tx.splitCoins(tx.gas, [
        tx.pure(withdrawMist.toString()),
      ]);
      tx.transferObjects([coin], tx.pure(req.user.address));

      const result = await client.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        signer: keypair,
      });

      // Record withdrawal
      await prismaClient.predictionDeposit.create({
        data: {
          txDigest: result.digest,
          depositor: req.user.address,
          amount: withdrawMist.toString(),
          type: 'WITHDRAW',
        },
      });

      res.json({
        success: true,
        data: {
          withdrawn: withdrawMist.toString(),
          withdrawnOCT: amount,
          txDigest: result.digest,
          newBalance: newBalance.toString(),
          newBalanceOCT: Number(newBalance) / (10 ** OCT_DECIMALS),
        },
        message: `Withdrawn ${amount} OCT successfully`,
      });
    } catch (err: any) {
      // If on-chain transfer failed, restore balance
      if (!err.statusCode) {
        await prismaClient.user.update({
          where: { address: req.user.address },
          data: { predictionBalance: currentBalance.toString() },
        });
      }
      throw err instanceof AppError ? err : new AppError(`Withdrawal failed: ${err.message}`, 500);
    }
  })
);

// ==================== Bet Endpoints ====================

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
      prismaClient.bet.findMany({
        where: { bettor: req.user.address },
        select: { amount: true },
      }),
      prismaClient.bet.findMany({
        where: { bettor: req.user.address, hasClaimed: true },
        select: { payout: true },
      }),
    ]);

    const wageredTotal = totalWagered.reduce((s: bigint, b: any) => s + BigInt(b.amount || '0'), 0n);
    const wonTotal = totalWon.reduce((s: bigint, b: any) => s + BigInt(b.payout || '0'), 0n);

    res.json({
      success: true,
      data: {
        totalBets,
        wonBets,
        winRate: totalBets > 0 ? (wonBets / totalBets) * 100 : 0,
        totalWagered: wageredTotal.toString(),
        totalWon: wonTotal.toString(),
      },
    });
  })
);

/**
 * POST /api/prediction/bet
 * Place a bet using deposited prediction balance
 */
router.post(
  '/bet',
  authenticate,
  validate(
    Joi.object({
      poolId: Joi.string().required(),
      predictedWinnerId: Joi.string().required(),
      amount: Joi.number().integer().min(1).required(), // Amount in OCT
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

    // Only allow spectator bets during BETTING period
    if (pool.room.bettingEndsAt && new Date() > new Date(pool.room.bettingEndsAt)) {
      throw new AppError('Betting period has ended', 400);
    }

    // Verify predictedWinnerId is a player in the room
    const isValidPlayer = pool.room.players.some(
      (p) => p.playerAddress === predictedWinnerId
    );
    if (!isValidPlayer) throw new AppError('Invalid predicted winner', 400);

    const betAmountMist = BigInt(amount) * BigInt(10 ** OCT_DECIMALS);

    // Check deposited prediction balance
    const user = await prismaClient.user.findUnique({
      where: { address: req.user.address },
      select: { predictionBalance: true },
    });
    const currentBalance = BigInt(user?.predictionBalance || '0');

    if (currentBalance < betAmountMist) {
      const currentOCT = Number(currentBalance) / (10 ** OCT_DECIMALS);
      throw new AppError(
        `Not enough deposited OCT. You have ${currentOCT.toFixed(2)} OCT deposited. Need ${amount} OCT. Please deposit more OCT first.`,
        400
      );
    }

    // Deduct from prediction balance, create bet, update pool atomically
    const newBalance = currentBalance - betAmountMist;

    // IMPORTANT: Fetch fresh pool state before update to avoid concurrent bet race condition
    const freshPool = await prismaClient.predictionPool.findUnique({
      where: { id: poolId },
      select: { totalPool: true },
    });

    if (!freshPool) {
      throw new AppError('Prediction pool not found (disappeared during bet)', 404);
    }

    // Update with the latest totalPool value
    const updatedTotal = BigInt(freshPool.totalPool) + betAmountMist;

    await prismaClient.$transaction([
      prismaClient.user.update({
        where: { address: req.user.address },
        data: { predictionBalance: newBalance.toString() },
      }),
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
          totalPool: updatedTotal.toString(),
        },
      }),
    ]);

    res.json({
      success: true,
      message: `Bet ${amount} OCT placed successfully`,
      data: {
        remainingBalance: newBalance.toString(),
        remainingBalanceOCT: Number(newBalance) / (10 ** OCT_DECIMALS),
      },
    });
  })
);

/**
 * POST /api/prediction/claim/:betId
 * Claim payout for a winning bet — credits prediction balance
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

    // Calculate payout: proportional share of total pool minus 5% platform fee (in MIST)
    const winnerBets = await prismaClient.bet.findMany({
      where: { poolId: bet.poolId, predictedWinner: bet.pool.actualWinner! },
      select: { amount: true },
    });
    const totalPool = BigInt(bet.pool.totalPool);
    const platformFee = (totalPool * 5n) / 100n;
    const winnerPool = totalPool - platformFee;
    const winnerTotal = winnerBets.reduce((s, b) => s + BigInt(b.amount), 0n);
    const betAmount = BigInt(bet.amount);
    const payout = winnerTotal > 0n ? (betAmount * winnerPool) / winnerTotal : 0n;
    const payoutOCT = Number(payout) / (10 ** OCT_DECIMALS);

    // Credit payout to prediction balance
    const user = await prismaClient.user.findUnique({
      where: { address: req.user.address },
      select: { predictionBalance: true },
    });
    const currentBalance = BigInt(user?.predictionBalance || '0');
    const newBalance = currentBalance + payout;

    await prismaClient.$transaction([
      prismaClient.bet.update({
        where: { id: betId },
        data: { hasClaimed: true, payout: payout.toString(), claimedAt: new Date() },
      }),
      prismaClient.user.update({
        where: { address: req.user.address },
        data: { predictionBalance: newBalance.toString() },
      }),
    ]);

    res.json({
      success: true,
      data: {
        payout: payout.toString(),
        payoutOCT,
        newBalance: newBalance.toString(),
        newBalanceOCT: Number(newBalance) / (10 ** OCT_DECIMALS),
      },
      message: `Payout: ${payoutOCT.toFixed(2)} OCT credited to your prediction balance`,
    });
  })
);

export default router;
