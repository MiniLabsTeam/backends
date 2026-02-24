import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { PrismaClient } from '@prisma/client';

const prismaClient = new PrismaClient();
const OCT_DECIMALS = 9;

async function checkBetsAndPayouts() {
  try {
    console.log('\n' + '═'.repeat(80));
    console.log('🔍 CHECKING BET & PAYOUT DETAILS');
    console.log('═'.repeat(80) + '\n');

    // Get all prediction pools
    const pools = await prismaClient.predictionPool.findMany({
      include: { bets: true, room: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (pools.length === 0) {
      console.log('No prediction pools found');
      return;
    }

    console.log(`Found ${pools.length} prediction pool(s)\n`);

    pools.forEach((pool, i) => {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`POOL ${i + 1}: ${pool.roomUid}`);
      console.log(`${'─'.repeat(80)}\n`);

      console.log(`Status: ${pool.isSettled ? 'SETTLED' : 'NOT SETTLED'}`);
      console.log(`Total Pool: ${(Number(BigInt(pool.totalPool)) / 10 ** OCT_DECIMALS).toFixed(2)} OCT`);
      console.log(`Actual Winner: ${pool.actualWinner || 'N/A'}\n`);

      console.log('📊 BETS PLACED:\n');
      pool.bets.forEach((bet, j) => {
        const amount = Number(BigInt(bet.amount)) / 10 ** OCT_DECIMALS;
        const payout = bet.payout ? Number(BigInt(bet.payout)) / 10 ** OCT_DECIMALS : 0;
        console.log(`${j + 1}. Bettor: ${bet.bettor.substring(0, 20)}...`);
        console.log(`   Predicted Winner: ${bet.predictedWinner.substring(0, 20)}...`);
        console.log(`   Bet Amount: ${amount.toFixed(2)} OCT`);
        console.log(`   Payout: ${bet.hasClaimed ? payout.toFixed(2) : 'Not claimed'} OCT`);
        console.log(`   Has Claimed: ${bet.hasClaimed ? '✅ YES' : '❌ NO'}`);
        if (bet.hasClaimed && bet.payout) {
          const profit = payout - amount;
          console.log(`   Profit/Loss: ${profit > 0 ? '+' : ''}${profit.toFixed(2)} OCT`);
        }
        console.log('');
      });
    });

    // Get user balances
    console.log('\n' + '═'.repeat(80));
    console.log('💰 USER BALANCE TRACKING');
    console.log('═'.repeat(80) + '\n');

    const users = await prismaClient.user.findMany({
      select: { 
        address: true,
        predictionBalance: true,
        username: true,
      },
      orderBy: { predictionBalance: 'desc' },
      take: 5,
    });

    users.forEach((user, i) => {
      const balance = Number(BigInt(user.predictionBalance)) / 10 ** OCT_DECIMALS;
      console.log(`${i + 1}. ${user.username || user.address.substring(0, 20)}...`);
      console.log(`   Address: ${user.address}`);
      console.log(`   Balance: ${balance.toFixed(2)} OCT\n`);
    });

    await prismaClient.$disconnect();
  } catch (error: any) {
    console.error('\n❌ Error:');
    console.error(error.message || error);
  }
}

checkBetsAndPayouts();
