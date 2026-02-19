import { SuiEvent } from '@mysten/sui.js/client';
import { EventListener } from './EventListener';
import { EventHandler } from './EventHandler';
import { connectDatabase } from '../config/database';
import { connectRedis } from '../config/redis';
import { testBlockchainConnection } from '../config/blockchain';
import { env } from '../config/env';
import logger from '../config/logger';

/**
 * OneChain Blockchain Indexer
 *
 * Listens to smart contract events and syncs data to database.
 *
 * Features:
 * - Event listening via polling or WebSocket
 * - Automatic retry on errors
 * - Checkpoint-based resume
 * - Event logging for debugging
 */
class Indexer {
  private listener: EventListener;
  private isRunning: boolean = false;
  private retryCount: number = 0;
  private maxRetries: number = 5;
  private retryDelay: number = 5000; // 5 seconds

  constructor() {
    this.listener = new EventListener(env.indexerPollInterval);
  }

  /**
   * Start the indexer
   */
  public async start(): Promise<void> {
    try {
      logger.info('🚀 Starting OneChain Blockchain Indexer...');

      // Initialize connections
      await this.initialize();

      // Start listening to events
      const startCheckpoint = env.indexerStartCheckpoint.toString();
      await this.listener.start(
        this.handleEvent.bind(this),
        startCheckpoint !== '0' ? startCheckpoint : undefined
      );

      this.isRunning = true;
      this.retryCount = 0;

      logger.info('✅ Indexer started successfully');
      logger.info(`📍 Starting from checkpoint: ${startCheckpoint || 'latest'}`);
      logger.info(`⏱️  Poll interval: ${env.indexerPollInterval}ms`);
      logger.info(`📦 Batch size: ${env.indexerBatchSize}`);
    } catch (error) {
      logger.error('❌ Failed to start indexer:', error);
      await this.handleError(error);
    }
  }

  /**
   * Stop the indexer
   */
  public stop(): void {
    logger.info('🛑 Stopping indexer...');
    this.listener.stop();
    this.isRunning = false;
    logger.info('✅ Indexer stopped');
  }

  /**
   * Initialize database and connections
   */
  private async initialize(): Promise<void> {
    try {
      // Connect to database
      logger.info('📦 Connecting to database...');
      await connectDatabase();

      // Connect to Redis
      logger.info('🔴 Connecting to Redis...');
      await connectRedis();

      // Test blockchain connection
      logger.info('⛓️  Testing blockchain connection...');
      await testBlockchainConnection();

      logger.info('✅ All connections established');
    } catch (error) {
      logger.error('❌ Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Handle incoming event
   */
  private async handleEvent(event: SuiEvent): Promise<void> {
    try {
      logger.debug(`Processing event: ${event.type} (${event.id.txDigest})`);

      // Process event
      await EventHandler.handle(event);

      // Reset retry count on success
      this.retryCount = 0;
    } catch (error) {
      logger.error(`Failed to process event ${event.id.txDigest}:`, error);
      throw error;
    }
  }

  /**
   * Handle errors with retry logic
   */
  private async handleError(error: any): Promise<void> {
    this.retryCount++;

    if (this.retryCount >= this.maxRetries) {
      logger.error(`❌ Max retries (${this.maxRetries}) reached. Shutting down.`);
      this.stop();
      process.exit(1);
    }

    logger.warn(
      `⚠️  Error occurred (retry ${this.retryCount}/${this.maxRetries}). Retrying in ${this.retryDelay}ms...`
    );

    // Wait before retry
    await this.sleep(this.retryDelay);

    // Exponential backoff
    this.retryDelay = Math.min(this.retryDelay * 2, 60000); // Max 1 minute

    // Retry
    await this.start();
  }

  /**
   * Get indexer status
   */
  public getStatus(): {
    isRunning: boolean;
    lastCheckpoint: string | null;
    retryCount: number;
  } {
    return {
      isRunning: this.isRunning,
      lastCheckpoint: this.listener.getLastCheckpoint(),
      retryCount: this.retryCount,
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Create indexer instance
const indexer = new Indexer();

// Handle process signals
process.on('SIGTERM', () => {
  logger.info('👋 SIGTERM received, shutting down indexer...');
  indexer.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('👋 SIGINT received, shutting down indexer...');
  indexer.stop();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('💥 Uncaught Exception:', error);
  indexer.stop();
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason: any) => {
  logger.error('💥 Unhandled Rejection:', reason);
  indexer.stop();
  process.exit(1);
});

// Start indexer if run directly
if (require.main === module) {
  indexer
    .start()
    .then(() => {
      logger.info('✅ Indexer is now running');
    })
    .catch((error) => {
      logger.error('❌ Failed to start indexer:', error);
      process.exit(1);
    });
}

export default indexer;
export { Indexer };
