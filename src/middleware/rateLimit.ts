import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { cache } from '../config/redis';

// In-memory fallback store when Redis is unavailable
const memoryStore = new Map<string, { hits: number; resetAt: number }>();

// Custom store using Redis, falls back to in-memory when Redis is down
class RedisStore {
  prefix: string;

  constructor(prefix: string = 'rl:') {
    this.prefix = prefix;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date | undefined }> {
    const redisKey = `${this.prefix}${key}`;
    const windowMs = env.rateLimitWindowMs;

    try {
      // Increment counter
      const hits = await cache.incr(redisKey);

      // Set expiry on first hit
      if (hits === 1) {
        await cache.expire(redisKey, Math.ceil(windowMs / 1000));
      }

      // Get TTL
      const ttl = await cache.ttl(redisKey);
      const resetTime = ttl > 0 ? new Date(Date.now() + ttl * 1000) : undefined;

      return { totalHits: hits, resetTime };
    } catch {
      // Redis unavailable — fall back to in-memory
      const now = Date.now();
      const entry = memoryStore.get(redisKey);

      if (!entry || now > entry.resetAt) {
        memoryStore.set(redisKey, { hits: 1, resetAt: now + windowMs });
        return { totalHits: 1, resetTime: new Date(now + windowMs) };
      }

      entry.hits += 1;
      return { totalHits: entry.hits, resetTime: new Date(entry.resetAt) };
    }
  }

  async decrement(key: string): Promise<void> {
    const redisKey = `${this.prefix}${key}`;
    try {
      await cache.decr(redisKey);
    } catch {
      const entry = memoryStore.get(redisKey);
      if (entry) entry.hits = Math.max(0, entry.hits - 1);
    }
  }

  async resetKey(key: string): Promise<void> {
    const redisKey = `${this.prefix}${key}`;
    try {
      await cache.del(redisKey);
    } catch {
      memoryStore.delete(redisKey);
    }
  }
}

// Standard rate limiter (100 requests per minute)
export const standardLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMaxRequests,
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use Redis store for distributed rate limiting
  store: new RedisStore('rl:standard:') as any,
});

// Strict rate limiter for sensitive endpoints (10 requests per minute)
export const strictLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: 10,
  message: {
    success: false,
    error: 'Too many requests to this endpoint, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore('rl:strict:') as any,
});

// Auth rate limiter (5 attempts per minute)
export const authLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: 5,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  store: new RedisStore('rl:auth:') as any,
});

// Gacha rate limiter (3 pulls per minute)
export const gachaLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: 3,
  message: {
    success: false,
    error: 'Too many gacha pulls, please wait before trying again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore('rl:gacha:') as any,
});

// Marketplace rate limiter (20 requests per minute)
export const marketplaceLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: 20,
  message: {
    success: false,
    error: 'Too many marketplace requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore('rl:marketplace:') as any,
});

// Create room rate limiter (5 per minute)
export const createRoomLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: 5,
  message: {
    success: false,
    error: 'Too many room creation attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore('rl:createroom:') as any,
});

export default standardLimiter;
