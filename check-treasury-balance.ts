import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { SuiClient, SuiHTTPTransport } from '@mysten/sui.js/client';

const RPC_URL = process.env.ONECHAIN_RPC_URL || 'https://rpc-testnet.onelabs.cc:443';
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS;
const OCT_COIN_TYPE = '0x2::oct::OCT';
const OCT_DECIMALS = 9;

const client = new SuiClient({
  transport: new SuiHTTPTransport({
    url: RPC_URL,
  }),
});

async function checkTreasuryBalance() {
  try {
    console.log('\n🏦 Checking Treasury (Backend Wallet) Balance...\n');
    console.log(`Treasury Address: ${TREASURY_ADDRESS}`);
    console.log(`RPC URL: ${RPC_URL}\n`);

    if (!TREASURY_ADDRESS) {
      throw new Error('TREASURY_ADDRESS not found in .env');
    }

    // Get all OCT coins owned by treasury
    const coins = await client.getCoins({
      owner: TREASURY_ADDRESS,
      coinType: OCT_COIN_TYPE,
    });

    console.log(`Found ${coins.data.length} coin object(s) in treasury:\n`);

    if (coins.data.length === 0) {
      console.log('⚠️ No OCT coins found in treasury!');
      return;
    }

    let totalBalance = BigInt(0);
    coins.data.forEach((coin, i) => {
      const balance = BigInt(coin.balance);
      totalBalance += balance;
      const balanceOCT = Number(balance) / (10 ** OCT_DECIMALS);
      console.log(`${i + 1}. Coin ID: ${coin.coinObjectId.substring(0, 20)}...`);
      console.log(`   Balance: ${balance.toString()} MIST (${balanceOCT.toFixed(2)} OCT)`);
      console.log(`   Version: ${coin.version}`);
      console.log('');
    });

    const totalOCT = Number(totalBalance) / (10 ** OCT_DECIMALS);
    console.log('═'.repeat(60));
    console.log(`💰 TOTAL TREASURY BALANCE: ${totalBalance.toString()} MIST`);
    console.log(`💵 TOTAL TREASURY BALANCE: ${totalOCT.toFixed(2)} OCT`);
    console.log('═'.repeat(60));
    console.log(`\n✅ Treasury holding ${totalOCT.toFixed(2)} OCT for all users\n`);

  } catch (error: any) {
    console.error('\n❌ Error:');
    console.error(error.message || error);
  }
}

checkTreasuryBalance();
