import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const pools = await prisma.predictionPool.findMany({
    select: { id: true, isSettled: true, totalPool: true, actualWinner: true }
  });
  console.log('All pools:');
  console.log(JSON.stringify(pools, null, 2));
  await prisma.$disconnect();
}

check();
