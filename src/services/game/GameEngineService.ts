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
   */
  public async createRoom(
    gameMode: string,
    _creatorAddress: string,
    maxPlayers: number,
    entryFee: string,
    deadline: string
  ): Promise<any> {
    try {
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

      logger.info(`Room created: ${room.roomUid} (${gameMode})`);
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

      // Broadcast player joined event
      await broadcastService.broadcastPlayerJoined(roomUid, playerAddress);

      logger.info(`Player ${playerAddress} joined room ${roomUid}`);
      return { roomPlayer, carStats: car };
    } catch (error) {
      logger.error(`Failed to join room: ${error}`);
      throw error;
    }
  }

  /**
   * Mark player as ready
   */
  public async markPlayerReady(roomUid: string, playerAddress: string): Promise<void> {
    // Mark player as approved (since isReady doesn't exist in schema)
    const room = await prismaClient.room.findUnique({
      where: { roomUid: roomUid },
      include: { players: true },
    });

    if (!room) {
      throw new Error('Room not found');
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

    // If AI room (gameMode ends with _VS_AI), start immediately when player is ready
    if (room.gameMode.endsWith('_VS_AI')) {
      await this.startCountdown(roomUid);
      return;
    }

    // Check if all players are approved
    const updatedRoom = await prismaClient.room.findUnique({
      where: { roomUid: roomUid },
      include: { players: true },
    });

    if (updatedRoom && updatedRoom.players.every((p) => p.isApproved) && updatedRoom.players.length === updatedRoom.maxPlayers) {
      await this.startCountdown(roomUid);
    }
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

      // Auto-create a prediction pool for PvP races only (skip AI games)
      if (!room.gameMode.endsWith('_VS_AI')) {
        prismaClient.predictionPool.upsert({
          where: { roomUid: roomUid },
          create: { roomId: room.id, roomUid: roomUid },
          update: {},
        }).catch((err: any) => logger.warn(`Prediction pool upsert failed: ${err.message}`));
      }

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
      cache.set(`game:room:${roomId}:state`, updatedState, 3600).catch(() => {});

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

        // Settle prediction pool (PvP only, fire-and-forget)
        prismaClient.predictionPool.updateMany({
          where: { roomUid: roomId, isSettled: false },
          data: { isSettled: true, actualWinner: winner.playerId, settledAt: new Date() },
        }).catch((err: any) => logger.warn(`Prediction settle failed: ${err.message}`));
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
