import crypto from 'crypto';
import * as ed from '@noble/ed25519';

// Generate random nonce (hex string, 32 bytes - for non-contract use)
export const generateNonce = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// Generate u64-compatible nonce (decimal string) for smart contract use
// Smart contract uses `nonce: u64`, so nonce must fit in u64 (max ~1.84 * 10^19)
export const generateU64Nonce = (): string => {
  const timestamp = BigInt(Date.now()); // ~13 digits ms
  const random = BigInt(Math.floor(Math.random() * 1_000_000));
  // timestamp * 1_000_000 + random: ~19 digits, fits in u64
  const nonce = timestamp * 1_000_000n + random;
  return nonce.toString();
};

// Generate random hash
export const generateHash = (data: string): string => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

// Generate commit hash for gacha
export const generateCommitHash = (seed: string, nonce: string): string => {
  const combined = `${seed}${nonce}`;
  return generateHash(combined);
};

// Verify Ed25519 signature
export const verifySignature = async (
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): Promise<boolean> => {
  try {
    return await ed.verifyAsync(signature, message, publicKey);
  } catch (error) {
    return false;
  }
};

// Sign message with Ed25519
export const signMessage = async (
  message: Uint8Array,
  privateKey: Uint8Array
): Promise<Uint8Array> => {
  return await ed.signAsync(message, privateKey);
};

// Convert hex string to Uint8Array
export const hexToBytes = (hex: string): Uint8Array => {
  // Remove '0x' prefix if exists
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Uint8Array.from(Buffer.from(cleanHex, 'hex'));
};

// Convert Uint8Array to hex string
export const bytesToHex = (bytes: Uint8Array): string => {
  return '0x' + Buffer.from(bytes).toString('hex');
};

// Encode message for signing
export const encodeMessage = (data: any): Uint8Array => {
  const jsonString = JSON.stringify(data);
  return new TextEncoder().encode(jsonString);
};

// Decode message
export const decodeMessage = (bytes: Uint8Array): any => {
  const jsonString = new TextDecoder().decode(bytes);
  return JSON.parse(jsonString);
};

// Generate signature payload for gacha pricing
export const createGachaPricingPayload = (
  playerAddress: string,
  tierId: number,
  tierPrice: string,
  expiresAt: number,
  nonce: string
): any => {
  return {
    player: playerAddress,
    tier_id: tierId,
    tier_price: tierPrice,
    expires_at: expiresAt,
    nonce,
  };
};

// Generate signature payload for gacha reveal
export const createGachaRevealPayload = (
  playerAddress: string,
  rarity: number,
  name: string,
  brand: number,
  stats: { speed: number; acceleration: number; handling: number; drift: number },
  nonce: string,
  isCar: boolean,
  partType?: number,
  slotLimit?: number
): any => {
  const payload: any = {
    player: playerAddress,
    rarity,
    name,
    brand,
    stats,
    nonce,
  };

  if (isCar) {
    payload.slot_limit = slotLimit;
  } else {
    payload.part_type = partType;
  }

  return payload;
};

// Generate signature payload for room creation
export const createRoomPayload = (
  roomHash: string,
  players: string[],
  entryFee: string,
  deadline: string,
  nonce: string
): any => {
  return {
    room_hash: roomHash,
    players,
    entry_fee: entryFee,
    deadline,
    nonce,
  };
};

// Generate signature payload for race result
export const createRaceResultPayload = (
  roomUid: string,
  winner: string,
  finishTime: string,
  nonce: string
): any => {
  return {
    room_uid: roomUid,
    winner,
    finish_time: finishTime,
    nonce,
  };
};

// Generate signature payload for prediction settlement
export const createPredictionSettlementPayload = (
  roomUid: string,
  actualWinner: string,
  nonce: string
): any => {
  return {
    room_uid: roomUid,
    actual_winner: actualWinner,
    nonce,
  };
};

// Validate nonce expiry
export const isNonceExpired = (timestamp: number, expiryMs: number = 300000): boolean => {
  return Date.now() - timestamp > expiryMs;
};

// Validate signature expiry
export const isSignatureExpired = (expiresAt: number): boolean => {
  return Date.now() > expiresAt;
};

export default {
  generateNonce,
  generateU64Nonce,
  generateHash,
  generateCommitHash,
  verifySignature,
  signMessage,
  hexToBytes,
  bytesToHex,
  encodeMessage,
  decodeMessage,
  createGachaPricingPayload,
  createGachaRevealPayload,
  createRoomPayload,
  createRaceResultPayload,
  createPredictionSettlementPayload,
  isNonceExpired,
  isSignatureExpired,
};
