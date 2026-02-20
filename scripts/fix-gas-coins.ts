/**
 * Fix Gas Coins Issue
 * Merge all small coins into one usable gas coin
 */

import { SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import * as dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.ONECHAIN_RPC_URL || 'https://rpc-testnet.onelabs.cc:443';
const PRIVATE_KEY = process.env.BACKEND_PRIVATE_KEY;

async function main() {
  console.log('🔧 Fixing gas coins...\n');

  if (!PRIVATE_KEY) {
    throw new Error('❌ BACKEND_PRIVATE_KEY not found in .env');
  }

  const client = new SuiClient({ url: RPC_URL });
  const keypair = Ed25519Keypair.fromSecretKey(
    Buffer.from(PRIVATE_KEY.replace('0x', ''), 'hex')
  );
  const sender = keypair.toSuiAddress();

  console.log(`👤 Address: ${sender}\n`);

  // Get all coins
  const coins = await client.getCoins({ owner: sender, coinType: '0x2::oct::OCT' });

  console.log(`💰 Found ${coins.data.length} coin objects:\n`);

  let totalBalance = 0n;
  coins.data.forEach((coin, i) => {
    const balance = BigInt(coin.balance);
    totalBalance += balance;
    console.log(`   ${i + 1}. ${coin.coinObjectId.substring(0, 20)}... - ${balance} MIST (${Number(balance) / 1_000_000_000} OCT)`);
  });

  console.log(`\n📊 Total Balance: ${totalBalance} MIST (${Number(totalBalance) / 1_000_000_000} OCT)\n`);

  if (coins.data.length <= 1) {
    console.log('✅ Only one coin object - no merge needed');
    return;
  }

  // Merge all coins into the first one
  console.log('🔄 Merging all coins into one...\n');

  const tx = new TransactionBlock();

  // Take first coin as primary
  const primaryCoin = coins.data[0];
  const coinsToMerge = coins.data.slice(1).map(c => c.coinObjectId);

  // Merge all other coins into the primary coin
  tx.mergeCoins(tx.object(primaryCoin.coinObjectId), coinsToMerge.map(id => tx.object(id)));

  try {
    const result = await client.signAndExecuteTransactionBlock({
      signer: keypair,
      transactionBlock: tx,
      options: {
        showEffects: true,
      },
    });

    console.log('✅ Coins merged successfully!\n');
    console.log(`📋 Digest: ${result.digest}\n`);
    console.log('Now you can run the initialize script again:');
    console.log('   npx ts-node scripts/initialize-gacha.ts\n');

  } catch (error: any) {
    console.error('❌ Merge failed:', error.message || error);

    if (error.message?.includes('No valid gas coins')) {
      console.error('\n💡 Alternative: Request fresh tokens from faucet');
      console.error(`   curl --location --request POST "https://faucet-testnet.onelabs.cc/gas" \\`);
      console.error(`   --header "Content-Type: application/json" \\`);
      console.error(`   --data-raw '{"FixedAmountRequest":{"recipient":"${sender}"}}'`);
    }
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
