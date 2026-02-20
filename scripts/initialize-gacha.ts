/**
 * Initialize Gacha Contract on OneChain
 *
 * Creates shared objects (Config, GachaState, Vault) and prints IDs to copy to .env
 *
 * Usage:
 *   npx ts-node backend/scripts/initialize-gacha.ts
 */

import { SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const RPC_URL = process.env.ONECHAIN_RPC_URL || 'https://rpc-testnet.onelabs.cc:443';
const PACKAGE_ID = process.env.PACKAGE_ID;
const PRIVATE_KEY = process.env.BACKEND_PRIVATE_KEY;

// Gacha settings (in MIST - 9 decimals for OCT)
const DEFAULT_PRICE = process.env.GACHA_TIER_1_PRICE || '2000000000'; // 2 OCT (default price)
const MAX_DISCOUNT = process.env.GACHA_MAX_DISCOUNT_PERCENT || '50';

async function main() {
  console.log('🚀 Initializing Gacha Contract on OneChain...\n');

  // Validate environment
  if (!PACKAGE_ID) {
    throw new Error('❌ PACKAGE_ID not found in .env');
  }
  if (!PRIVATE_KEY) {
    throw new Error('❌ BACKEND_PRIVATE_KEY not found in .env');
  }

  console.log(`📦 Package ID: ${PACKAGE_ID}`);
  console.log(`🔗 RPC URL: ${RPC_URL}\n`);

  // Initialize Sui client and keypair
  const client = new SuiClient({ url: RPC_URL });
  const keypair = Ed25519Keypair.fromSecretKey(
    Buffer.from(PRIVATE_KEY.replace('0x', ''), 'hex')
  );
  const sender = keypair.toSuiAddress();

  console.log(`👤 Sender Address: ${sender}\n`);

  // Check balance
  const balance = await client.getBalance({ owner: sender });
  console.log(`💰 Balance: ${balance.totalBalance} MIST (${Number(balance.totalBalance) / 1_000_000_000} OCT)\n`);

  if (BigInt(balance.totalBalance) < 1_000_000_000n) {
    console.warn('⚠️  Warning: Low balance. You may need more OCT tokens.\n');
  }

  // Get gas coins manually
  const coins = await client.getCoins({ owner: sender, coinType: '0x2::oct::OCT' });
  console.log(`🪙 Found ${coins.data.length} coin object(s)\n`);

  if (coins.data.length === 0) {
    throw new Error('No coins found. Please request tokens from faucet.');
  }

  // Use the first available coin as gas
  const gasCoin = coins.data[0];
  console.log(`⛽ Using gas coin: ${gasCoin.coinObjectId.substring(0, 20)}... (${gasCoin.balance} MIST)\n`);

  // Create transaction to initialize gacha
  const tx = new TransactionBlock();

  // Manually set gas payment
  tx.setGasPayment([{
    objectId: gasCoin.coinObjectId,
    version: gasCoin.version,
    digest: gasCoin.digest,
  }]);

  tx.moveCall({
    target: `${PACKAGE_ID}::gacha::initialize`,
    typeArguments: ['0x2::oct::OCT'],
    arguments: [
      tx.pure(DEFAULT_PRICE, 'u64'), // default_pull_price
      tx.pure(MAX_DISCOUNT, 'u8'),  // max_discount_percent
    ],
  });

  console.log('📝 Transaction Details:');
  console.log(`   Function: ${PACKAGE_ID}::gacha::initialize<OCT>`);
  console.log(`   Default Price: ${DEFAULT_PRICE} MIST (${Number(DEFAULT_PRICE) / 1_000_000_000} OCT)`);
  console.log(`   Max Discount: ${MAX_DISCOUNT}%\n`);

  // Execute transaction
  console.log('⏳ Executing transaction...\n');

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

    // Parse created objects
    const objectChanges = result.objectChanges || [];

    console.log('📦 All Created Objects:');
    objectChanges.forEach((change, i) => {
      if (change.type === 'created') {
        console.log(`   ${i + 1}. Type: ${change.objectType}`);
        console.log(`      ID: ${change.objectId}\n`);
      }
    });

    let configId = '';
    let stateId = '';
    let vaultId = '';

    for (const change of objectChanges) {
      if (change.type === 'created') {
        const objectType = change.objectType;
        const objectId = change.objectId;

        // More flexible matching
        if (objectType.includes('Config')) {
          configId = objectId;
          console.log(`✅ Config Found: ${objectId}`);
        }
        if (objectType.includes('GachaState')) {
          stateId = objectId;
          console.log(`✅ GachaState Found: ${objectId}`);
        }
        if (objectType.includes('Vault')) {
          vaultId = objectId;
          console.log(`✅ Vault Found: ${objectId}`);
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

    console.log('✅ Gacha contract initialized successfully!');

  } catch (error: any) {
    console.error('❌ Transaction failed:', error.message || error);

    if (error.message?.includes('InsufficientGas')) {
      console.error('\n💡 Solution: Request more tokens from faucet');
      console.error('   curl --location --request POST "https://faucet-testnet.onelabs.cc/gas" \\');
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
