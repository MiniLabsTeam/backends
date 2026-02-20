/**
 * Fix Backend Public Key in Config
 *
 * Problem: Config stores 33-byte Sui format key (0x00 prefix + 32-byte raw pubkey)
 * But ed25519::ed25519_verify expects 32-byte raw public key only
 *
 * This script updates the Config to store the correct 32-byte raw Ed25519 public key
 */

import { SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import * as ed from '@noble/ed25519';
import * as dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.ONECHAIN_RPC_URL || 'https://rpc-testnet.onelabs.cc:443';
const PACKAGE_ID = process.env.PACKAGE_ID;
const GACHA_CONFIG_ID = process.env.GACHA_CONFIG_ID;
const PRIVATE_KEY = process.env.BACKEND_PRIVATE_KEY;
const BACKEND_PUBLIC_KEY = process.env.BACKEND_PUBLIC_KEY;

async function main() {
  console.log('🔧 Fixing Backend Public Key in Config...\n');

  if (!PACKAGE_ID || !GACHA_CONFIG_ID || !PRIVATE_KEY || !BACKEND_PUBLIC_KEY) {
    throw new Error('Missing environment variables');
  }

  // Show current key (Sui format - 33 bytes with 0x00 prefix)
  const suiFormatKey = Buffer.from(BACKEND_PUBLIC_KEY, 'base64');
  console.log(`📋 Current Sui format key (base64): ${BACKEND_PUBLIC_KEY}`);
  console.log(`   Bytes (hex): ${suiFormatKey.toString('hex')}`);
  console.log(`   Length: ${suiFormatKey.length} bytes`);
  console.log(`   First byte (scheme flag): 0x${suiFormatKey[0].toString(16).padStart(2, '0')}\n`);

  // Derive raw 32-byte Ed25519 public key from private key
  const rawHex = PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY.slice(2) : PRIVATE_KEY;
  const privateKeyBytes = Uint8Array.from(Buffer.from(rawHex, 'hex'));
  const rawPubkey = await ed.getPublicKeyAsync(privateKeyBytes);

  console.log(`✅ Raw Ed25519 public key (32 bytes):`);
  console.log(`   Hex: ${Buffer.from(rawPubkey).toString('hex')}`);
  console.log(`   Length: ${rawPubkey.length} bytes\n`);

  // Also show the stripped version (remove first byte from Sui format)
  const strippedKey = suiFormatKey.slice(1); // Remove 0x00 prefix
  console.log(`📋 Stripped Sui key (remove 0x00 prefix):`);
  console.log(`   Hex: ${strippedKey.toString('hex')}`);
  console.log(`   Length: ${strippedKey.length} bytes`);
  console.log(`   Match with derived? ${Buffer.from(rawPubkey).equals(strippedKey) ? '✅ YES' : '❌ NO'}\n`);

  // Update Config with correct 32-byte raw public key
  const client = new SuiClient({ url: RPC_URL });
  const keypair = Ed25519Keypair.fromSecretKey(
    Buffer.from(PRIVATE_KEY.replace('0x', ''), 'hex')
  );
  const sender = keypair.toSuiAddress();

  console.log(`👤 Admin address: ${sender}\n`);

  // Get gas coins
  const coins = await client.getCoins({ owner: sender, coinType: '0x2::oct::OCT' });
  if (coins.data.length === 0) {
    throw new Error('No coins found');
  }

  const tx = new TransactionBlock();
  tx.setGasPayment([{
    objectId: coins.data[0].coinObjectId,
    version: coins.data[0].version,
    digest: coins.data[0].digest,
  }]);

  // Call set_backend_pubkey with correct 32-byte raw key
  tx.moveCall({
    target: `${PACKAGE_ID}::config::set_backend_pubkey`,
    arguments: [
      tx.object(GACHA_CONFIG_ID),
      tx.pure(Array.from(rawPubkey), 'vector<u8>'),  // 32-byte raw Ed25519 pubkey
    ],
  });

  console.log('⏳ Executing set_backend_pubkey transaction...\n');

  try {
    const result = await client.signAndExecuteTransactionBlock({
      signer: keypair,
      transactionBlock: tx,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    console.log('✅ Transaction successful!');
    console.log(`📋 Digest: ${result.digest}\n`);

    // Show events
    if (result.events && result.events.length > 0) {
      console.log('📢 Events:');
      result.events.forEach((ev: any) => {
        console.log(`   ${ev.type}: ${JSON.stringify(ev.parsedJson)}`);
      });
    }

    console.log('\n✅ Backend public key updated to 32-byte raw Ed25519 format!');
    console.log('🎰 Gacha should now work correctly!');

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
