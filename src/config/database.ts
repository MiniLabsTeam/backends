import { PrismaClient } from '@prisma/client';
import { env } from './env';

// Singleton Prisma Client
let prisma: PrismaClient;

// Create Prisma Client with logging configuration
const createPrismaClient = (): PrismaClient => {
  const logLevels: Array<'query' | 'info' | 'warn' | 'error'> = [];

  if (env.nodeEnv === 'development') {
    logLevels.push('query', 'warn', 'error');
  } else if (env.nodeEnv === 'production') {
    logLevels.push('error');
  }

  return new PrismaClient({
    log: logLevels,
    errorFormat: env.nodeEnv === 'development' ? 'pretty' : 'minimal',
  });
};

// Get Prisma Client instance (singleton pattern)
export const getPrisma = (): PrismaClient => {
  if (!prisma) {
    prisma = createPrismaClient();
  }
  return prisma;
};

// Connect to database
export const connectDatabase = async (): Promise<void> => {
  try {
    const client = getPrisma();
    await client.$connect();
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
};

// Disconnect from database
export const disconnectDatabase = async (): Promise<void> => {
  try {
    const client = getPrisma();
    await client.$disconnect();
    console.log('✅ Database disconnected successfully');
  } catch (error) {
    console.error('❌ Database disconnection failed:', error);
    throw error;
  }
};

// Health check
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    const client = getPrisma();
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
};

// Export Prisma instance
export const prismaClient = getPrisma();

// Handle process termination
process.on('beforeExit', async () => {
  await disconnectDatabase();
});

export default prismaClient;
