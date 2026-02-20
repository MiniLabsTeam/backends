/**
 * Test Gacha Commit Dry Run
 * Simulates what the frontend does, but from backend
 * This gives us DETAILED error messages instead of "All endpoints failed"
 */

import { SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import * as dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.ONECHAIN_RPC_URL || 'https://rpc-testnet.onelabs.cc:443';
const PACKAGE_ID = process.env.PACKAGE_ID;
const GACHA_CONFIG_ID = process.env.GACHA_CONFIG_ID;
const GACHA_STATE_ID = process.env.GACHA_STATE_ID;
const GACHA_VAULT_ID = process.env.GACHA_VAULT_ID;
const PRIVATE_KEY = process.env.BACKEND_PRIVATE_KEY;

async function main() {
  console.log('🧪 Testing Gacha Commit Dry Run...\n');

  console.log('📦 Config:');
  console.log(`   PACKAGE_ID: ${PACKAGE_ID}`);
  console.log(`   CONFIG_ID: ${GACHA_CONFIG_ID}`);
  console.log(`   STATE_ID: ${GACHA_STATE_ID}`);
  console.log(`   VAULT_ID: ${GACHA_VAULT_ID}`);
  console.log(`   RPC: ${RPC_URL}\n`);

  const client = new SuiClient({ url: RPC_URL });

  // Test 1: Check RPC connectivity
  console.log('--- Test 1: RPC Connectivity ---');
  try {
    const checkpoint = await client.getLatestCheckpointSequenceNumber();
    console.log(`✅ RPC OK. Latest checkpoint: ${checkpoint}\n`);
  } catch (e: any) {
    console.error(`❌ RPC FAILED: ${e.message}\n`);
    return;
  }

  // Test 2: Check shared objects exist
  console.log('--- Test 2: Shared Objects Exist ---');
  for (const [name, id] of [
    ['Config', GACHA_CONFIG_ID],
    ['GachaState', GACHA_STATE_ID],
    ['Vault', GACHA_VAULT_ID],
  ]) {
    try {
      const obj = await client.getObject({ id: id!, options: { showType: true, showOwner: true } });
      if (obj.data) {
        console.log(`✅ ${name}: ${id}`);
        console.log(`   Type: ${obj.data.type}`);
        console.log(`   Owner: ${JSON.stringify(obj.data.owner)}`);
        console.log(`   Version: ${obj.data.version}\n`);
      } else {
        console.log(`❌ ${name}: Object NOT FOUND! ID: ${id}`);
        if (obj.error) console.log(`   Error: ${JSON.stringify(obj.error)}\n`);
      }
    } catch (e: any) {
      console.error(`❌ ${name}: Failed to fetch - ${e.message}\n`);
    }
  }

  // Test 3: Check backend wallet balance
  const keypair = Ed25519Keypair.fromSecretKey(
    Buffer.from(PRIVATE_KEY!.replace('0x', ''), 'hex')
  );
  const backendAddress = keypair.toSuiAddress();
  console.log('--- Test 3: Backend Wallet ---');
  console.log(`   Address: ${backendAddress}`);
  try {
    const balance = await client.getBalance({ owner: backendAddress });
    console.log(`   Balance: ${balance.totalBalance} MIST (${Number(balance.totalBalance) / 1e9} OCT)\n`);
  } catch (e: any) {
    console.error(`   Balance check failed: ${e.message}\n`);
  }

  // Test 4: Try dry run a simple commit transaction
  console.log('--- Test 4: Dry Run Commit Transaction ---');
  try {
    const coins = await client.getCoins({ owner: backendAddress, coinType: '0x2::oct::OCT' });
    if (coins.data.length === 0) {
      console.error('❌ No coins found for backend wallet\n');
      return;
    }

    const tx = new TransactionBlock();
    tx.setSender(backendAddress);
    tx.setGasPayment([{
      objectId: coins.data[0].coinObjectId,
      version: coins.data[0].version,
      digest: coins.data[0].digest,
    }]);

    // Simple test: just try to access the shared objects
    // We'll call a read-only operation or just build the transaction
    const tierPrice = '2000000000';
    const commitHash = Array.from(new Uint8Array(32).fill(1)); // dummy hash

    // Generate a real signature for testing
    const SigningService = await import('../src/services/signing/SigningService');
    const signingService = SigningService.default;

    const pricingResult = await signingService.signGachaPricing(backendAddress, 1, tierPrice);
    console.log(`   Pricing signed OK: nonce=${pricingResult.nonce}, expiresAt=${pricingResult.expiresAt}`);

    const sigBytes = Array.from(Buffer.from(pricingResult.signature.replace('0x', ''), 'hex'));
    const msgBytes = Array.from(Buffer.from(pricingResult.message.replace('0x', ''), 'hex'));

    const [payment] = tx.splitCoins(tx.gas, [tx.pure(tierPrice, 'u64')]);

    tx.moveCall({
      target: `${PACKAGE_ID}::gacha::commit`,
      typeArguments: ['0x2::oct::OCT'],
      arguments: [
        tx.object(GACHA_STATE_ID!),
        tx.object(GACHA_CONFIG_ID!),
        tx.object(GACHA_VAULT_ID!),
        tx.pure(commitHash, 'vector<u8>'),
        tx.pure(false, 'bool'),
        tx.pure(0, 'u8'),
        tx.pure(tierPrice, 'u64'),
        tx.pure(pricingResult.expiresAt, 'u64'),
        tx.pure(pricingResult.nonce, 'u64'),
        tx.pure(sigBytes, 'vector<u8>'),
        tx.pure(msgBytes, 'vector<u8>'),
        payment,
        tx.object('0x6'),
      ],
    });

    console.log('   Transaction built. Attempting dry run...\n');

    const dryRunResult = await client.dryRunTransactionBlock({
      transactionBlock: await tx.build({ client }),
    });

    console.log(`   Status: ${dryRunResult.effects.status.status}`);
    if (dryRunResult.effects.status.status === 'failure') {
      console.log(`   ❌ Error: ${dryRunResult.effects.status.error}`);
    } else {
      console.log(`   ✅ Dry run SUCCESS!`);
    }
    console.log(`   Gas used: ${JSON.stringify(dryRunResult.effects.gasUsed)}\n`);

  } catch (e: any) {
    console.error(`❌ Dry run FAILED: ${e.message}`);
    if (e.cause) console.error(`   Cause: ${JSON.stringify(e.cause)}`);
    console.error(`   Full error:`, e);
  }

  console.log('\n✅ Test complete!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
