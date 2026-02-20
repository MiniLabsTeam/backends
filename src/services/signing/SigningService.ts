import * as ed from '@noble/ed25519';
// @ts-ignore - kept for potential future use
import { getBackendKeypair } from '../../config/blockchain';
import { env } from '../../config/env';
import { prismaClient } from '../../config/database';
import {
  generateNonce,
  generateU64Nonce,
  encodeMessage,
  hexToBytes,
  bytesToHex,
  verifySignature,
  createGachaPricingPayload,
  createGachaRevealPayload,
  createRoomPayload,
  createRaceResultPayload,
  createPredictionSettlementPayload,
} from '../../utils/crypto';
import logger from '../../config/logger';

/**
 * SigningService
 *
 * CRITICAL SECURITY COMPONENT
 * This service handles all Ed25519 signing operations for backend-signed transactions.
 *
 * SECURITY RULES:
 * 1. NEVER expose private key
 * 2. NEVER sign arbitrary messages from users
 * 3. ALWAYS validate input parameters
 * 4. ALWAYS check nonce uniqueness (anti-replay)
 * 5. ALWAYS set signature expiry
 */
export class SigningService {
  private static instance: SigningService;

  private constructor() {
    logger.info('🔐 SigningService initialized');
  }

  public static getInstance(): SigningService {
    if (!SigningService.instance) {
      SigningService.instance = new SigningService();
    }
    return SigningService.instance;
  }

  /**
   * Check if nonce has been used (anti-replay protection)
   */
  private async isNonceUsed(nonce: string): Promise<boolean> {
    const existing = await prismaClient.usedNonce.findUnique({
      where: { nonce },
    });
    return existing !== null;
  }

  /**
   * Mark nonce as used
   */
  private async markNonceUsed(nonce: string, usedBy: string): Promise<void> {
    await prismaClient.usedNonce.create({
      data: {
        nonce,
        usedBy,
      },
    });
  }

  /**
   * Sign a message with backend private key
   */
  private async sign(payload: any): Promise<{ signature: string; message: string; nonce: string }> {
    try {
      const messageBytes = encodeMessage(payload);

      // Use raw 32-byte private key from env directly.
      // keypair.getSecretKey() in newer @mysten/sui.js returns a base64 string
      // which @noble/ed25519 rejects with "hex invalid". Bypass it entirely.
      const rawHex = env.backendPrivateKey.startsWith('0x')
        ? env.backendPrivateKey.slice(2)
        : env.backendPrivateKey;
      const privateKeyBytes = Uint8Array.from(Buffer.from(rawHex, 'hex'));

      const signatureBytes = await ed.signAsync(messageBytes, privateKeyBytes);

      return {
        signature: bytesToHex(signatureBytes),
        message: bytesToHex(messageBytes),
        nonce: payload.nonce,
      };
    } catch (error) {
      logger.error('Failed to sign message:', error);
      throw new Error('Signing failed');
    }
  }

  /**
   * Verify a signature
   */
  public async verify(
    message: string,
    signature: string,
    publicKey?: string
  ): Promise<boolean> {
    try {
      const pubKey = publicKey
        ? hexToBytes(publicKey)
        : hexToBytes(env.backendPublicKey);

      const messageBytes = hexToBytes(message);
      const signatureBytes = hexToBytes(signature);

      return await verifySignature(messageBytes, signatureBytes, pubKey);
    } catch (error) {
      logger.error('Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Sign gacha pricing (commit phase)
   * Returns signed payload that client sends to smart contract
   */
  public async signGachaPricing(
    playerAddress: string,
    tierId: number,
    tierPrice: string
  ): Promise<{
    signature: string;
    message: string;
    nonce: string;
    expiresAt: number;
    tierId: number;
    tierPrice: string;
  }> {
    // Validate inputs
    if (tierId < 1 || tierId > 3) {
      throw new Error('Invalid tier ID');
    }

    if (BigInt(tierPrice) <= 0) {
      throw new Error('Invalid tier price');
    }

    // Generate u64-compatible nonce (for smart contract)
    const nonce = generateU64Nonce();

    // Set expiry in SECONDS (smart contract compares clock timestamp in seconds)
    const expiresAt = Math.floor((Date.now() + env.signatureExpiryMs) / 1000);

    // Create payload
    const payload = createGachaPricingPayload(
      playerAddress,
      tierId,
      tierPrice,
      expiresAt,
      nonce
    );

    // Sign
    const { signature, message } = await this.sign(payload);

    logger.info(`Signed gacha pricing for player ${playerAddress}, tier ${tierId}`);

    return {
      signature,
      message,
      nonce,
      expiresAt,
      tierId,
      tierPrice,
    };
  }

  /**
   * Sign gacha reveal (reveal phase)
   * Called after commit to reveal the gacha result
   */
  public async signGachaReveal(
    playerAddress: string,
    rarity: number,
    name: string,
    brand: number,
    stats: { speed: number; acceleration: number; handling: number; drift: number },
    isCar: boolean,
    partType?: number,
    slotLimit?: number
  ): Promise<{
    signature: string;
    message: string;
    nonce: string;
  }> {
    // Validate inputs
    if (rarity < 0 || rarity > 3) {
      throw new Error('Invalid rarity');
    }

    if (brand < 0 || brand > 3) {
      throw new Error('Invalid brand');
    }

    if (!isCar && (partType === undefined || partType < 0 || partType > 3)) {
      throw new Error('Invalid part type');
    }

    if (isCar && (slotLimit === undefined || slotLimit < 2 || slotLimit > 4)) {
      throw new Error('Invalid slot limit');
    }

    // Generate u64-compatible nonce (for smart contract)
    const nonce = generateU64Nonce();

    // Create payload
    const payload = createGachaRevealPayload(
      playerAddress,
      rarity,
      name,
      brand,
      stats,
      nonce,
      isCar,
      partType,
      slotLimit
    );

    // Sign
    const { signature, message } = await this.sign(payload);

    // Mark nonce as used
    await this.markNonceUsed(nonce, 'gacha_reveal');

    logger.info(`Signed gacha reveal for player ${playerAddress}, rarity ${rarity}`);

    return {
      signature,
      message,
      nonce,
    };
  }

  /**
   * Sign room creation
   * Only backend can create rooms to prevent spam
   */
  public async signRoomCreation(
    roomHash: string,
    players: string[],
    entryFee: string,
    deadline: string
  ): Promise<{
    signature: string;
    message: string;
    nonce: string;
  }> {
    // Validate inputs
    if (players.length < 2 || players.length > 8) {
      throw new Error('Invalid player count');
    }

    if (BigInt(entryFee) < 0) {
      throw new Error('Invalid entry fee');
    }

    // Generate nonce
    const nonce = generateNonce();

    // Create payload
    const payload = createRoomPayload(roomHash, players, entryFee, deadline, nonce);

    // Sign
    const { signature, message } = await this.sign(payload);

    // Mark nonce as used
    await this.markNonceUsed(nonce, 'room_creation');

    logger.info(`Signed room creation with ${players.length} players`);

    return {
      signature,
      message,
      nonce,
    };
  }

  /**
   * Sign race result
   * Called by game engine after race finishes
   */
  public async signRaceResult(
    roomUid: string,
    winner: string,
    finishTime: string
  ): Promise<{
    signature: string;
    message: string;
    nonce: string;
  }> {
    // Generate nonce
    const nonce = generateNonce();

    // Create payload
    const payload = createRaceResultPayload(roomUid, winner, finishTime, nonce);

    // Sign
    const { signature, message } = await this.sign(payload);

    // Mark nonce as used
    await this.markNonceUsed(nonce, 'race_result');

    logger.info(`Signed race result for room ${roomUid}, winner ${winner}`);

    return {
      signature,
      message,
      nonce,
    };
  }

  /**
   * Sign prediction settlement
   * Called after race finishes to settle prediction pool
   */
  public async signPredictionSettlement(
    roomUid: string,
    actualWinner: string
  ): Promise<{
    signature: string;
    message: string;
    nonce: string;
  }> {
    // Generate nonce
    const nonce = generateNonce();

    // Create payload
    const payload = createPredictionSettlementPayload(roomUid, actualWinner, nonce);

    // Sign
    const { signature, message } = await this.sign(payload);

    // Mark nonce as used
    await this.markNonceUsed(nonce, 'prediction_settlement');

    logger.info(`Signed prediction settlement for room ${roomUid}`);

    return {
      signature,
      message,
      nonce,
    };
  }

  /**
   * Validate signature from client (for verifying user signatures)
   */
  public async validateClientSignature(
    _message: string,
    _signature: string,
    _expectedAddress: string
  ): Promise<boolean> {
    // This would verify a signature made by the user's wallet
    // Implementation depends on the wallet's signature scheme
    // For now, this is a placeholder
    logger.warn('Client signature validation not fully implemented');
    return true; // TODO: Implement proper verification
  }

  /**
   * Check if a nonce has already been used
   */
  public async checkNonce(nonce: string): Promise<boolean> {
    return await this.isNonceUsed(nonce);
  }
}

// Export singleton instance
export const signingService = SigningService.getInstance();
export default signingService;
