/**
 * Broadcast Service
 *
 * Singleton service for broadcasting game events to WebSocket clients.
 * Handles:
 * - Game state broadcasts (60 FPS)
 * - Lobby updates
 * - Game lifecycle events (start, end)
 * - Player events (join, leave)
 */

import { Server as SocketServer } from 'socket.io';
import logger from '../config/logger';
import type { GameState } from '../types/game';

export class BroadcastService {
  private static instance: BroadcastService;
  private io: SocketServer | null = null;

  private constructor() {
    logger.info('📡 BroadcastService initialized');
  }

  public static getInstance(): BroadcastService {
    if (!BroadcastService.instance) {
      BroadcastService.instance = new BroadcastService();
    }
    return BroadcastService.instance;
  }

  /**
   * Set Socket.io instance (called after server initialization)
   */
  public setIO(io: SocketServer): void {
    this.io = io;
    logger.info('✅ Socket.io instance set for BroadcastService');
  }

  /**
   * Get Socket.io instance from Express app
   */
  private getIO(): SocketServer {
    if (!this.io) {
      throw new Error('Socket.io not initialized. Call setIO() first or use app.get("io")');
    }
    return this.io;
  }

  /**
   * Broadcast game state to all players in room (called every tick)
   */
  public async broadcastGameState(roomUid: string, state: GameState): Promise<void> {
    try {
      const io = this.getIO();

      // Broadcast to all sockets in the room
      io.to(roomUid).emit('GAME_STATE', state);

      // Log every 60 ticks (1 second at 60 FPS)
      if (state.gameTime % 1000 < 20) {
        logger.debug(`📡 Broadcasted game state for room ${roomUid} (${state.gameTime}ms)`);
      }
    } catch (error) {
      logger.error(`Error broadcasting game state for room ${roomUid}:`, error);
    }
  }

  /**
   * Broadcast lobby update
   */
  public async broadcastLobbyUpdate(roomUid: string): Promise<void> {
    try {
      // This is handled by RoomService.broadcastLobbyUpdate()
      // We keep this method for consistency with GameEngineService calls
      logger.debug(`📡 Lobby update requested for room ${roomUid}`);
    } catch (error) {
      logger.error(`Error broadcasting lobby update for room ${roomUid}:`, error);
    }
  }

  /**
   * Broadcast game start event
   */
  public async broadcastGameStart(roomUid: string): Promise<void> {
    try {
      const io = this.getIO();

      io.to(roomUid).emit('GAME_START', {
        roomUid,
        timestamp: Date.now(),
      });

      logger.info(`🏁 Broadcasted GAME_START for room ${roomUid}`);
    } catch (error) {
      logger.error(`Error broadcasting game start for room ${roomUid}:`, error);
    }
  }

  /**
   * Broadcast game end event with results
   */
  public async broadcastGameEnd(roomUid: string, result: any): Promise<void> {
    try {
      const io = this.getIO();

      io.to(roomUid).emit('GAME_END', {
        roomUid,
        winner: result.winner,
        rankings: result.rankings,
        signature: result.signature,
        message: result.message,
        nonce: result.nonce,
        timestamp: Date.now(),
      });

      logger.info(`🏆 Broadcasted GAME_END for room ${roomUid}, winner: ${result.winner}`);
    } catch (error) {
      logger.error(`Error broadcasting game end for room ${roomUid}:`, error);
    }
  }

  /**
   * Broadcast player joined event
   */
  public async broadcastPlayerJoined(roomUid: string, playerAddress: string): Promise<void> {
    try {
      const io = this.getIO();

      io.to(roomUid).emit('PLAYER_JOINED', {
        playerAddress,
        timestamp: Date.now(),
      });

      logger.info(`👤 Broadcasted PLAYER_JOINED for room ${roomUid}: ${playerAddress}`);
    } catch (error) {
      logger.error(`Error broadcasting player joined for room ${roomUid}:`, error);
    }
  }

  /**
   * Broadcast player left event
   */
  public async broadcastPlayerLeft(roomUid: string, playerId: string, reason?: string): Promise<void> {
    try {
      const io = this.getIO();

      io.to(roomUid).emit('PLAYER_LEFT', {
        playerId,
        reason: reason || 'unknown',
        timestamp: Date.now(),
      });

      logger.info(`👋 Broadcasted PLAYER_LEFT for room ${roomUid}: ${playerId}`);
    } catch (error) {
      logger.error(`Error broadcasting player left for room ${roomUid}:`, error);
    }
  }

  /**
   * Broadcast custom event to room
   */
  public async broadcast(roomUid: string, event: string, data: any): Promise<void> {
    try {
      const io = this.getIO();
      io.to(roomUid).emit(event, data);

      logger.debug(`📡 Broadcasted ${event} to room ${roomUid}`);
    } catch (error) {
      logger.error(`Error broadcasting ${event} to room ${roomUid}:`, error);
    }
  }

  /**
   * Get number of sockets in a room
   */
  public async getRoomSize(roomUid: string): Promise<number> {
    try {
      const io = this.getIO();
      const room = io.sockets.adapter.rooms.get(roomUid);
      return room?.size || 0;
    } catch (error) {
      logger.error(`Error getting room size for ${roomUid}:`, error);
      return 0;
    }
  }
}

// Export singleton instance
export const broadcastService = BroadcastService.getInstance();
