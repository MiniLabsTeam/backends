import Redis from 'ioredis';
import { env } from './env';

// Singleton Redis Client
let redisClient: Redis;

// Create Redis Client
const createRedisClient = (): Redis => {
  const client = new Redis({
    host: env.redisHost,
    port: env.redisPort,
    password: env.redisPassword,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  // Event listeners
  client.on('connect', () => {
    console.log('✅ Redis connected successfully');
  });

  client.on('error', (error) => {
    console.error('❌ Redis connection error:', error);
  });

  client.on('ready', () => {
    console.log('✅ Redis ready for operations');
  });

  client.on('close', () => {
    console.log('⚠️ Redis connection closed');
  });

  client.on('reconnecting', () => {
    console.log('🔄 Redis reconnecting...');
  });

  return client;
};

// Get Redis Client instance (singleton pattern)
export const getRedis = (): Redis => {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
};

// Connect to Redis
export const connectRedis = async (): Promise<void> => {
  try {
    const client = getRedis();
    await client.connect();
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    throw error;
  }
};

// Disconnect from Redis
export const disconnectRedis = async (): Promise<void> => {
  try {
    const client = getRedis();
    await client.quit();
    console.log('✅ Redis disconnected successfully');
  } catch (error) {
    console.error('❌ Redis disconnection failed:', error);
    throw error;
  }
};

// Health check
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    const client = getRedis();
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('Redis health check failed:', error);
    return false;
  }
};

// Cache helper functions
export class RedisCache {
  private client: Redis;
  private defaultTTL: number = 3600; // 1 hour in seconds

  constructor() {
    this.client = getRedis();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Error getting key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttl: number = this.defaultTTL): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      await this.client.setex(key, ttl, serialized);
      return true;
    } catch (error) {
      console.error(`Error setting key ${key}:`, error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error(`Error deleting key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Error checking existence of key ${key}:`, error);
      return false;
    }
  }

  async incr(key: string): Promise<number> {
    return await this.client.incr(key);
  }

  async decr(key: string): Promise<number> {
    return await this.client.decr(key);
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      await this.client.expire(key, ttl);
      return true;
    } catch (error) {
      console.error(`Error setting expiry for key ${key}:`, error);
      return false;
    }
  }

  async flushAll(): Promise<boolean> {
    try {
      await this.client.flushall();
      return true;
    } catch (error) {
      console.error('Error flushing Redis:', error);
      return false;
    }
  }

  // Pattern-based deletion
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) return 0;
      await this.client.del(...keys);
      return keys.length;
    } catch (error) {
      console.error(`Error deleting pattern ${pattern}:`, error);
      return 0;
    }
  }

  // Hash operations
  async hset(key: string, field: string, value: any): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      await this.client.hset(key, field, serialized);
      return true;
    } catch (error) {
      console.error(`Error hset ${key} ${field}:`, error);
      return false;
    }
  }

  async hget<T>(key: string, field: string): Promise<T | null> {
    try {
      const value = await this.client.hget(key, field);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Error hget ${key} ${field}:`, error);
      return null;
    }
  }

  async hgetall<T>(key: string): Promise<Record<string, T> | null> {
    try {
      const values = await this.client.hgetall(key);
      if (!values || Object.keys(values).length === 0) return null;

      const parsed: Record<string, T> = {};
      for (const [field, value] of Object.entries(values)) {
        parsed[field] = JSON.parse(value) as T;
      }
      return parsed;
    } catch (error) {
      console.error(`Error hgetall ${key}:`, error);
      return null;
    }
  }

  async hdel(key: string, field: string): Promise<boolean> {
    try {
      await this.client.hdel(key, field);
      return true;
    } catch (error) {
      console.error(`Error hdel ${key} ${field}:`, error);
      return false;
    }
  }

  // List operations
  async rpush(key: string, value: any): Promise<number> {
    try {
      const serialized = JSON.stringify(value);
      return await this.client.rpush(key, serialized);
    } catch (error) {
      console.error(`Error rpush ${key}:`, error);
      return 0;
    }
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      return await this.client.lrange(key, start, stop);
    } catch (error) {
      console.error(`Error lrange ${key}:`, error);
      return [];
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      console.error(`Error ttl ${key}:`, error);
      return -1;
    }
  }
}

// Export Redis instance and cache helper
export const redis = getRedis();
export const cache = new RedisCache();

// Handle process termination
process.on('beforeExit', async () => {
  await disconnectRedis();
});

export default redis;
