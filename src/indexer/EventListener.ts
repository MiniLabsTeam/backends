import { SuiClient, SuiEvent, SuiEventFilter } from '@mysten/sui.js/client';
import { getSuiClient } from '../config/blockchain';
import { env } from '../config/env';
import logger from '../config/logger';
import { eventTypes } from '../config/blockchain';
import { cache } from '../config/redis';

const CURSOR_REDIS_KEY = 'indexer:cursor';

/**
 * EventListener
 *
 * Listens to blockchain events from OneChain smart contracts.
 * Supports both polling mode and WebSocket streaming.
 */
export class EventListener {
  private client: SuiClient;
  private isRunning: boolean = false;
  private lastCheckpoint: string | null = null;
  private pollInterval: number;

  constructor(pollInterval: number = env.indexerPollInterval) {
    this.client = getSuiClient();
    this.pollInterval = pollInterval;
  }

  /**
   * Start listening to events
   */
  public async start(
    onEvent: (event: SuiEvent) => Promise<void>,
    startCheckpoint?: string
  ): Promise<void> {
    if (this.isRunning) {
      logger.warn('EventListener is already running');
      return;
    }

    this.isRunning = true;

    // Load persisted cursor from Redis (resume from last processed event)
    const savedCursor = await cache.get<string>(CURSOR_REDIS_KEY).catch(() => null);
    this.lastCheckpoint = startCheckpoint || savedCursor || null;

    logger.info('🎧 EventListener started');
    logger.info(`📍 Starting from checkpoint: ${this.lastCheckpoint || 'latest'}`);

    // Start polling loop
    this.pollEvents(onEvent);
  }

  /**
   * Stop listening to events
   */
  public stop(): void {
    this.isRunning = false;
    logger.info('🛑 EventListener stopped');
  }

  /**
   * Poll for new events using cursor-based pagination to avoid reprocessing.
   */
  private async pollEvents(onEvent: (event: SuiEvent) => Promise<void>): Promise<void> {
    while (this.isRunning) {
      try {
        const eventTypesToListen = Object.values(eventTypes);
        let anyNewEvents = false;

        for (const eventType of eventTypesToListen) {
          const events = await this.queryEvents(eventType);

          for (const event of events) {
            try {
              await onEvent(event);
              anyNewEvents = true;

              // Persist cursor to Redis after each successfully processed event
              if (event.id.txDigest) {
                this.lastCheckpoint = event.id.txDigest;
                // TTL = 1 year (cursor should persist indefinitely)
                cache.set(CURSOR_REDIS_KEY, this.lastCheckpoint, 31_536_000).catch(() => {});
              }
            } catch (error) {
              logger.error(`Failed to process event ${event.id.txDigest}:`, error);
            }
          }
        }

        if (!anyNewEvents) {
          // No new events — wait before polling again
          await this.sleep(this.pollInterval);
        }
      } catch (error) {
        logger.error('Error in polling loop:', error);
        await this.sleep(this.pollInterval * 2);
      }
    }
  }

  /**
   * Query events of a specific type, starting from the last known cursor.
   */
  private async queryEvents(eventType: string): Promise<SuiEvent[]> {
    try {
      const filter: SuiEventFilter = {
        MoveEventType: eventType,
      };

      const result = await this.client.queryEvents({
        query: filter,
        cursor: this.lastCheckpoint
          ? { txDigest: this.lastCheckpoint, eventSeq: '0' }
          : undefined,
        order: 'ascending',
        limit: env.indexerBatchSize,
      });

      return result.data;
    } catch (error) {
      logger.error(`Failed to query events for type ${eventType}:`, error);
      return [];
    }
  }

  /**
   * Get events in a time range
   */
  public async getEventsInRange(
    eventType: string,
    startTime: number,
    endTime: number
  ): Promise<SuiEvent[]> {
    try {
      const filter: SuiEventFilter = {
        MoveEventType: eventType,
      };

      const result = await this.client.queryEvents({
        query: filter,
        order: 'ascending',
      });

      // Filter by timestamp
      const filtered = result.data.filter((event) => {
        const timestamp = parseInt(event.timestampMs || '0', 10);
        return timestamp >= startTime && timestamp <= endTime;
      });

      return filtered;
    } catch (error) {
      logger.error('Failed to get events in range:', error);
      return [];
    }
  }

  /**
   * Get events by transaction digest
   */
  public async getEventsByTxDigest(txDigest: string): Promise<SuiEvent[]> {
    try {
      const result = await this.client.queryEvents({
        query: { Transaction: txDigest },
      });

      return result.data;
    } catch (error) {
      logger.error(`Failed to get events for tx ${txDigest}:`, error);
      return [];
    }
  }

  /**
   * Subscribe to events via WebSocket (alternative to polling)
   */
  public async subscribeToEvents(
    eventType: string,
    onEvent: (event: SuiEvent) => Promise<void>
  ): Promise<() => Promise<void>> {
    try {
      const filter: SuiEventFilter = {
        MoveEventType: eventType,
      };

      // Subscribe to events
      const unsubscribe = await this.client.subscribeEvent({
        filter,
        onMessage: async (event) => {
          try {
            await onEvent(event);
          } catch (error) {
            logger.error('Error processing subscribed event:', error);
          }
        },
      });

      logger.info(`✅ Subscribed to event type: ${eventType}`);

      return unsubscribe;
    } catch (error) {
      logger.error(`Failed to subscribe to event type ${eventType}:`, error);
      throw error;
    }
  }

  /**
   * Subscribe to all event types
   */
  public async subscribeToAllEvents(
    onEvent: (event: SuiEvent) => Promise<void>
  ): Promise<(() => Promise<void>)[]> {
    const unsubscribers: (() => Promise<void>)[] = [];
    const eventTypesToListen = Object.values(eventTypes);

    for (const eventType of eventTypesToListen) {
      try {
        const unsubscribe = await this.subscribeToEvents(eventType, onEvent);
        unsubscribers.push(unsubscribe);
      } catch (error) {
        logger.error(`Failed to subscribe to ${eventType}:`, error);
      }
    }

    logger.info(`✅ Subscribed to ${unsubscribers.length} event types`);

    return unsubscribers;
  }

  /**
   * Get current checkpoint
   */
  public getLastCheckpoint(): string | null {
    return this.lastCheckpoint;
  }

  /**
   * Set checkpoint manually
   */
  public setCheckpoint(checkpoint: string): void {
    this.lastCheckpoint = checkpoint;
    logger.info(`📍 Checkpoint set to: ${checkpoint}`);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if listener is running
   */
  public isListening(): boolean {
    return this.isRunning;
  }
}

export default EventListener;
