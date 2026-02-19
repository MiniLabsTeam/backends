import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface EnvConfig {
  // Server
  nodeEnv: string;
  port: number;
  host: string;

  // Database
  databaseUrl: string;

  // Redis
  redisHost: string;
  redisPort: number;
  redisPassword?: string;

  // JWT
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtRefreshSecret: string;
  jwtRefreshExpiresIn: string;

  // OneChain Blockchain
  onechainRpcUrl: string;
  onechainWssUrl: string;
  packageId: string;

  // Backend Admin Wallet
  backendPrivateKey: string;
  backendPublicKey: string;
  backendAddress: string;

  // Treasury
  treasuryAddress: string;

  // Rate Limiting
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;

  // CORS
  corsOrigin: string[];
  corsCredentials: boolean;

  // WebSocket
  wsPort: number;
  wsPingInterval: number;
  wsPingTimeout: number;

  // Game Configuration
  gameTickRate: number;
  gameMaxPlayers: number;
  gameMinPlayers: number;
  gameRoomTimeout: number;

  // Gacha Configuration
  gachaTier1Price: string;
  gachaTier2Price: string;
  gachaTier3Price: string;
  gachaMaxDiscountPercent: number;
  gachaConfigId?: string;
  gachaStateId?: string;
  gachaVaultId?: string;

  // Marketplace Configuration
  marketplaceFeeBps: number;
  marketplaceRoyaltyBps: number;

  // Quest Configuration
  questResetCron: string;

  // RWA Configuration
  rwaFulfillmentWebhookUrl?: string;
  rwaRequiredParts: number;

  // Logging
  logLevel: string;
  logFilePath: string;

  // Indexer Configuration
  indexerStartCheckpoint: number;
  indexerBatchSize: number;
  indexerPollInterval: number;

  // External APIs
  shipmentTrackingApiKey?: string;
  shipmentTrackingApiUrl?: string;

  // Security
  bcryptRounds: number;
  nonceExpiryMs: number;
  signatureExpiryMs: number;

  // Monitoring
  sentryDsn?: string;
  sentryEnvironment: string;

  // Email
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  emailFrom?: string;
}

const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

const getEnvAsNumber = (key: string, defaultValue?: number): number => {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing environment variable: ${key}`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return parsed;
};

const getEnvAsBoolean = (key: string, defaultValue: boolean = false): boolean => {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
};

const getEnvAsArray = (key: string, defaultValue: string[] = []): string[] => {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value.split(',').map(v => v.trim());
};

export const env: EnvConfig = {
  // Server
  nodeEnv: getEnv('NODE_ENV', 'development'),
  port: getEnvAsNumber('PORT', 3000),
  host: getEnv('HOST', 'localhost'),

  // Database
  databaseUrl: getEnv('DATABASE_URL'),

  // Redis
  redisHost: getEnv('REDIS_HOST', 'localhost'),
  redisPort: getEnvAsNumber('REDIS_PORT', 6379),
  redisPassword: process.env.REDIS_PASSWORD,

  // JWT
  jwtSecret: getEnv('JWT_SECRET'),
  jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '7d'),
  jwtRefreshSecret: getEnv('JWT_REFRESH_SECRET'),
  jwtRefreshExpiresIn: getEnv('JWT_REFRESH_EXPIRES_IN', '30d'),

  // OneChain Blockchain
  onechainRpcUrl: getEnv('ONECHAIN_RPC_URL'),
  onechainWssUrl: getEnv('ONECHAIN_WSS_URL'),
  packageId: getEnv('PACKAGE_ID'),

  // Backend Admin Wallet
  backendPrivateKey: getEnv('BACKEND_PRIVATE_KEY'),
  backendPublicKey: getEnv('BACKEND_PUBLIC_KEY'),
  backendAddress: getEnv('BACKEND_ADDRESS'),

  // Treasury
  treasuryAddress: getEnv('TREASURY_ADDRESS'),

  // Rate Limiting
  rateLimitWindowMs: getEnvAsNumber('RATE_LIMIT_WINDOW_MS', 60000),
  rateLimitMaxRequests: getEnvAsNumber('RATE_LIMIT_MAX_REQUESTS', 100),

  // CORS
  corsOrigin: getEnvAsArray('CORS_ORIGIN', ['http://localhost:3000', 'http://localhost:3001']),
  corsCredentials: getEnvAsBoolean('CORS_CREDENTIALS', true),

  // WebSocket
  wsPort: getEnvAsNumber('WS_PORT', 3001),
  wsPingInterval: getEnvAsNumber('WS_PING_INTERVAL', 30000),
  wsPingTimeout: getEnvAsNumber('WS_PING_TIMEOUT', 5000),

  // Game Configuration
  gameTickRate: getEnvAsNumber('GAME_TICK_RATE', 60),
  gameMaxPlayers: getEnvAsNumber('GAME_MAX_PLAYERS', 8),
  gameMinPlayers: getEnvAsNumber('GAME_MIN_PLAYERS', 2),
  gameRoomTimeout: getEnvAsNumber('GAME_ROOM_TIMEOUT', 300000),

  // Gacha Configuration
  gachaTier1Price: getEnv('GACHA_TIER_1_PRICE', '1000000'),
  gachaTier2Price: getEnv('GACHA_TIER_2_PRICE', '5000000'),
  gachaTier3Price: getEnv('GACHA_TIER_3_PRICE', '10000000'),
  gachaMaxDiscountPercent: getEnvAsNumber('GACHA_MAX_DISCOUNT_PERCENT', 50),
  gachaConfigId: process.env.GACHA_CONFIG_ID,
  gachaStateId: process.env.GACHA_STATE_ID,
  gachaVaultId: process.env.GACHA_VAULT_ID,

  // Marketplace Configuration
  marketplaceFeeBps: getEnvAsNumber('MARKETPLACE_FEE_BPS', 250),
  marketplaceRoyaltyBps: getEnvAsNumber('MARKETPLACE_ROYALTY_BPS', 250),

  // Quest Configuration
  questResetCron: getEnv('QUEST_RESET_CRON', '0 0 * * *'),

  // RWA Configuration
  rwaFulfillmentWebhookUrl: process.env.RWA_FULFILLMENT_WEBHOOK_URL,
  rwaRequiredParts: getEnvAsNumber('RWA_REQUIRED_PARTS', 4),

  // Logging
  logLevel: getEnv('LOG_LEVEL', 'info'),
  logFilePath: getEnv('LOG_FILE_PATH', './logs'),

  // Indexer Configuration
  indexerStartCheckpoint: getEnvAsNumber('INDEXER_START_CHECKPOINT', 0),
  indexerBatchSize: getEnvAsNumber('INDEXER_BATCH_SIZE', 100),
  indexerPollInterval: getEnvAsNumber('INDEXER_POLL_INTERVAL', 5000),

  // External APIs
  shipmentTrackingApiKey: process.env.SHIPMENT_TRACKING_API_KEY,
  shipmentTrackingApiUrl: process.env.SHIPMENT_TRACKING_API_URL,

  // Security
  bcryptRounds: getEnvAsNumber('BCRYPT_ROUNDS', 12),
  nonceExpiryMs: getEnvAsNumber('NONCE_EXPIRY_MS', 300000),
  signatureExpiryMs: getEnvAsNumber('SIGNATURE_EXPIRY_MS', 300000),

  // Monitoring
  sentryDsn: process.env.SENTRY_DSN,
  sentryEnvironment: getEnv('SENTRY_ENVIRONMENT', 'development'),

  // Email
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined,
  smtpUser: process.env.SMTP_USER,
  smtpPassword: process.env.SMTP_PASSWORD,
  emailFrom: process.env.EMAIL_FROM,
};

// Validate critical environment variables
const validateEnv = () => {
  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'ONECHAIN_RPC_URL',
    'PACKAGE_ID',
    'BACKEND_PRIVATE_KEY',
    'BACKEND_PUBLIC_KEY',
    'BACKEND_ADDRESS',
    'TREASURY_ADDRESS',
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

// Run validation
if (env.nodeEnv !== 'test') {
  validateEnv();
}

export default env;
