/**
 * Initialize ALL OneChain Contract Objects
 * Creates: Config, Vault, GachaState in ONE transaction
 */

import { SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import * as dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.ONECHAIN_RPC_URL || 'https://rpc-testnet.onelabs.cc:443';
const PACKAGE_ID = process.env.PACKAGE_ID;
const PRIVATE_KEY = process.env.BACKEND_PRIVATE_KEY;
const BACKEND_PUBLIC_KEY = process.env.BACKEND_PUBLIC_KEY;
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS;

const DEFAULT_PRICE = process.env.GACHA_TIER_1_PRICE || '2000000000';
const MAX_DISCOUNT = process.env.GACHA_MAX_DISCOUNT_PERCENT || '50';

async function main() {
  console.log('🚀 Initializing ALL OneChain Contract Objects...\n');

  if (!PACKAGE_ID || !PRIVATE_KEY || !BACKEND_PUBLIC_KEY || !TREASURY_ADDRESS) {
    throw new Error('❌ Missing environment variables in .env');
  }

  const client = new SuiClient({ url: RPC_URL });
  const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(PRIVATE_KEY.replace('0x', ''), 'hex'));
  const sender = keypair.toSuiAddress();

  console.log(`📦 Package ID: ${PACKAGE_ID}`);
  console.log(`👤 Sender: ${sender}`);
  console.log(`🏦 Treasury: ${TREASURY_ADDRESS}\n`);

  // Get gas coins
  const coins = await client.getCoins({ owner: sender, coinType: '0x2::oct::OCT' });
  if (coins.data.length === 0) throw new Error('No coins found');

  const tx = new TransactionBlock();
  tx.setGasPayment([{
    objectId: coins.data[0].coinObjectId,
    version: coins.data[0].version,
    digest: coins.data[0].digest,
  }]);

  console.log('📝 Creating 3 shared objects in ONE transaction:\n');

  // 1. Config
  console.log('1️⃣ config::initialize()');
  const backendPubkeyBytes = Array.from(Buffer.from(BACKEND_PUBLIC_KEY, 'base64'));
  tx.moveCall({
    target: `${PACKAGE_ID}::config::initialize`,
    arguments: [
      tx.pure(backendPubkeyBytes, 'vector<u8>'),
      tx.pure(TREASURY_ADDRESS, 'address'),
    ],
  });

  // 2. Vault
  console.log('2️⃣ coin_vault::create<OCT>()');
  tx.moveCall({
    target: `${PACKAGE_ID}::coin_vault::create`,
    typeArguments: ['0x2::oct::OCT'],
    arguments: [],
  });

  // 3. GachaState
  console.log('3️⃣ gacha::initialize<OCT>()');
  tx.moveCall({
    target: `${PACKAGE_ID}::gacha::initialize`,
    typeArguments: ['0x2::oct::OCT'],
    arguments: [
      tx.pure(DEFAULT_PRICE, 'u64'),
      tx.pure(MAX_DISCOUNT, 'u8'),
    ],
  });

  console.log('\n⏳ Executing transaction...\n');

  try {
    const result = await client.signAndExecuteTransactionBlock({
      signer: keypair,
      transactionBlock: tx,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    console.log('✅ Transaction successful!\n');
    console.log(`📋 Digest: ${result.digest}\n`);

    const objectChanges = result.objectChanges || [];

    console.log('📦 Created Objects:');
    objectChanges.forEach((change) => {
      if (change.type === 'created') {
        console.log(`   Type: ${change.objectType}`);
        console.log(`   ID: ${change.objectId}\n`);
      }
    });

    let configId = '';
    let stateId = '';
    let vaultId = '';

    for (const change of objectChanges) {
      if (change.type === 'created') {
        const type = change.objectType;
        const id = change.objectId;

        if (type.includes('::config::Config')) {
          configId = id;
          console.log(`✅ Config: ${id}`);
        } else if (type.includes('::gacha::GachaState')) {
          stateId = id;
          console.log(`✅ GachaState: ${id}`);
        } else if (type.includes('::coin_vault::Vault')) {
          vaultId = id;
          console.log(`✅ Vault: ${id}`);
        }
      }
    }

    console.log('\n╭────────────────────────────────────────────────────────────╮');
    console.log('│  COPY THESE TO YOUR .env FILES:                           │');
    console.log('╰────────────────────────────────────────────────────────────╯\n');

    console.log('backend/.env:');
    console.log(`GACHA_CONFIG_ID=${configId}`);
    console.log(`GACHA_STATE_ID=${stateId}`);
    console.log(`GACHA_VAULT_ID=${vaultId}\n`);

    console.log('frontend/.env:');
    console.log(`NEXT_PUBLIC_CONFIG_ID=${configId}`);
    console.log(`NEXT_PUBLIC_GACHA_STATE_ID=${stateId}`);
    console.log(`NEXT_PUBLIC_VAULT_ID=${vaultId}\n`);

    console.log('✅ All contract objects initialized successfully!');
  } catch (error: any) {
    console.error('❌ Transaction failed:', error.message || error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
