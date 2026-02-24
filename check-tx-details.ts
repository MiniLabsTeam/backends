import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { SuiClient, SuiHTTPTransport } from '@mysten/sui.js/client';

const RPC_URL = process.env.ONECHAIN_RPC_URL || 'https://rpc-testnet.onelabs.cc:443';
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS;

const client = new SuiClient({
  transport: new SuiHTTPTransport({
    url: RPC_URL,
  }),
});

async function checkTxDetails() {
  try {
    console.log('\n🔍 Checking Transaction Details...\n');

    // Transaction yang berhasil dari database
    const txDigest = 'C1KRpUKcm5Jvo9WWB59ycc6NaoBd44hAZbJViXbxCXES';

    console.log(`TX Digest: ${txDigest}`);
    console.log(`Treasury: ${TREASURY_ADDRESS}\n`);

    const txResponse = await client.getTransactionBlock({
      digest: txDigest,
      options: {
        showBalanceChanges: true,
        showInput: true,
        showEffects: true,
        showObjectChanges: true,
      },
    });

    console.log('═'.repeat(60));
    console.log('📋 TRANSACTION STATUS');
    console.log('═'.repeat(60));
    console.log(`Status: ${txResponse.effects?.status?.status}`);
    if (txResponse.effects?.status?.error) {
      console.log(`Error: ${txResponse.effects.status.error}`);
    }

    // Balance changes
    console.log('\n💰 BALANCE CHANGES:\n');
    if (txResponse.balanceChanges && txResponse.balanceChanges.length > 0) {
      txResponse.balanceChanges.forEach((change: any, i: number) => {
        console.log(`${i + 1}. Coin Type: ${change.coinType}`);
        console.log(`   Amount: ${change.amount}`);
        if (change.owner?.AddressOwner) {
          console.log(`   Owner: ${change.owner.AddressOwner}`);
        } else if (change.owner?.ObjectOwner) {
          console.log(`   Owner (Object): ${change.owner.ObjectOwner}`);
        }
        console.log('');
      });
    } else {
      console.log('No balance changes');
    }

    // Object changes
    console.log('\n🔧 OBJECT CHANGES:\n');
    if (txResponse.objectChanges && txResponse.objectChanges.length > 0) {
      txResponse.objectChanges.forEach((change: any, i: number) => {
        console.log(`${i + 1}. Type: ${change.type}`);
        if (change.type === 'created') {
          console.log(`   Object ID: ${change.objectId}`);
          console.log(`   Object Type: ${change.objectType}`);
        } else if (change.type === 'mutated') {
          console.log(`   Object ID: ${change.objectId}`);
          console.log(`   Object Type: ${change.objectType}`);
        }
        console.log('');
      });
    } else {
      console.log('No object changes');
    }

    // Input (Transaction data)
    console.log('\n📤 TRANSACTION INPUT:\n');
    console.log(`Sender: ${txResponse.transaction?.data?.sender}`);
    if (txResponse.transaction?.data?.gasData) {
      console.log(`Gas Budget: ${txResponse.transaction.data.gasData.budget}`);
    }

  } catch (error: any) {
    console.error('\n❌ Error:');
    console.error(error.message || error);
  }
}

checkTxDetails();
