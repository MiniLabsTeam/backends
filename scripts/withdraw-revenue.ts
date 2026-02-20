/**
 * withdraw-revenue.ts
 *
 * Withdraw accumulated OCT from the Vault to the treasury address.
 * Must be run with the admin/deployer wallet private key.
 *
 * Usage:
 *   npx ts-node backend/scripts/withdraw-revenue.ts
 *
 * Required env vars (backend/.env):
 *   ONECHAIN_RPC_URL, PACKAGE_ID, BACKEND_PRIVATE_KEY,
 *   GACHA_CONFIG_ID, GACHA_VAULT_ID
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { SuiClient, SuiHTTPTransport } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';

const OCT_TYPE = '0x2::oct::OCT';

async function main() {
  const rpcUrl        = process.env.ONECHAIN_RPC_URL;
  const packageId     = process.env.PACKAGE_ID;
  const privateKeyHex = process.env.BACKEND_PRIVATE_KEY;
  const configId      = process.env.GACHA_CONFIG_ID;
  const vaultId       = process.env.GACHA_VAULT_ID;

  if (!rpcUrl || !packageId || !privateKeyHex || !configId || !vaultId) {
    console.error('Missing required env vars:');
    if (!rpcUrl)        console.error('  - ONECHAIN_RPC_URL');
    if (!packageId)     console.error('  - PACKAGE_ID');
    if (!privateKeyHex) console.error('  - BACKEND_PRIVATE_KEY');
    if (!configId)      console.error('  - GACHA_CONFIG_ID');
    if (!vaultId)       console.error('  - GACHA_VAULT_ID');
    process.exit(1);
  }

  // Setup client
  const client = new SuiClient({
    transport: new SuiHTTPTransport({ url: rpcUrl }),
  });

  // Setup keypair from hex private key
  const rawPrivKey = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
  const keypair = Ed25519Keypair.fromSecretKey(
    Uint8Array.from(Buffer.from(rawPrivKey, 'hex'))
  );
  const adminAddress = keypair.getPublicKey().toSuiAddress();

  console.log('='.repeat(50));
  console.log('OneChain Racing — Withdraw Revenue');
  console.log('='.repeat(50));
  console.log('Admin address :', adminAddress);
  console.log('Config ID     :', configId);
  console.log('Vault ID      :', vaultId);

  // Check vault OCT balance by reading object content
  // Vault<T> embeds Balance<T> directly in struct fields, not as owned Coin objects
  let vaultBalance = '0';
  const vaultObj = await client.getObject({
    id: vaultId,
    options: { showContent: true },
  });

  const fields = (vaultObj.data?.content as any)?.fields;
  console.log('\nVault fields  :', JSON.stringify(fields, null, 2));

  // Balance<T> field can be stored as string, number, or nested object
  const rawBalance = fields?.balance ?? fields?.treasure ?? fields?.value ?? '0';
  if (typeof rawBalance === 'object' && rawBalance !== null) {
    // nested: { fields: { value: "..." } }
    vaultBalance = String(rawBalance?.fields?.value ?? rawBalance?.value ?? '0');
  } else {
    vaultBalance = String(rawBalance);
  }

  const octAmount = (Number(vaultBalance) / 1_000_000_000).toFixed(4);
  console.log(`\nVault balance : ${vaultBalance} MIST (${octAmount} OCT)`);

  if (vaultBalance === '0') {
    console.log('\nVault is empty — nothing to withdraw.');
    return;
  }

  console.log(`\nWithdrawing ${octAmount} OCT to treasury...`);

  // Get gas coins for admin wallet
  const gasCoins = await client.getCoins({ owner: adminAddress, coinType: OCT_TYPE });
  if (gasCoins.data.length === 0) {
    throw new Error('Admin wallet has no OCT for gas fees. Top up first.');
  }

  // Build transaction
  const tx = new TransactionBlock();
  tx.setSender(adminAddress);
  tx.setGasBudget(10_000_000);
  tx.setGasPayment(
    gasCoins.data.slice(0, 1).map((c: any) => ({
      objectId: c.coinObjectId,
      version:  c.version,
      digest:   c.digest,
    }))
  );

  tx.moveCall({
    target: `${packageId}::gacha::withdraw_revenue`,
    typeArguments: [OCT_TYPE],
    arguments: [
      tx.object(configId),
      tx.object(vaultId),
    ],
  });

  // Sign and execute
  const result = await client.signAndExecuteTransactionBlock({
    transactionBlock: tx,
    signer: keypair,
    options: { showEffects: true },
  });

  if (result.effects?.status?.status === 'success') {
    console.log('\n✅ Withdraw successful!');
    console.log('TX digest :', result.digest);
    console.log(`${octAmount} OCT sent to treasury.`);
  } else {
    console.error('\n❌ Withdraw failed!');
    console.error('Error:', result.effects?.status?.error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFatal:', err.message || err);
  process.exit(1);
});
