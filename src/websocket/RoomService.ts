/**
 * Room Service
 *
 * Handles room-related WebSocket events:
 * - Player join/leave
 * - Player ready
 * - Player inputs
 * - Room state updates
 */

import { Server as SocketServer, Socket } from 'socket.io';
import { gameEngineService } from '../services/game/GameEngineService';
import { prismaClient } from '../config/database';
import logger from '../config/logger';

export class RoomService {
  private io: SocketServer;

  constructor(io: SocketServer) {
    this.io = io;
  }

  /**
   * Handle player joining a room
   */
  public async handlePlayerJoin(
    socket: Socket,
    data: { roomUid: string; carUid: string }
  ): Promise<void> {
    const { roomUid, carUid } = data;
    const playerAddress = socket.data.userId;

    logger.info(`🎮 Player ${playerAddress} joining room ${roomUid}`);

    // Join room via GameEngineService
    const result = await gameEngineService.joinRoom(roomUid, playerAddress, carUid);

    // Subscribe socket to room for broadcasts
    socket.join(roomUid);

    // Notify room that player joined
    this.io.to(roomUid).emit('PLAYER_JOINED', {
      playerAddress,
      carStats: result.carStats,
    });

    // Broadcast updated lobby state
    await this.broadcastLobbyUpdate(roomUid);

    logger.info(`✅ Player ${playerAddress} joined room ${roomUid}`);
  }

  /**
   * Handle player leaving a room
   */
  public async handlePlayerLeave(
    socket: Socket,
    data: { roomUid: string }
  ): Promise<void> {
    const { roomUid } = data;
    const playerAddress = socket.data.userId;

    logger.info(`🚪 Player ${playerAddress} leaving room ${roomUid}`);

    // Unsubscribe from room
    socket.leave(roomUid);

    // Notify room that player left
    this.io.to(roomUid).emit('PLAYER_LEFT', {
      playerId: playerAddress,
      reason: 'manual_leave',
    });

    // Broadcast updated lobby state
    await this.broadcastLobbyUpdate(roomUid);
  }

  /**
   * Handle player marking ready
   */
  public async handlePlayerReady(
    socket: Socket,
    data: { roomUid: string }
  ): Promise<void> {
    const { roomUid } = data;
    const playerAddress = socket.data.userId;

    logger.info(`✋ Player ${playerAddress} marked ready in room ${roomUid}`);

    // Mark player as ready
    await gameEngineService.markPlayerReady(roomUid, playerAddress);

    // Broadcast updated lobby state
    await this.broadcastLobbyUpdate(roomUid);
  }

  /**
   * Handle player input during game
   */
  public async handlePlayerInput(
    socket: Socket,
    data: { roomUid: string; action: string }
  ): Promise<void> {
    const { roomUid, action } = data;
    const playerAddress = socket.data.userId;

    // Process input via GameEngineService
    await gameEngineService.processPlayerInput(roomUid, playerAddress, action);

    logger.debug(`🎮 Input from ${playerAddress} in ${roomUid}: ${action}`);
  }

  /**
   * Get current room state
   */
  public async handleGetRoomState(
    _socket: Socket,
    data: { roomUid: string }
  ): Promise<any> {
    const { roomUid } = data;

    const room = await prismaClient.room.findUnique({
      where: { roomUid: roomUid },
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
    });

    if (!room) {
      throw new Error('Room not found');
    }

    return room;
  }

  /**
   * Broadcast lobby update to all players in room
   */
  public async broadcastLobbyUpdate(roomUid: string): Promise<void> {
    try {
      const room = await prismaClient.room.findUnique({
        where: { roomUid: roomUid },
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
      });

      if (!room) {
        logger.warn(`Cannot broadcast lobby update: room ${roomUid} not found`);
        return;
      }

      // Transform room data for frontend
      const lobbyData = {
        ...room,
        currentPlayers: room.players.length, // Add currentPlayers count
      };

      this.io.to(roomUid).emit('LOBBY_UPDATE', lobbyData);

      logger.debug(`📢 Broadcasted lobby update for room ${roomUid} (${room.players.length}/${room.maxPlayers} players)`);
    } catch (error) {
      logger.error(`Error broadcasting lobby update for room ${roomUid}:`, error);
    }
  }
}
