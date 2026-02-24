/**
 * Refund Bug Fix Script
 * 
 * Refund 0.95 OCT for users affected by the totalPool mismatch bug
 * - User A: refund 0.95 OCT
 * - User D: refund 0.95 OCT
 */

import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { PrismaClient } from '@prisma/client';

const prismaClient = new PrismaClient();
const OCT_DECIMALS = 9;
const REFUND_AMOUNT_OCT = 0.95;
const refundMist = BigInt(Math.floor(REFUND_AMOUNT_OCT * 10 ** OCT_DECIMALS));

async function refundBugAffectedUsers() {
  try {
    console.log('\n' + '═'.repeat(80));
    console.log('💰 REFUNDING AFFECTED USERS - Bug Fix');
    console.log('═'.repeat(80) + '\n');

    // User addresses affected (from the mismatch we found)
    const affectedUsers = [
      '0x3c7039f4c1156c30577174a9d3ff4cf8039a71aa1de690a9fd12f909b82c503c', // User A
      '0x48b00f40d87902b18707c40662e723b1ee1da31f2a952c1794d4cf9a94a0b822', // User D
      '0x0ca4ad22de1daf917cfaafe8b8dd17a1309236358fc59360888f4edeaccf42b2', // User B (also lost from wrong payout)
    ];

    console.log(`Refunding ${REFUND_AMOUNT_OCT} OCT to ${affectedUsers.length} users\n`);

    for (const address of affectedUsers) {
      const user = await prismaClient.user.findUnique({
        where: { address },
        select: { predictionBalance: true, username: true },
      });

      if (!user) {
        console.log(`❌ User not found: ${address.substring(0, 20)}...`);
        continue;
      }

      const currentBalance = BigInt(user.predictionBalance || '0');
      const newBalance = currentBalance + refundMist;

      await prismaClient.$transaction([
        prismaClient.user.update({
          where: { address },
          data: { predictionBalance: newBalance.toString() },
        }),
        prismaClient.predictionDeposit.create({
          data: {
            txDigest: `BUG_FIX_${address}`,
            depositor: address,
            amount: refundMist.toString(),
            type: 'RECOVERY', // Mark as recovery/bug fix
          },
        }),
      ]);

      const currentOCT = Number(currentBalance) / 10 ** OCT_DECIMALS;
      const newOCT = Number(newBalance) / 10 ** OCT_DECIMALS;

      console.log(`✅ ${user.username || address.substring(0, 20)}...`);
      console.log(`   Before: ${currentOCT.toFixed(2)} OCT`);
      console.log(`   After:  ${newOCT.toFixed(2)} OCT`);
      console.log(`   Added:  +${REFUND_AMOUNT_OCT} OCT\n`);
    }

    console.log('═'.repeat(80));
    console.log('✅ Refund completed!\n');

    await prismaClient.$disconnect();
  } catch (error: any) {
    console.error('\n❌ Error:');
    console.error(error.message || error);
    process.exit(1);
  }
}

refundBugAffectedUsers();
