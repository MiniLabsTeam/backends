import express, { Express, Request, Response } from 'express';
import { createServer } from 'http';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env';
import { connectDatabase, checkDatabaseHealth } from './config/database';
import { connectRedis, checkRedisHealth } from './config/redis';
import { testBlockchainConnection } from './config/blockchain';
import logger, { morganStream } from './config/logger';
import { corsMiddleware } from './middleware/cors';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { standardLimiter } from './middleware/rateLimit';
import { initializeWebSocket } from './websocket/server';
import { broadcastService } from './websocket/BroadcastService';

// Create Express app
const app: Express = express();

// Security middleware
app.use(helmet());

// CORS
app.use(corsMiddleware);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Compression
app.use(compression());

// HTTP request logger
if (env.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { stream: morganStream }));
}

// Rate limiting
app.use(standardLimiter);

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  const redisHealthy = await checkRedisHealth();

  const health = {
    status: dbHealthy && redisHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbHealthy ? 'connected' : 'disconnected',
    redis: redisHealthy ? 'connected' : 'disconnected',
  };

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'OneChain Racing Backend',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
import apiRoutes from './routes';
app.use('/api', apiRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Initialize connections
const initializeApp = async (): Promise<void> => {
  try {
    logger.info('🚀 Initializing OneChain Racing Backend...');

    // Connect to database
    logger.info('📦 Connecting to database...');
    await connectDatabase();

    // Connect to Redis (optional)
    logger.info('🔴 Connecting to Redis...');
    try {
      await connectRedis();
      logger.info('✅ Redis connected successfully');
    } catch (error) {
      logger.warn('⚠️  Redis connection failed - running without cache');
      logger.warn('   Game will work but caching/rate-limiting disabled');
    }

    // Test blockchain connection
    logger.info('⛓️  Testing blockchain connection...');
    await testBlockchainConnection();

    logger.info('✅ All connections established successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize application:', error);
    process.exit(1);
  }
};

// Start server
const startServer = async (): Promise<void> => {
  try {
    await initializeApp();

    const PORT = env.port;
    const HOST = env.host;

    // Create HTTP server (required for Socket.io)
    const httpServer = createServer(app);

    // Initialize WebSocket server
    logger.info('🔌 Initializing WebSocket server...');
    const io = initializeWebSocket(httpServer);

    // Make io accessible via app.set() for other modules
    app.set('io', io);

    // Set io instance to BroadcastService for broadcasting game events
    broadcastService.setIO(io);
    logger.info('✅ BroadcastService initialized with Socket.io instance');

    httpServer.listen(PORT, () => {
      logger.info(`🎮 OneChain Racing Backend is running`);
      logger.info(`🌍 Environment: ${env.nodeEnv}`);
      logger.info(`🚀 Server listening on http://${HOST}:${PORT}`);
      logger.info(`🔌 WebSocket server initialized`);
      logger.info(`📊 Health check: http://${HOST}:${PORT}/health`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  logger.error('💥 Unhandled Rejection:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('👋 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('👋 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
if (require.main === module) {
  startServer();
}

export default app;
