import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const OCT_DECIMALS = 9;

async function debugPoolMismatch() {
  try {
    console.log('\n' + '═'.repeat(80));
    console.log('🔍 DEBUG: POOL vs BETS MISMATCH');
    console.log('═'.repeat(80) + '\n');

    // Get POOL 1 (yang ada masalah)
    const pool = await prisma.predictionPool.findFirst({
      where: { roomUid: 'ROOM_1771907965976_fux0rrj' },
      include: { bets: true },
    });

    if (!pool) {
      console.log('Pool not found');
      return;
    }

    console.log(`Pool ID: ${pool.id}`);
    console.log(`Room UID: ${pool.roomUid}`);
    console.log(`Total Pool (dari DB): ${(Number(BigInt(pool.totalPool)) / 10 ** OCT_DECIMALS).toFixed(2)} OCT\n`);

    console.log('BETS IN POOL:\n');
    const totalFromBets = pool.bets.reduce((sum, bet) => sum + BigInt(bet.amount), 0n);
    pool.bets.forEach((bet, i) => {
      const amount = Number(BigInt(bet.amount)) / 10 ** OCT_DECIMALS;
      console.log(`${i + 1}. Bettor: ${bet.bettor.substring(0, 20)}...`);
      console.log(`   Amount: ${amount.toFixed(2)} OCT`);
      console.log(`   Predicted: ${bet.predictedWinner.substring(0, 20)}...`);
      console.log('');
    });

    const totalFromBetsOCT = Number(totalFromBets) / 10 ** OCT_DECIMALS;
    console.log(`═`.repeat(80));
    console.log(`Total from summing all bets: ${totalFromBetsOCT.toFixed(2)} OCT`);
    console.log(`Total from pool.totalPool:  ${(Number(BigInt(pool.totalPool)) / 10 ** OCT_DECIMALS).toFixed(2)} OCT`);
    console.log(`MISMATCH: ${(totalFromBetsOCT - Number(BigInt(pool.totalPool)) / 10 ** OCT_DECIMALS).toFixed(2)} OCT ❌\n`);

    // Check if bet amounts are correct
    console.log(`Bet count: ${pool.bets.length} bets`);
    console.log(`Expected pool (sum of bets): ${totalFromBetsOCT.toFixed(2)} OCT`);
    console.log(`Actual pool in DB: ${(Number(BigInt(pool.totalPool)) / 10 ** OCT_DECIMALS).toFixed(2)} OCT`);

    await prisma.$disconnect();
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

debugPoolMismatch();
