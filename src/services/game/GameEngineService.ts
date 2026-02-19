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
import { broadcastService } from '../../websocket/BroadcastService';
import logger from '../../config/logger';
import {
  GameState,
  EndlessRaceState,
  PlayerState,
  PlayerInput,
} from '../../types/game';
import { EndlessRaceEngine } from './EndlessRaceEngine';

const TICK_RATE = 60; // 60 FPS
const TICK_INTERVAL = 1000 / TICK_RATE; // ~16.67ms

interface ActiveGame {
  roomId: string;
  gameMode: string;
  interval: NodeJS.Timeout;
  engine: EndlessRaceEngine;
  lastTickTime: number;
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

      // Add player to room
      const roomPlayer = await prismaClient.roomPlayer.create({
        data: {
          roomId: room.id,
          playerAddress,
          carUid,
        },
      });

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

      // Create game engine based on mode
      let engine: EndlessRaceEngine;
      if (room.gameMode === 'ENDLESS_RACE') {
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

      // Start game loop
      const gameLoop = setInterval(async () => {
        await this.gameTick(roomUid, engine);
      }, TICK_INTERVAL);

      this.activeGames.set(roomUid, {
        roomId: roomUid,
        gameMode: room.gameMode,
        interval: gameLoop,
        engine,
        lastTickTime: Date.now(),
      });

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

      // Get current state from Redis
      const state = await cache.get<EndlessRaceState>(`game:room:${roomId}:state`);
      if (!state) {
        logger.error(`Game state not found for room ${roomId}`);
        return;
      }

      // Calculate delta time
      const currentTime = Date.now();
      const deltaTime = currentTime - activeGame.lastTickTime;
      activeGame.lastTickTime = currentTime;

      // Process pending inputs
      const inputsJson = await cache.lrange(`game:room:${roomId}:inputs`, 0, -1);
      logger.info(`📥 Retrieved ${inputsJson.length} inputs from Redis`);

      for (let inputJson of inputsJson) {
        let inputStr = String(inputJson);
        logger.info(`📦 Raw input: ${inputStr}`);

        try {
          // Check if string is double-encoded (starts and ends with quotes)
          if (inputStr.startsWith('"') && inputStr.endsWith('"')) {
            logger.info(`🔧 Detected double-encoding, unescaping...`);
            // Remove outer quotes
            inputStr = inputStr.slice(1, -1);
            // Unescape inner quotes
            inputStr = inputStr.replace(/\\"/g, '"');
            // Unescape backslashes
            inputStr = inputStr.replace(/\\\\/g, '\\');
            logger.info(`📦 After unescape: ${inputStr}`);
          }

          // Manual string parsing with regex
          const playerIdMatch = inputStr.match(/"playerId":"([^"]+)"/);
          const actionMatch = inputStr.match(/"action":"([^"]+)"/);
          const timestampMatch = inputStr.match(/"timestamp":(\d+)/);

          if (!playerIdMatch || !actionMatch || !timestampMatch) {
            logger.error(`❌ Failed to extract fields from: ${inputStr}`);
            continue;
          }

          const input: PlayerInput = {
            playerId: playerIdMatch[1],
            action: actionMatch[1] as any,
            timestamp: parseInt(timestampMatch[1]),
          };

          logger.info(`✅ Manual parse SUCCESS: playerId=${input.playerId}, action=${input.action}`);
          engine.processInput(state, input);
        } catch (error) {
          logger.error(`❌ Failed to process input: ${error}`, { inputStr });
        }
      }
      // Clear processed inputs
      if (inputsJson.length > 0) {
        await cache.del(`game:room:${roomId}:inputs`);
      }

      // Update game state
      const updatedState = engine.update(state, deltaTime);

      // Check if game is over
      if (engine.isGameOver(updatedState)) {
        await this.endGame(roomId, engine, updatedState);
        return;
      }

      // Save updated state to Redis
      await cache.set(`game:room:${roomId}:state`, updatedState, 3600);

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

    const inputJson = JSON.stringify(input);
    logger.info(`📝 Saving input to Redis: ${inputJson}`);

    // Add input to queue
    await cache.rpush(`game:room:${roomId}:inputs`, inputJson);
  }

  /**
   * Get current game state
   */
  public async getGameState(roomId: string): Promise<GameState | null> {
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
        clearInterval(activeGame.interval);
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

      // Sign race result (use dummy signature for testing if signing fails)
      let signature;
      try {
        signature = await signingService.signRaceResult(
          roomId,
          winner.playerId,
          (winner.finishTime || state.gameTime).toString()
        );
      } catch (signError) {
        logger.warn(`⚠️  Signing failed, using dummy signature for testing: ${signError}`);
        signature = {
          signature: '0x' + '00'.repeat(64),
          message: '0x' + '00'.repeat(32),
          nonce: Date.now().toString(),
        };
      }

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

      // Save race result to database
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

      // Update room status
      await prismaClient.room.update({
        where: { roomUid: roomId },
        data: { status: 'FINISHED' },
      });

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
      clearInterval(activeGame.interval);
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
