import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const OCT = 9;

async function check() {
  const pool = await prisma.predictionPool.findFirst({
    where: { roomUid: { contains: '1771910674895' } },
    include: { bets: true }
  });
  
  if (pool) {
    console.log('\n=== POOL STATE ===');
    console.log('Pool ID:', pool.id);
    console.log('RoomUid:', pool.roomUid);
    console.log('TotalPool (raw):', pool.totalPool);
    console.log('TotalPool (OCT):', (Number(pool.totalPool) / 10**OCT).toFixed(2));
    console.log('isSettled:', pool.isSettled);
    console.log('\n=== BETS ===');
    console.log('Bets count:', pool.bets.length);
    let sum = BigInt(0);
    pool.bets.forEach((bet, i) => {
      const amtOCT = (Number(bet.amount) / 10**OCT).toFixed(2);
      console.log(`Bet ${i+1}: ${amtOCT} OCT by ${bet.bettor.substring(0, 15)}...`);
      sum += BigInt(bet.amount);
    });
    console.log('\n=== VERIFY ===');
    console.log('Sum of bets:', (Number(sum) / 10**OCT).toFixed(2), 'OCT');
    console.log('Pool shows: ', (Number(pool.totalPool) / 10**OCT).toFixed(2), 'OCT');
    if (sum.toString() !== pool.totalPool) {
      console.log('❌ MISMATCH!');
    } else {
      console.log('✅ MATCH!');
    }
  } else {
    console.log('Pool not found');
  }
  await prisma.$disconnect();
}
check();
