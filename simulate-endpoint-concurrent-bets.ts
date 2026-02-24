/**
 * Test Concurrent Bets Through Simulated API Logic
 * 
 * Simulates what happens when concurrent POST requests hit the /bet endpoint
 * by calling the exact same logic without needing HTTP
 */

import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { PrismaClient } from '@prisma/client';

const prismaClient = new PrismaClient();
const OCT_DECIMALS = 9;

async function simulateEndpointLogic() {
  try {
    console.log('\n' + '═'.repeat(80));
    console.log('🧪 SIMULATING CONCURRENT API ENDPOINT CALLS');
    console.log('═'.repeat(80) + '\n');

    // Get real users to test with
    const users = await prismaClient.user.findMany({
      take: 5,
      select: { address: true, predictionBalance: true },
    });

    if (users.length < 3) {
      console.log('❌ Need at least 3 test users');
      process.exit(0);
    }

    // Get an active pool or create one
    let pool = await prismaClient.predictionPool.findFirst({
      where: { isSettled: false },
    });

    if (!pool) {
      // Create a test room and pool
      const room = await prismaClient.room.create({
        data: {
          roomUid: `TEST_${Date.now()}`,
          roomHash: `HASH_${Date.now()}`,
          entryFee: '0',
          maxPlayers: 2,
          deadline: Date.now().toString(),
          gameMode: 'DRAG_RACE',
        },
      });

      pool = await prismaClient.predictionPool.create({
        data: {
          roomId: room.id,
          roomUid: room.roomUid,
          totalPool: '0',
        },
      });
    }

    console.log(`✅ Using pool: ${pool.id}`);
    console.log(`   Current totalPool: ${(Number(pool.totalPool) / 10 ** OCT_DECIMALS).toFixed(2)} OCT\n`);

    const betAmount = 1; // 1 OCT
    const betAmountMist = BigInt(betAmount * 10 ** OCT_DECIMALS);

    console.log(`Simulating 3 concurrent bets of ${betAmount} OCT each...\n`);

    // Simulate exact endpoint logic for 3 concurrent bets
    const betSimulations = users.slice(0, 3).map(async (user) => {
      try {
        // This simulates what the endpoint does:
        
        // 1. Get user balance
        const userBalance = await prismaClient.user.findUnique({
          where: { address: user.address },
          select: { predictionBalance: true },
        });
        const currentBalance = BigInt(userBalance?.predictionBalance || '0');

        // 2. Check if user has enough
        if (currentBalance < betAmountMist) {
          return {
            success: false,
            user: user.address.substring(0, 20),
            error: `Insufficient balance: ${(Number(currentBalance) / 10 ** OCT_DECIMALS).toFixed(2)} OCT`,
          };
        }

        // 3. Fetch FRESH pool state (this is the fix!)
        const freshPool = await prismaClient.predictionPool.findUnique({
          where: { id: pool.id },
          select: { totalPool: true },
        });

        if (!freshPool) {
          return { success: false, user: user.address.substring(0, 20), error: 'Pool disappeared' };
        }

        // 4. Calculate new totals
        const newBalance = currentBalance - betAmountMist;
        const updatedTotal = BigInt(freshPool.totalPool) + betAmountMist; // Using FRESH value!

        // 5. Execute atomically
        await prismaClient.$transaction([
          prismaClient.user.update({
            where: { address: user.address },
            data: { predictionBalance: newBalance.toString() },
          }),
          prismaClient.bet.create({
            data: {
              poolId: pool.id,
              bettor: user.address,
              amount: betAmountMist.toString(),
              predictedWinner: '1',
            },
          }),
          prismaClient.predictionPool.update({
            where: { id: pool.id },
            data: { totalPool: updatedTotal.toString() },
          }),
        ]);

        return {
          success: true,
          user: user.address.substring(0, 20),
          freshPoolBefore: (Number(freshPool.totalPool) / 10 ** OCT_DECIMALS).toFixed(2),
          updatedPoolAfter: (Number(updatedTotal) / 10 ** OCT_DECIMALS).toFixed(2),
        };
      } catch (error: any) {
        return {
          success: false,
          user: user.address.substring(0, 20),
          error: error.message,
        };
      }
    });

    // Simulate concurrent execution
    const results = await Promise.all(betSimulations);

    console.log('📊 RESULTS:');
    results.forEach((result) => {
      if (result.success) {
        console.log(`✅ ${result.user}...`);
        console.log(`   Pool before: ${result.freshPoolBefore} OCT`);
        console.log(`   Pool after:  ${result.updatedPoolAfter} OCT`);
      } else {
        console.log(`❌ ${result.user}... - ${result.error}`);
      }
    });

    // Check final pool state
    const finalPool = await prismaClient.predictionPool.findUnique({
      where: { id: pool.id },
      include: { bets: { select: { amount: true } } },
    });

    const recordedTotal = BigInt(finalPool?.totalPool || '0');
    const sumOfBets = finalPool?.bets.reduce((sum, b) => sum + BigInt(b.amount), BigInt(0)) || BigInt(0);

    console.log('\n✅ FINAL POOL STATE:');
    console.log(`   Recorded totalPool: ${(Number(recordedTotal) / 10 ** OCT_DECIMALS).toFixed(2)} OCT`);
    console.log(`   Sum of all bets:    ${(Number(sumOfBets) / 10 ** OCT_DECIMALS).toFixed(2)} OCT`);
    console.log(`   Number of bets:     ${finalPool?.bets.length}`);

    if (recordedTotal === sumOfBets) {
      console.log(`\n✅ PERFECT MATCH! Race condition fix is WORKING!\n`);
    } else {
      const diff = recordedTotal > sumOfBets ? recordedTotal - sumOfBets : sumOfBets - recordedTotal;
      console.log(`\n⚠️  MISMATCH: ${(Number(diff) / 10 ** OCT_DECIMALS).toFixed(2)} OCT difference\n`);
    }

    console.log('═'.repeat(80) + '\n');
    await prismaClient.$disconnect();
  } catch (error: any) {
    console.error('\n❌ Error:', error.message || error);
    process.exit(1);
  }
}

simulateEndpointLogic();
