/**
 * Test Concurrent Bets - Verify Race Condition Fix
 * 
 * This simulates multiple concurrent bets to ensure the fix works correctly
 */

import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { PrismaClient } from '@prisma/client';

const prismaClient = new PrismaClient();
const OCT_DECIMALS = 9;

async function testConcurrentBets() {
  try {
    console.log('\n' + '═'.repeat(80));
    console.log('🧪 TESTING CONCURRENT BETS - Race Condition Fix Verification');
    console.log('═'.repeat(80) + '\n');

    // Get a real user to use as bettor
    const users = await prismaClient.user.findMany({ take: 5 });
    if (users.length === 0) {
      throw new Error('No test users found in database');
    }

    // Create a new test pool
    const testRoom = await prismaClient.room.create({
      data: {
        roomUid: `TEST_ROOM_${Date.now()}`,
        roomHash: `TEST_HASH_${Date.now()}`,
        entryFee: '0',
        maxPlayers: 2,
        deadline: Date.now().toString(),
        gameMode: 'DRAG_RACE',
      },
    });

    const testPool = await prismaClient.predictionPool.create({
      data: {
        roomId: testRoom.id,
        roomUid: testRoom.roomUid,
        totalPool: '0',
      },
    });

    console.log(`✅ Created test pool: ${testPool.id}`);
    console.log(`   Initial total: 0 OCT\n`);

    // Simulate 5 concurrent bets of 1 OCT each
    const betAmount = BigInt(1 * 10 ** OCT_DECIMALS); // 1 OCT in MIST
    const betCount = Math.min(5, users.length);

    console.log(`Placing ${betCount} concurrent bets of 1 OCT each...\n`);

    // Place all bets concurrently
    const betPromises = users.slice(0, betCount).map((user) =>
      prismaClient.bet.create({
        data: {
          poolId: testPool.id,
          bettor: user.address,
          amount: betAmount.toString(),
          predictedWinner: '1',
          payout: '0', // Will be set on settlement
        },
      })
    );

    await Promise.all(betPromises);

    console.log(`✅ All bets placed successfully!\n`);

    // Check final pool total
    const finalPool = await prismaClient.predictionPool.findUnique({
      where: { id: testPool.id },
      include: {
        bets: {
          select: { amount: true },
        },
      },
    });

    if (!finalPool) {
      throw new Error('Pool not found after bets!');
    }

    const recordedTotal = BigInt(finalPool.totalPool);
    const actualTotal = finalPool.bets.reduce((sum, bet) => sum + BigInt(bet.amount), BigInt(0));

    console.log('📊 VERIFICATION RESULTS:');
    console.log(`   Recorded totalPool: ${(Number(recordedTotal) / 10 ** OCT_DECIMALS).toFixed(2)} OCT`);
    console.log(`   Sum of all bets:    ${(Number(actualTotal) / 10 ** OCT_DECIMALS).toFixed(2)} OCT`);
    console.log(`   Number of bets:     ${finalPool.bets.length}`);

    if (recordedTotal === actualTotal) {
      console.log(`\n✅ SUCCESS! Pool totals match! Race condition fix is working!\n`);
    } else {
      const diff = actualTotal - recordedTotal;
      console.log(`\n❌ MISMATCH! Difference: ${(Number(diff) / 10 ** OCT_DECIMALS).toFixed(2)} OCT\n`);
    }

    // Cleanup test data
    await prismaClient.predictionPool.delete({
      where: { id: testPool.id },
    });
    await prismaClient.room.delete({
      where: { id: testRoom.id },
    });

    console.log('═'.repeat(80) + '\n');

    await prismaClient.$disconnect();
  } catch (error: any) {
    console.error('\n❌ Error:');
    console.error(error.message || error);
    process.exit(1);
  }
}

testConcurrentBets();
