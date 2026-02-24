import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const address = '0x3c7039f4c1156c30577174a9d3ff4cf8039a71aa1de690a9fd12f909b82c503c';
  
  // Get user balance
  const user = await prisma.user.findUnique({
    where: { address },
    select: { 
      address: true,
      predictionBalance: true,
      username: true,
    }
  });

  if (!user) {
    console.log('❌ User not found');
    process.exit(0);
  }

  const balanceMist = BigInt(user.predictionBalance || '0');
  const balanceOCT = Number(balanceMist) / 1_000_000_000;

  console.log('\n📊 User Balance Info:\n');
  console.log(`Username: ${user.username || 'N/A'}`);
  console.log(`Address: ${address}`);
  console.log(`Balance (MIST): ${balanceMist.toString()}`);
  console.log(`Balance (OCT): ${balanceOCT.toFixed(2)}`);

  // Get all deposits/withdrawals for this user
  console.log('\n💰 Deposit History:\n');
  const deposits = await prisma.predictionDeposit.findMany({
    where: { depositor: address },
    orderBy: { createdAt: 'desc' },
  });

  if (deposits.length === 0) {
    console.log('No deposits found');
  } else {
    deposits.forEach((d, i) => {
      const amount = Number(BigInt(d.amount) || '0') / 1_000_000_000;
      console.log(`${i+1}. Type: ${d.type}, Amount: ${amount.toFixed(2)} OCT`);
      console.log(`   TX: ${d.txDigest}`);
      console.log(`   Date: ${d.createdAt}`);
      console.log('');
    });
  }

  // Get all bets
  console.log('🎲 Bet History:\n');
  const bets = await prisma.bet.findMany({
    where: { bettor: address },
    include: { pool: { include: { room: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  if (bets.length === 0) {
    console.log('No bets found');
  } else {
    bets.forEach((b, i) => {
      const amount = Number(BigInt(b.amount) || '0') / 1_000_000_000;
      console.log(`${i+1}. Amount: ${amount.toFixed(2)} OCT on ${b.predictedWinner}`);
      console.log(`   Pool: ${b.pool?.roomUid}`);
      console.log(`   Status: ${b.hasClaimed ? 'CLAIMED' : 'PENDING'}`);
      console.log('');
    });
  }

  await prisma.$disconnect();
}

main().catch(console.error);
