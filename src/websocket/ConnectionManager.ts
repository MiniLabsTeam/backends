/**
 * Connection Manager
 *
 * Tracks and manages WebSocket connections:
 * - Maps users to socket IDs
 * - Maps rooms to connected sockets
 * - Handles connection/disconnection lifecycle
 * - Provides connection statistics
 */

import { Server as SocketServer, Socket } from 'socket.io';
import logger from '../config/logger';
import { RoomService } from './RoomService';

interface SocketMetadata {
  userId: string;
  roomId?: string;
  connectedAt: number;
}

interface EndlessSession {
  sessionId: string;
  playerAddress: string;
  username: string;
  socketId: string;
  startedAt: number;
  lastState: any;
}

export class ConnectionManager {
  private io: SocketServer;

  // Active endless race live sessions (static = accessible from routes)
  public static readonly endlessSessions: Map<string, EndlessSession> = new Map();

  public static getActiveSessions(): any[] {
    return Array.from(ConnectionManager.endlessSessions.values()).map(s => ({
      sessionId: s.sessionId,
      playerAddress: s.playerAddress,
      username: s.username,
      startedAt: s.startedAt,
      score: s.lastState?.score || 0,
      distance: s.lastState?.distance || 0,
      speed: Math.round((s.lastState?.speed || 0) * 3.6),
    }));
  }

  // roomId -> Set<socketId>
  private roomConnections: Map<string, Set<string>> = new Map();

  // userId -> socketId (for tracking reconnections)
  private userSockets: Map<string, string> = new Map();

  // socketId -> metadata
  private socketMeta: Map<string, SocketMetadata> = new Map();

  // Pending disconnects (for grace period)
  private pendingDisconnects: Map<string, NodeJS.Timeout> = new Map();

  private readonly DISCONNECT_GRACE_PERIOD = 10000; // 10 seconds

  constructor(io: SocketServer) {
    this.io = io;
  }

  /**
   * Handle new WebSocket connection
   */
  public handleConnection(socket: Socket, roomService: RoomService): void {
    const userId = socket.data.userId;

    // Cancel pending disconnect if user reconnects
    this.cancelPendingDisconnect(userId);

    // Track connection
    this.userSockets.set(userId, socket.id);
    this.socketMeta.set(socket.id, {
      userId,
      connectedAt: Date.now(),
    });

    // Setup event handlers
    this.setupEventHandlers(socket, roomService);

    logger.info(`✅ Connection tracked: ${userId} -> ${socket.id}`);
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(socket: Socket, roomService: RoomService): void {
    const userId = socket.data.userId;

    // Player join room
    socket.on('PLAYER_JOIN', async (data, callback) => {
      try {
        await roomService.handlePlayerJoin(socket, data);
        this.addSocketToRoom(socket.id, data.roomUid);
        callback?.({ success: true });
      } catch (error: any) {
        logger.error(`Error in PLAYER_JOIN: ${error.message}`);
        callback?.({ success: false, message: error.message });
        socket.emit('ERROR', { message: error.message });
      }
    });

    // Player ready
    socket.on('PLAYER_READY', async (data, callback) => {
      try {
        await roomService.handlePlayerReady(socket, data);
        callback?.({ success: true });
      } catch (error: any) {
        logger.error(`Error in PLAYER_READY: ${error.message}`);
        callback?.({ success: false, message: error.message });
        socket.emit('ERROR', { message: error.message });
      }
    });

    // Player input
    socket.on('PLAYER_INPUT', async (data, callback) => {
      try {
        await roomService.handlePlayerInput(socket, data);
        callback?.({ success: true });
      } catch (error: any) {
        logger.error(`Error in PLAYER_INPUT: ${error.message}`);
        callback?.({ success: false, message: error.message });
      }
    });

    // Get room state
    socket.on('GET_ROOM_STATE', async (data, callback) => {
      try {
        const state = await roomService.handleGetRoomState(socket, data);
        callback?.({ success: true, data: state });
        socket.emit('LOBBY_UPDATE', state);
      } catch (error: any) {
        logger.error(`Error in GET_ROOM_STATE: ${error.message}`);
        callback?.({ success: false, message: error.message });
      }
    });

    // Player leave room
    socket.on('PLAYER_LEAVE', async (data, callback) => {
      try {
        await roomService.handlePlayerLeave(socket, data);
        this.removeSocketFromRoom(socket.id, data.roomUid);
        callback?.({ success: true });
      } catch (error: any) {
        logger.error(`Error in PLAYER_LEAVE: ${error.message}`);
        callback?.({ success: false, message: error.message });
      }
    });

    // Room cancel (creator only)
    socket.on('ROOM_CANCEL', async (data, callback) => {
      try {
        const { roomUid } = data;
        const { gameEngineService } = await import('../services/game/GameEngineService');
        await gameEngineService.cancelRoom(roomUid, userId);
        callback?.({ success: true });
      } catch (error: any) {
        logger.error(`Error in ROOM_CANCEL: ${error.message}`);
        callback?.({ success: false, message: error.message });
        socket.emit('ERROR', { message: error.message });
      }
    });

    // Spectator join room (watch-only, no player record)
    socket.on('SPECTATE_JOIN', async (data, callback) => {
      try {
        const { roomUid } = data;
        socket.join(roomUid);
        this.addSocketToRoom(socket.id, roomUid);
        logger.info(`👁️ Spectator ${userId} joined room ${roomUid}`);
        callback?.({ success: true });
      } catch (error: any) {
        logger.error(`Error in SPECTATE_JOIN: ${error.message}`);
        callback?.({ success: false, message: error.message });
      }
    });

    // Spectator leave room
    socket.on('SPECTATE_LEAVE', async (data, callback) => {
      try {
        const { roomUid } = data;
        socket.leave(roomUid);
        this.removeSocketFromRoom(socket.id, roomUid);
        logger.info(`👁️ Spectator ${userId} left room ${roomUid}`);
        callback?.({ success: true });
      } catch (error: any) {
        logger.error(`Error in SPECTATE_LEAVE: ${error.message}`);
        callback?.({ success: false, message: error.message });
      }
    });

    // ── Endless Race Live Session ──────────────────────────────────────────

    socket.on('ENDLESS_START', (_data: any, callback?: Function) => {
      const sessionId = `endless_${Date.now()}_${userId.slice(-6)}`;
      ConnectionManager.endlessSessions.set(sessionId, {
        sessionId,
        playerAddress: userId,
        username: (socket.data.user as any)?.username || userId.slice(0, 8),
        socketId: socket.id,
        startedAt: Date.now(),
        lastState: null,
      });
      socket.join(`endless:${sessionId}`);
      socket.data.endlessSessionId = sessionId;
      this.io.to('endless-lobby').emit('ENDLESS_SESSION_STARTED', {
        sessionId,
        playerAddress: userId,
        username: (socket.data.user as any)?.username || userId.slice(0, 8),
        startedAt: Date.now(),
      });
      callback?.({ success: true, sessionId });
      logger.info(`🎮 Endless live session started: ${sessionId} by ${userId}`);
    });

    socket.on('ENDLESS_STATE', (data: any) => {
      const sessionId = socket.data.endlessSessionId as string | undefined;
      if (!sessionId) return;
      const session = ConnectionManager.endlessSessions.get(sessionId);
      if (session) session.lastState = data;
      socket.to(`endless:${sessionId}`).emit('ENDLESS_STATE', data);
    });

    socket.on('ENDLESS_END', () => {
      const sessionId = socket.data.endlessSessionId as string | undefined;
      if (!sessionId) return;
      ConnectionManager.endlessSessions.delete(sessionId);
      socket.data.endlessSessionId = null;
      socket.leave(`endless:${sessionId}`);
      this.io.to(`endless:${sessionId}`).emit('ENDLESS_SESSION_ENDED', { sessionId });
      this.io.to('endless-lobby').emit('ENDLESS_SESSION_ENDED', { sessionId });
      logger.info(`🏁 Endless live session ended: ${sessionId}`);
    });

    socket.on('ENDLESS_SPECTATE', (data: { sessionId: string }, callback?: Function) => {
      const { sessionId } = data;
      socket.join(`endless:${sessionId}`);
      const session = ConnectionManager.endlessSessions.get(sessionId);
      callback?.({ success: true, lastState: session?.lastState || null });
      logger.info(`👁️ Spectator ${userId} watching endless session ${sessionId}`);
    });

    socket.on('ENDLESS_LOBBY_JOIN', (_data: any, callback?: Function) => {
      socket.join('endless-lobby');
      callback?.({ success: true });
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      this.handleDisconnect(socket, reason);
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error(`Socket error for ${userId}:`, error);
    });
  }

  /**
   * Handle socket disconnection with grace period
   */
  private handleDisconnect(socket: Socket, reason: string): void {
    const userId = socket.data.userId;
    const meta = this.socketMeta.get(socket.id);

    logger.info(`🔌 Disconnect: ${userId} (${socket.id}) - Reason: ${reason}`);

    if (!meta) {
      logger.warn(`No metadata found for socket ${socket.id}`);
      return;
    }

    // Set grace period before removing from game
    const timeout = setTimeout(async () => {
      // Check if user has reconnected
      const currentSocketId = this.userSockets.get(userId);

      if (currentSocketId === socket.id) {
        // User did not reconnect, remove from room
        if (meta.roomId) {
          logger.info(`⏰ Grace period expired for ${userId}, removing from room`);
          this.removeSocketFromRoom(socket.id, meta.roomId);

          // Notify room that player left
          this.io.to(meta.roomId).emit('PLAYER_LEFT', {
            playerId: userId,
            reason: 'timeout',
          });
        }

        // Clean up endless session if active
        const endlessSessionId = socket.data.endlessSessionId as string | undefined;
        if (endlessSessionId) {
          ConnectionManager.endlessSessions.delete(endlessSessionId);
          this.io.to(`endless:${endlessSessionId}`).emit('ENDLESS_SESSION_ENDED', { sessionId: endlessSessionId });
          this.io.to('endless-lobby').emit('ENDLESS_SESSION_ENDED', { sessionId: endlessSessionId });
          logger.info(`🏁 Endless session auto-ended (disconnect): ${endlessSessionId}`);
        }

        // Cleanup
        this.userSockets.delete(userId);
        this.socketMeta.delete(socket.id);
      }

      this.pendingDisconnects.delete(userId);
    }, this.DISCONNECT_GRACE_PERIOD);

    this.pendingDisconnects.set(userId, timeout);
  }

  /**
   * Cancel pending disconnect (user reconnected)
   */
  private cancelPendingDisconnect(userId: string): void {
    const timeout = this.pendingDisconnects.get(userId);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingDisconnects.delete(userId);
      logger.info(`✅ Reconnection detected for ${userId}, cancelled disconnect`);
    }
  }

  /**
   * Add socket to room tracking
   */
  private addSocketToRoom(socketId: string, roomId: string): void {
    if (!this.roomConnections.has(roomId)) {
      this.roomConnections.set(roomId, new Set());
    }

    this.roomConnections.get(roomId)!.add(socketId);

    const meta = this.socketMeta.get(socketId);
    if (meta) {
      meta.roomId = roomId;
    }

    logger.debug(`📍 Socket ${socketId} added to room ${roomId}`);
  }

  /**
   * Remove socket from room tracking
   */
  private removeSocketFromRoom(socketId: string, roomId: string): void {
    const roomSockets = this.roomConnections.get(roomId);
    if (roomSockets) {
      roomSockets.delete(socketId);

      if (roomSockets.size === 0) {
        this.roomConnections.delete(roomId);
        logger.debug(`🗑️  Room ${roomId} has no more connections, removed`);
      }
    }

    const meta = this.socketMeta.get(socketId);
    if (meta) {
      meta.roomId = undefined;
    }
  }

  /**
   * Get total active connections
   */
  public getActiveConnectionCount(): number {
    return this.io.sockets.sockets.size;
  }

  /**
   * Get connections in a specific room
   */
  public getRoomConnectionCount(roomId: string): number {
    return this.roomConnections.get(roomId)?.size || 0;
  }

  /**
   * Get all room stats
   */
  public getRoomStats(): Record<string, number> {
    const stats: Record<string, number> = {};

    for (const [roomId, sockets] of this.roomConnections.entries()) {
      stats[roomId] = sockets.size;
    }

    return stats;
  }
}
