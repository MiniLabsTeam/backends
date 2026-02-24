/**
 * Fix Historical Pool Totals Script
 * 
 * Fixes pools where totalPool doesn't match sum of all bets
 * This handles the data corruption from the race condition bug
 */

import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { PrismaClient } from '@prisma/client';

const prismaClient = new PrismaClient();
const OCT_DECIMALS = 9;

async function fixHistoricalPoolTotals() {
  try {
    console.log('\n' + '═'.repeat(80));
    console.log('🔧 FIXING HISTORICAL POOL TOTALS - Bug Correction');
    console.log('═'.repeat(80) + '\n');

    // Get all unsettled pools
    const pools = await prismaClient.predictionPool.findMany({
      where: {
        isSettled: false,
      },
      include: {
        bets: {
          select: { amount: true },
        },
      },
    });

    console.log(`Found ${pools.length} unsettled pools\n`);

    let fixedCount = 0;

    for (const pool of pools) {
      // Calculate actual total from all bets
      const actualTotal = pool.bets.reduce((sum, bet) => sum + BigInt(bet.amount), BigInt(0));

      const recordedTotal = BigInt(pool.totalPool);

      if (actualTotal !== recordedTotal) {
        const diff = actualTotal - recordedTotal;
        const diffOCT = Number(diff) / 10 ** OCT_DECIMALS;

        console.log(`🔴 Pool: ${pool.id}`);
        console.log(`   Bets in pool: ${pool.bets.length}`);
        console.log(`   Recorded total: ${(Number(recordedTotal) / 10 ** OCT_DECIMALS).toFixed(2)} OCT`);
        console.log(`   Actual total:   ${(Number(actualTotal) / 10 ** OCT_DECIMALS).toFixed(2)} OCT`);
        console.log(`   Missing: ${diffOCT.toFixed(2)} OCT`);

        // Fix the pool
        await prismaClient.predictionPool.update({
          where: { id: pool.id },
          data: { totalPool: actualTotal.toString() },
        });

        console.log(`   ✅ Fixed!\n`);
        fixedCount++;
      }
    }

    console.log('═'.repeat(80));
    console.log(`✅ Fixed ${fixedCount} pools with incorrect totals\n`);

    await prismaClient.$disconnect();
  } catch (error: any) {
    console.error('\n❌ Error:');
    console.error(error.message || error);
    process.exit(1);
  }
}

fixHistoricalPoolTotals();
