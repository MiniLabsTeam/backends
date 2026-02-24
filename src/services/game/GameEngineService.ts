/**
 * GameEngineService.ts
 *
 * Main orchestrator for game engine.
 * Manages game lifecycle, coordinates sub-components, and integrates with database/Redis.
 *
 * Singleton pattern - use getInstance() to access.
 */

import { prismaClient } from '../../config/database';
import { cache } from '../../config/redis';
import { signingService } from '../signing/SigningService';
import { questService } from '../quest/QuestService';
import { broadcastService } from '../../websocket/BroadcastService';
import logger from '../../config/logger';
import {
  GameState,
  EndlessRaceState,
  PlayerState,
  PlayerInput,
} from '../../types/game';
import { EndlessRaceEngine } from './EndlessRaceEngine';

const TICK_RATE = 20; // 20 FPS — stable for lane-based game
const TICK_INTERVAL = 1000 / TICK_RATE; // 50ms
const PVP_ENTRY_BET_MIST = BigInt(2_000_000_000); // 2 OCT in MIST
const BETTING_PERIOD_SECONDS = 60; // 60-second betting window
const PLATFORM_FEE_PERCENT = 5; // 5% platform fee

interface ActiveGame {
  roomId: string;
  gameMode: string;
  interval: NodeJS.Timeout;
  engine: EndlessRaceEngine;
  lastTickTime: number;
  state: EndlessRaceState | null; // In-memory state (primary, no Redis dependency)
  inputQueue: PlayerInput[];       // In-memory input queue
}

export class GameEngineService {
  private static instance: GameEngineService;
  private activeGames: Map<string, ActiveGame> = new Map();

  // Track betting period timers so they can be cancelled
  private bettingTimers: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {
    logger.info('🎮 GameEngineService initialized');
  }

  public static getInstance(): GameEngineService {
    if (!GameEngineService.instance) {
      GameEngineService.instance = new GameEngineService();
    }
    return GameEngineService.instance;
  }

  /**
   * Create a new game room
   * For PvP rooms: checks balance and places auto-bet of 2 OCT on creator
   */
  public async createRoom(
    gameMode: string,
    creatorAddress: string,
    maxPlayers: number,
    entryFee: string,
    deadline: string
  ): Promise<any> {
    try {
      const isPvP = !gameMode.endsWith('_VS_AI');

      // For PvP: check creator has enough prediction balance for entry bet
      if (isPvP) {
        const user = await prismaClient.user.findUnique({
          where: { address: creatorAddress },
          select: { predictionBalance: true },
        });
        const balance = BigInt(user?.predictionBalance || '0');
        if (balance < PVP_ENTRY_BET_MIST) {
          throw new Error('Insufficient prediction balance. Need at least 2 OCT to create a PvP room. Deposit on the Prediction page first.');
        }
      }

      const roomUid = `ROOM_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const roomHash = `HASH_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const room = await prismaClient.room.create({
        data: {
          roomUid,
          roomHash,
          gameMode,
          status: 'WAITING',
          maxPlayers,
          entryFee,
          deadline,
        },
      });

      // For PvP: place auto-bet on creator
      if (isPvP) {
        await this._placePvPEntryBet(room.id, room.roomUid, creatorAddress);
      }

      logger.info(`Room created: ${room.roomUid} (${gameMode})${isPvP ? ' [PvP auto-bet placed]' : ''}`);
      return room;
    } catch (error) {
      logger.error(`Failed to create room: ${error}`);
      throw error;
    }
  }

  /**
   * Create a room with an AI opponent
   */
  public async createRoomWithAI(
    creatorAddress: string,
    _carUid: string,
    entryFee: string,
    deadline: string
  ): Promise<any> {
    // Use distinct gameMode to mark AI room — no Redis dependency
    const room = await this.createRoom('ENDLESS_RACE_VS_AI', creatorAddress, 2, entryFee, deadline);
    return room;
  }

  /**
   * Place PvP entry bet: deduct 2 OCT from predictionBalance, create pool + bet
   */
  private async _placePvPEntryBet(roomId: string, roomUid: string, playerAddress: string): Promise<any> {
    // Guard: skip if this player already placed an entry bet in this pool
    const existingBet = await prismaClient.predictionPool.findUnique({
      where: { roomUid },
      include: { bets: { where: { bettor: playerAddress }, take: 1 } },
    });
    if (existingBet && existingBet.bets.length > 0) {
      logger.info(`🎰 PvP entry bet: ${playerAddress} already has bet in ${roomUid}, skipping`);
      return existingBet;
    }

    const user = await prismaClient.user.findUnique({
      where: { address: playerAddress },
      select: { predictionBalance: true },
    });
    const balance = BigInt(user?.predictionBalance || '0');
    if (balance < PVP_ENTRY_BET_MIST) {
      throw new Error('Insufficient prediction balance for PvP entry bet (2 OCT required).');
    }

    const newBalance = balance - PVP_ENTRY_BET_MIST;

    // Find or create prediction pool, always adding entry bet to totalPool
    const existingPool = await prismaClient.predictionPool.findUnique({ where: { roomUid } });

    let pool;
    if (existingPool) {
      // Pool already exists (second player joining) — add entry bet to totalPool
      const updatedTotal = BigInt(existingPool.totalPool) + PVP_ENTRY_BET_MIST;
      pool = await prismaClient.predictionPool.update({
        where: { roomUid },
        data: { totalPool: updatedTotal.toString() },
      });
    } else {
      // First player — create pool with initial entry bet
      pool = await prismaClient.predictionPool.create({
        data: {
          roomId,
          roomUid,
          totalPool: PVP_ENTRY_BET_MIST.toString(),
        },
      });
    }

    // Deduct balance + create bet atomically
    await prismaClient.$transaction([
      prismaClient.user.update({
        where: { address: playerAddress },
        data: { predictionBalance: newBalance.toString() },
      }),
      prismaClient.bet.create({
        data: {
          poolId: pool.id,
          bettor: playerAddress,
          predictedWinner: playerAddress, // Bet on self
          amount: PVP_ENTRY_BET_MIST.toString(),
        },
      }),
    ]);

    logger.info(`🎰 PvP entry bet: ${playerAddress} bet 2 OCT on self in room ${roomUid}`);

    // Re-fetch pool with updated total
    return prismaClient.predictionPool.findUnique({ where: { roomUid } });
  }

  /**
   * Start 60-second betting period after both PvP players join
   */
  public async startBettingPeriod(roomUid: string): Promise<void> {
    const bettingEndsAt = new Date(Date.now() + BETTING_PERIOD_SECONDS * 1000);

    await prismaClient.room.update({
      where: { roomUid },
      data: { status: 'BETTING', bettingEndsAt },
    });

    const pool = await prismaClient.predictionPool.findUnique({
      where: { roomUid },
      include: { bets: true },
    });

    await broadcastService.broadcastBettingStart(roomUid, {
      bettingEndsAt: bettingEndsAt.toISOString(),
      pool,
    });

    logger.info(`🎰 Betting period started for room ${roomUid} — ends at ${bettingEndsAt.toISOString()}`);

    // Countdown timer: broadcast every second
    let secondsLeft = BETTING_PERIOD_SECONDS;
    const timer = setInterval(async () => {
      secondsLeft--;
      if (secondsLeft <= 0) {
        clearInterval(timer);
        this.bettingTimers.delete(roomUid);
        // Betting period over → start race countdown
        logger.info(`🎰 Betting period ended for room ${roomUid}, starting race countdown`);
        await this.startCountdown(roomUid);
      } else {
        await broadcastService.broadcastBettingCountdown(roomUid, secondsLeft);
      }
    }, 1000);

    this.bettingTimers.set(roomUid, timer);
  }

  /**
   * Cancel a room — refund all bets to predictionBalance
   */
  public async cancelRoom(roomUid: string, requesterAddress: string): Promise<void> {
    const room = await prismaClient.room.findUnique({
      where: { roomUid },
      include: { players: true },
    });

    if (!room) throw new Error('Room not found');
    if (!['WAITING', 'BETTING'].includes(room.status)) {
      throw new Error('Room can only be cancelled during WAITING or BETTING phase');
    }

    // Only room creator (first player) can cancel
    const creator = room.players.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];
    if (!creator || creator.playerAddress !== requesterAddress) {
      throw new Error('Only the room creator can cancel the room');
    }

    // Stop betting timer if active
    const timer = this.bettingTimers.get(roomUid);
    if (timer) {
      clearInterval(timer);
      this.bettingTimers.delete(roomUid);
    }

    // Refund all bets
    const pool = await prismaClient.predictionPool.findUnique({
      where: { roomUid },
      include: { bets: true },
    });

    if (pool && pool.bets.length > 0) {
      // Group bets by bettor to calculate total refund per user
      const refundMap = new Map<string, bigint>();
      for (const bet of pool.bets) {
        const current = refundMap.get(bet.bettor) || 0n;
        refundMap.set(bet.bettor, current + BigInt(bet.amount));
      }

      // Refund each user
      const refundOps = [];
      for (const [bettor, refundAmount] of refundMap) {
        const user = await prismaClient.user.findUnique({
          where: { address: bettor },
          select: { predictionBalance: true },
        });
        const currentBalance = BigInt(user?.predictionBalance || '0');
        refundOps.push(
          prismaClient.user.update({
            where: { address: bettor },
            data: { predictionBalance: (currentBalance + refundAmount).toString() },
          })
        );
      }

      // Delete bets, pool, update room status — all in one transaction
      await prismaClient.$transaction([
        ...refundOps,
        prismaClient.bet.deleteMany({ where: { poolId: pool.id } }),
        prismaClient.predictionPool.delete({ where: { id: pool.id } }),
        prismaClient.room.update({
          where: { roomUid },
          data: { status: 'CANCELLED' },
        }),
      ]);
    } else {
      await prismaClient.room.update({
        where: { roomUid },
        data: { status: 'CANCELLED' },
      });
    }

    await broadcastService.broadcastRoomCancelled(roomUid);
    logger.info(`❌ Room ${roomUid} cancelled by ${requesterAddress}, all bets refunded`);
  }

  /**
   * Join a room as AI bot (bypasses maxPlayers check)
   */
  public async joinRoomForAI(roomUid: string, playerAddress: string, carUid: string): Promise<any> {
    const room = await prismaClient.room.findUnique({
      where: { roomUid },
      include: { players: true },
    });
    if (!room) throw new Error('Room not found');
    if (room.status !== 'WAITING') throw new Error('Room is not accepting players');

    const car = await this.getPlayerCarStats(carUid);
    const roomPlayer = await prismaClient.roomPlayer.create({
      data: { roomId: room.id, playerAddress, carUid },
    });
    await broadcastService.broadcastPlayerJoined(roomUid, playerAddress);
    return { roomPlayer, carStats: car };
  }

  /**
   * Join a game room
   * For PvP: checks balance, places auto-bet, triggers betting period when full
   */
  public async joinRoom(
    roomUid: string,
    playerAddress: string,
    carUid: string
  ): Promise<any> {
    try {
      // Check if room exists and is joinable
      const room = await prismaClient.room.findUnique({
        where: { roomUid: roomUid },
        include: { players: true },
      });

      if (!room) {
        throw new Error('Room not found');
      }

      if (room.status !== 'WAITING') {
        throw new Error('Room is not accepting players');
      }

      if (room.players.length >= room.maxPlayers) {
        throw new Error('Room is full');
      }

      const isPvP = !room.gameMode.endsWith('_VS_AI');

      // For PvP: check balance before joining
      if (isPvP) {
        const user = await prismaClient.user.findUnique({
          where: { address: playerAddress },
          select: { predictionBalance: true },
        });
        const balance = BigInt(user?.predictionBalance || '0');
        if (balance < PVP_ENTRY_BET_MIST) {
          throw new Error('Insufficient prediction balance. Need at least 2 OCT to join a PvP room. Deposit on the Prediction page first.');
        }
      }

      // Get car stats
      const car = await this.getPlayerCarStats(carUid);

      // Add player to room (skip if already joined, e.g. via VS AI HTTP pre-join)
      let roomPlayer = await prismaClient.roomPlayer.findUnique({
        where: { roomId_playerAddress: { roomId: room.id, playerAddress } },
      });
      if (!roomPlayer) {
        roomPlayer = await prismaClient.roomPlayer.create({
          data: {
            roomId: room.id,
            playerAddress,
            carUid,
          },
        });
      }

      // For PvP: place auto-bet on self
      if (isPvP) {
        await this._placePvPEntryBet(room.id, roomUid, playerAddress);
      }

      // Broadcast player joined event
      await broadcastService.broadcastPlayerJoined(roomUid, playerAddress);

      // For PvP: if room is now full (2 players), start betting period
      if (isPvP) {
        const updatedRoom = await prismaClient.room.findUnique({
          where: { roomUid },
          include: { players: true },
        });
        if (updatedRoom && updatedRoom.players.length >= updatedRoom.maxPlayers) {
          await this.startBettingPeriod(roomUid);
        }
      }

      logger.info(`Player ${playerAddress} joined room ${roomUid}${isPvP ? ' [PvP auto-bet placed]' : ''}`);
      return { roomPlayer, carStats: car };
    } catch (error) {
      logger.error(`Failed to join room: ${error}`);
      throw error;
    }
  }

  /**
   * Mark player as ready
   * PvP rooms: rejected (auto-start after betting period)
   * AI rooms: keep existing behavior
   */
  public async markPlayerReady(roomUid: string, playerAddress: string): Promise<void> {
    const room = await prismaClient.room.findUnique({
      where: { roomUid: roomUid },
      include: { players: true },
    });

    if (!room) {
      throw new Error('Room not found');
    }

    // PvP rooms auto-start after betting period — no manual ready
    if (!room.gameMode.endsWith('_VS_AI')) {
      throw new Error('PvP games auto-start after the betting period. No manual ready required.');
    }

    // Find the room player
    const roomPlayer = room.players.find((p) => p.playerAddress === playerAddress);
    if (!roomPlayer) {
      throw new Error('Player not in room');
    }

    // Update player approval status
    await prismaClient.roomPlayer.update({
      where: {
        roomId_playerAddress: {
          roomId: room.id,
          playerAddress,
        },
      },
      data: { isApproved: true },
    });

    // Broadcast lobby update to all players
    await broadcastService.broadcastLobbyUpdate(roomUid);

    // AI room: start immediately when player is ready
    await this.startCountdown(roomUid);
  }

  /**
   * Start countdown before game starts
   */
  private async startCountdown(roomUid: string): Promise<void> {
    await prismaClient.room.update({
      where: { roomUid: roomUid },
      data: { status: 'COUNTDOWN' },
    });

    logger.info(`Countdown started for room ${roomUid}`);

    // After 5 seconds, start the game
    setTimeout(() => {
      this.startGame(roomUid).catch((error) => {
        logger.error(`Failed to start game: ${error}`);
      });
    }, 5000);
  }

  /**
   * Start the game
   */
  public async startGame(roomUid: string): Promise<void> {
    try {
      const room = await prismaClient.room.findUnique({
        where: { roomUid: roomUid },
        include: {
          players: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!room) {
        throw new Error('Room not found');
      }

      // Update room status
      await prismaClient.room.update({
        where: { roomUid: roomUid },
        data: { status: 'RACING' },
      });

      // PvP prediction pool is already created during createRoom/joinRoom
      // No need to create it here

      // Initialize player states
      const playerStates: PlayerState[] = await Promise.all(
        room.players.map(async (rp) => {
          const carStats = await this.getPlayerCarStats(rp.carUid);
          return {
            playerId: rp.playerAddress,
            carUid: rp.carUid,
            position: { x: 0, y: 0, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            rotation: 0,
            speed: 0,
            stats: carStats,
            checkpoints: 0,
            isFinished: false,
          };
        })
      );

      // If AI room, inject bot player
      if (room.gameMode.endsWith('_VS_AI')) {
        playerStates.push({
          playerId: 'BOT_AI_1',
          carUid: 'bot_car',
          position: { x: 0, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          rotation: 0,
          speed: 0,
          stats: { speed: 55, acceleration: 55, handling: 55, drift: 50 },
          checkpoints: 0,
          isFinished: false,
        });
        await cache.set(`game:room:${roomUid}:bot_tick`, 0, 7200);
      }

      // Create game engine based on mode
      let engine: EndlessRaceEngine;
      if (room.gameMode === 'ENDLESS_RACE' || room.gameMode === 'ENDLESS_RACE_VS_AI') {
        engine = new EndlessRaceEngine();
      } else {
        throw new Error(`Unsupported game mode: ${room.gameMode}`);
      }

      // Initialize game state
      const initialState = engine.initializeState(roomUid, playerStates);

      // Save initial state to Redis
      await cache.set(`game:room:${roomUid}:state`, initialState, 3600);

      // Broadcast game start event to all players
      await broadcastService.broadcastGameStart(roomUid);

      const activeGame: ActiveGame = {
        roomId: roomUid,
        gameMode: room.gameMode,
        interval: null as any,
        engine,
        lastTickTime: Date.now(),
        state: initialState,
        inputQueue: [],
      };
      this.activeGames.set(roomUid, activeGame);

      // Use recursive setTimeout to prevent concurrent ticks
      const scheduleNextTick = () => {
        activeGame.interval = setTimeout(async () => {
          if (!this.activeGames.has(roomUid)) return; // Game ended
          await this.gameTick(roomUid, engine);
          scheduleNextTick();
        }, TICK_INTERVAL);
      };
      scheduleNextTick();

      logger.info(`Game started: ${roomUid} (${room.gameMode})`);
    } catch (error) {
      logger.error(`Failed to start game: ${error}`);
      throw error;
    }
  }

  /**
   * Game loop tick
   */
  private async gameTick(roomId: string, engine: EndlessRaceEngine): Promise<void> {
    try {
      const activeGame = this.activeGames.get(roomId);
      if (!activeGame) return;

      // Get current state from memory (primary) — Redis is a secondary sync only
      const state = activeGame.state ?? await cache.get<EndlessRaceState>(`game:room:${roomId}:state`);
      if (!state) {
        logger.error(`Game state not found for room ${roomId}`);
        return;
      }

      // Calculate delta time
      const currentTime = Date.now();
      const deltaTime = currentTime - activeGame.lastTickTime;
      activeGame.lastTickTime = currentTime;

      // Process pending inputs from in-memory queue
      const pendingInputs = activeGame.inputQueue.splice(0);
      for (const input of pendingInputs) {
        engine.processInput(state, input);
      }

      // Generate AI bot inputs (detect by BOT_AI_1 presence in state)
      const hasAI = state.players.some((p: any) => p.playerId === 'BOT_AI_1');
      if (hasAI) {
        const botTick = ((await cache.get<number>(`game:room:${roomId}:bot_tick`)) ?? 0) + 1;
        await cache.set(`game:room:${roomId}:bot_tick`, botTick, 7200);
        // Every ~120 ticks (2s), make bot decision
        if (botTick % 120 === 0) {
          const botPlayer = state.players.find((p: any) => p.playerId === 'BOT_AI_1');
          if (botPlayer && !botPlayer.isFinished) {
            const actions = ['TURN_LEFT', 'TURN_RIGHT', 'TURN_LEFT', 'TURN_RIGHT', null, null, null];
            const chosen = actions[Math.floor(Math.random() * actions.length)];
            if (chosen) {
              engine.processInput(state, {
                playerId: 'BOT_AI_1',
                action: chosen as any,
                timestamp: Date.now(),
              });
            }
          }
        }
      }

      // Update game state
      const updatedState = engine.update(state, deltaTime);

      // Check if game is over
      if (engine.isGameOver(updatedState)) {
        await this.endGame(roomId, engine, updatedState);
        return;
      }

      // Save updated state to memory (always) and Redis (best-effort)
      activeGame.state = updatedState;
      cache.set(`game:room:${roomId}:state`, updatedState, 3600).catch(() => { });

      // Broadcast game state to all players (60 FPS)
      await broadcastService.broadcastGameState(roomId, updatedState);
    } catch (error) {
      logger.error(`Game tick error for room ${roomId}: ${error}`);
    }
  }

  /**
   * Process player input
   */
  public async processPlayerInput(
    roomId: string,
    playerId: string,
    action: string
  ): Promise<void> {
    const input: PlayerInput = {
      playerId,
      action: action as any,
      timestamp: Date.now(),
    };

    // Push to in-memory queue (primary — no Redis dependency)
    const activeGame = this.activeGames.get(roomId);
    if (activeGame) {
      activeGame.inputQueue.push(input);
    }
  }

  /**
   * Get current game state
   */
  public async getGameState(roomId: string): Promise<GameState | null> {
    const activeGame = this.activeGames.get(roomId);
    if (activeGame?.state) return activeGame.state as any;
    return await cache.get<GameState>(`game:room:${roomId}:state`);
  }

  /**
   * End the game
   */
  private async endGame(
    roomId: string,
    engine: EndlessRaceEngine,
    state: EndlessRaceState
  ): Promise<void> {
    try {
      logger.info(`Ending game: ${roomId}`);

      // Stop game loop
      const activeGame = this.activeGames.get(roomId);
      if (activeGame) {
        clearTimeout(activeGame.interval);
        this.activeGames.delete(roomId);
      }

      // Calculate winner
      const winner = engine.calculateWinner(state);

      // Get room info
      const room = await prismaClient.room.findUnique({
        where: { roomUid: roomId },
      });

      if (!room) {
        throw new Error('Room not found');
      }

      // Detect if this is a vs-AI game (has bot players)
      const isAIGame = state.players.some((p: any) => p.playerId.startsWith('BOT_AI'));

      // Prepare rankings
      const rankings = state.players
        .sort((a, b) => (a.rank || 0) - (b.rank || 0))
        .map((p) => ({
          rank: p.rank || 0,
          playerId: p.playerId,
          distance: p.checkpoints || 0,
          obstaclesHit: 0, // TODO: track this
          powerUpsCollected: 0, // TODO: track this
          finalTime: p.finishTime || state.gameTime,
        }));

      let signature = {
        signature: '0x' + '00'.repeat(64),
        message: '0x' + '00'.repeat(32),
        nonce: Date.now().toString(),
      };

      if (!isAIGame) {
        // Sign race result for on-chain validation (PvP only)
        try {
          signature = await signingService.signRaceResult(
            roomId,
            winner.playerId,
            (winner.finishTime || state.gameTime).toString()
          );
        } catch (signError) {
          logger.warn(`⚠️  Signing failed, using dummy signature: ${signError}`);
        }

        // Save race result to database (PvP only)
        await prismaClient.race.create({
          data: {
            roomId: room.id,
            roomUid: roomId,
            winner: winner.playerId,
            finishTime: (winner.finishTime || state.gameTime).toString(),
            prizePool: room.entryFee,
            raceData: JSON.stringify({
              mode: 'ENDLESS_RACE',
              duration: state.gameTime,
              finalStandings: rankings,
              trackSections: state.trackSection,
              totalObstacles: state.obstacles.length,
              totalPowerUps: state.powerUps.length,
            }),
          },
        });

        // Settle prediction pool with 5% platform fee
        try {
          const pool = await prismaClient.predictionPool.findUnique({
            where: { roomUid: roomId },
            include: { bets: true },
          });

          if (pool && !pool.isSettled) {
            const totalPool = BigInt(pool.totalPool);
            const platformFee = (totalPool * BigInt(PLATFORM_FEE_PERCENT)) / 100n;
            const winnerPool = totalPool - platformFee;

            // Calculate total bet on the winner
            const winnerBetsTotal = pool.bets
              .filter(b => b.predictedWinner === winner.playerId)
              .reduce((sum, b) => sum + BigInt(b.amount), 0n);

            // Credit each winning bettor proportionally
            if (winnerBetsTotal > 0n) {
              const creditOps = [];
              for (const bet of pool.bets) {
                if (bet.predictedWinner === winner.playerId) {
                  const betAmount = BigInt(bet.amount);
                  const payout = (betAmount * winnerPool) / winnerBetsTotal;
                  // Credit payout to bettor's predictionBalance
                  const betUser = await prismaClient.user.findUnique({
                    where: { address: bet.bettor },
                    select: { predictionBalance: true },
                  });
                  const currentBal = BigInt(betUser?.predictionBalance || '0');
                  creditOps.push(
                    prismaClient.user.update({
                      where: { address: bet.bettor },
                      data: { predictionBalance: (currentBal + payout).toString() },
                    })
                  );
                  creditOps.push(
                    prismaClient.bet.update({
                      where: { id: bet.id },
                      data: { payout: payout.toString(), hasClaimed: true, claimedAt: new Date() },
                    })
                  );
                }
              }

              await prismaClient.$transaction([
                ...creditOps,
                prismaClient.predictionPool.update({
                  where: { id: pool.id },
                  data: { isSettled: true, actualWinner: winner.playerId, settledAt: new Date() },
                }),
              ]);

              logger.info(`🏆 Pool settled: ${Number(winnerPool) / 1e9} OCT to winners, ${Number(platformFee) / 1e9} OCT platform fee`);
            } else {
              // No one bet on the winner — refund all bets
              const refundOps = [];
              for (const bet of pool.bets) {
                const betUser = await prismaClient.user.findUnique({
                  where: { address: bet.bettor },
                  select: { predictionBalance: true },
                });
                const currentBal = BigInt(betUser?.predictionBalance || '0');
                refundOps.push(
                  prismaClient.user.update({
                    where: { address: bet.bettor },
                    data: { predictionBalance: (currentBal + BigInt(bet.amount)).toString() },
                  })
                );
              }
              await prismaClient.$transaction([
                ...refundOps,
                prismaClient.predictionPool.update({
                  where: { id: pool.id },
                  data: { isSettled: true, actualWinner: winner.playerId, settledAt: new Date() },
                }),
              ]);
              logger.info(`🏆 No bets on winner — all bets refunded`);
            }
          }
        } catch (err: any) {
          logger.warn(`Prediction settle failed: ${err.message}`);
        }
      } else {
        logger.info(`🤖 AI game ${roomId} — skipping DB race save & blockchain validation`);
      }

      // Update room status (always)
      await prismaClient.room.update({
        where: { roomUid: roomId },
        data: { status: 'FINISHED' },
      });

      // Update quest progress for all real players (fire-and-forget)
      const realPlayers = state.players.filter((p: any) => p.playerId.startsWith('BOT_AI') === false);
      for (const p of realPlayers) {
        const addr = p.playerId;
        const distCovered = Math.floor(p.position?.z ?? 0);
        questService.updateProgress(addr, 'RACE_COMPLETE', 1);
        if (distCovered > 0) questService.updateProgress(addr, 'DISTANCE_COVERED', distCovered);
        if (addr === winner.playerId) questService.updateProgress(addr, 'RACE_WIN', 1);
      }

      // Save final result to Redis (for clients to fetch)
      const result = {
        winner: winner.playerId,
        rankings,
        signature: signature.signature,
        message: signature.message,
        nonce: signature.nonce,
      };
      await cache.set(
        `game:room:${roomId}:result`,
        result,
        3600
      );

      // Broadcast game end event with results to all players
      await broadcastService.broadcastGameEnd(roomId, result);

      logger.info(`Game ended: ${roomId}, Winner: ${winner.playerId}`);
    } catch (error) {
      logger.error(`Failed to end game: ${error}`);
      throw error;
    }
  }

  /**
   * Get game result
   */
  public async getGameResult(roomId: string): Promise<any | null> {
    return await cache.get(`game:room:${roomId}:result`);
  }

  /**
   * Get player car stats from database
   */
  private async getPlayerCarStats(carUid: string): Promise<{
    speed: number;
    acceleration: number;
    handling: number;
    drift: number;
  }> {
    const car = await prismaClient.car.findUnique({
      where: { uid: carUid },
      include: {
        equippedParts: {
          include: {
            part: true,
          },
        },
      },
    });

    if (!car) {
      throw new Error(`Car not found: ${carUid}`);
    }

    // Calculate final stats (base + equipped bonuses)
    const finalStats = {
      speed: car.baseSpeed,
      acceleration: car.baseAcceleration,
      handling: car.baseHandling,
      drift: car.baseDrift,
    };

    for (const equipped of car.equippedParts) {
      finalStats.speed += equipped.part.bonusSpeed;
      finalStats.acceleration += equipped.part.bonusAcceleration;
      finalStats.handling += equipped.part.bonusHandling;
      finalStats.drift += equipped.part.bonusDrift;
    }

    return finalStats;
  }

  /**
   * Stop a game (force stop)
   */
  public async stopGame(roomId: string): Promise<void> {
    const activeGame = this.activeGames.get(roomId);
    if (activeGame) {
      clearTimeout(activeGame.interval);
      this.activeGames.delete(roomId);

      await prismaClient.room.update({
        where: { roomUid: roomId },
        data: { status: 'FINISHED' },
      });

      logger.info(`Game stopped: ${roomId}`);
    }
  }

  /**
   * Get all active games
   */
  public getActiveGames(): string[] {
    return Array.from(this.activeGames.keys());
  }
}

// Export singleton instance
export const gameEngineService = GameEngineService.getInstance();
