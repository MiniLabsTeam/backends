/**
 * WebSocket Server Initialization
 *
 * Initializes Socket.io with:
 * - CORS configuration
 * - JWT authentication middleware
 * - Connection management
 * - Room service integration
 */

import { Server as SocketServer } from 'socket.io';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prismaClient } from '../config/database';
import logger from '../config/logger';
import { ConnectionManager } from './ConnectionManager';
import { RoomService } from './RoomService';

export function initializeWebSocket(httpServer: Server): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: env.corsOrigin,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingInterval: env.wsPingInterval,
    pingTimeout: env.wsPingTimeout,
    transports: ['websocket', 'polling'],
  });

  logger.info('🔌 Setting up WebSocket server...');

  // JWT Authentication middleware
  io.use(async (socket, next) => {
    try {
      // Extract token from auth object or Authorization header
      const token = socket.handshake.auth.token ||
                    socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, env.jwtSecret) as any;

      if (!decoded.address) {
        return next(new Error('Invalid token payload'));
      }

      // Fetch user from database
      const user = await prismaClient.user.findUnique({
        where: { address: decoded.address }
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      // Attach user data to socket
      socket.data.user = user;
      socket.data.userId = user.address;

      logger.debug(`✅ User authenticated: ${user.address}`);
      next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        return next(new Error('Invalid token'));
      }
      if (error instanceof jwt.TokenExpiredError) {
        return next(new Error('Token expired'));
      }
      logger.error('Authentication error:', error);
      return next(new Error('Authentication failed'));
    }
  });

  // Initialize managers
  const connectionManager = new ConnectionManager(io);
  const roomService = new RoomService(io);

  // Handle new connections
  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    logger.info(`🔌 New WebSocket connection: ${userId} (${socket.id})`);

    // Delegate to connection manager
    connectionManager.handleConnection(socket, roomService);

    // Log connection stats
    logger.debug(`📊 Total connections: ${io.sockets.sockets.size}`);
  });

  // Global error handler
  io.on('error', (error) => {
    logger.error('❌ WebSocket server error:', error);
  });

  logger.info('✅ WebSocket server initialized successfully');

  return io;
}
