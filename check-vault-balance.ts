import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { SuiClient, SuiHTTPTransport } from '@mysten/sui.js/client';

const RPC_URL = process.env.ONECHAIN_RPC_URL || 'https://rpc-testnet.onelabs.cc:443';
const VAULT_ID = process.env.GACHA_VAULT_ID;
const OCT_COIN_TYPE = '0x2::oct::OCT';
const OCT_DECIMALS = 9;

const client = new SuiClient({
  transport: new SuiHTTPTransport({
    url: RPC_URL,
  }),
});

async function checkVaultBalance() {
  try {
    console.log('\n🔍 Checking Vault Balance...\n');
    console.log(`Vault ID: ${VAULT_ID}`);
    console.log(`RPC URL: ${RPC_URL}\n`);

    if (!VAULT_ID) {
      throw new Error('GACHA_VAULT_ID not found in .env');
    }

    // Get vault object
    const vaultObj = await client.getObject({
      id: VAULT_ID,
      options: {
        showContent: true,
        showType: true,
      },
    });

    if (!vaultObj.data || !vaultObj.data.content) {
      console.log('❌ Vault object not found or empty');
      return;
    }

    console.log('✅ Vault object found!');
    console.log(`Status: ${vaultObj.data.owner}`);
    console.log(`Type: ${vaultObj.data.type}`);

    // Get vault content (Fields)
    const fields = (vaultObj.data.content as any).fields;
    console.log('\n📊 Vault Content:\n');
    console.log(JSON.stringify(fields, null, 2));

    // Try to get coins in the vault
    console.log('\n💰 Fetching Coins in Vault...\n');
    const coins = await client.getCoins({
      owner: VAULT_ID,
      coinType: OCT_COIN_TYPE,
    });

    if (coins.data.length === 0) {
      console.log('No OCT coins found in vault');
      return;
    }

    console.log(`Found ${coins.data.length} coin object(s):\n`);

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
    console.log(`🎯 TOTAL VAULT BALANCE: ${totalBalance.toString()} MIST`);
    console.log(`💵 TOTAL VAULT BALANCE: ${totalOCT.toFixed(2)} OCT`);
    console.log('═'.repeat(60));

  } catch (error: any) {
    console.error('\n❌ Error:');
    console.error(error.message || error);
  }
}

checkVaultBalance();
