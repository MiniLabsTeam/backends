import crypto from 'crypto';
import { prismaClient } from '../../config/database';
import { cache } from '../../config/redis';
import { Rarity } from '../../config/blockchain';
import { signingService } from '../signing/SigningService';
import logger from '../../config/logger';
import {
  getTier,
  isValidTier,
  getTierPrice,
  calculateDiscountedPrice,
  getSlotLimit,
  TierConfig,
} from './GachaTiers';
import { GachaRNG } from './GachaRNG';
import { GachaNames } from './GachaNames';
import { generateCommitHash } from '../../utils/crypto';

/**
 * GachaService
 *
 * Main gacha service implementing commit-reveal mechanism with backend pricing.
 *
 * Flow:
 * 1. Client requests pricing for a tier
 * 2. Backend signs pricing (tier_id, tier_price, expiry, nonce)
 * 3. Client commits gacha pull with signed pricing
 * 4. Backend generates result and signs reveal
 * 5. Client calls reveal with signed result
 * 6. NFT is minted on-chain
 */
export class GachaService {
  private static instance: GachaService;

  private constructor() {
    logger.info('🎰 GachaService initialized');
  }

  public static getInstance(): GachaService {
    if (!GachaService.instance) {
      GachaService.instance = new GachaService();
    }
    return GachaService.instance;
  }

  /**
   * Get pricing for a tier (with backend signature)
   */
  public async getPricing(
    playerAddress: string,
    tierId: number,
    discountPercent: number = 0
  ): Promise<{
    tierId: number;
    tierPrice: string;
    signature: string;
    message: string;
    nonce: string;
    expiresAt: number;
  }> {
    // Validate tier
    if (!isValidTier(tierId)) {
      throw new Error(`Invalid tier ID: ${tierId}`);
    }

    // Calculate price (with optional discount)
    const tierPrice =
      discountPercent > 0
        ? calculateDiscountedPrice(tierId, discountPercent)
        : getTierPrice(tierId);

    // Sign pricing
    const signed = await signingService.signGachaPricing(
      playerAddress,
      tierId,
      tierPrice
    );

    logger.info(
      `Pricing generated for ${playerAddress}: Tier ${tierId}, Price ${tierPrice}`
    );

    return signed;
  }

  /**
   * Process gacha commit (after on-chain commit)
   * Generate the result and store it for reveal
   */
  public async processCommit(
    playerAddress: string,
    tierId: number,
    commitHash: string
  ): Promise<{
    seed: string;
    commitHash: string;
  }> {
    // Validate tier
    const tier = getTier(tierId);
    if (!tier) {
      throw new Error(`Invalid tier: ${tierId}`);
    }

    // Generate random seed
    const seed = GachaRNG.generateSeed();

    // Verify commit hash matches (optional - for extra security)
    const expectedHash = generateCommitHash(seed, playerAddress);
    // Note: In production, you might want to verify this matches commitHash

    // Store seed in cache (expires in 10 minutes)
    const cacheKey = `gacha:commit:${playerAddress}:${commitHash}`;
    await cache.set(cacheKey, { seed, tierId }, 600);

    logger.info(`Gacha commit processed for ${playerAddress}: ${commitHash}`);

    return {
      seed,
      commitHash,
    };
  }

  /**
   * Generate reveal data (called after commit is confirmed on-chain)
   */
  public async generateReveal(
    playerAddress: string,
    tierId: number,
    forcedIsCar?: boolean
  ): Promise<{
    isCar: boolean;
    rarity: Rarity;
    brand: number;
    name: string;
    stats: {
      speed: number;
      acceleration: number;
      handling: number;
      drift: number;
    };
    partType?: number;
    slotLimit?: number;
    signature: string;
    message: string;
    nonce: string;
  }> {
    // Validate tier
    const tier = getTier(tierId);
    if (!tier) {
      throw new Error(`Invalid tier: ${tierId}`);
    }

    // Generate gacha result (use forced is_car if provided, else roll randomly)
    const result = this.rollGacha(tier, forcedIsCar);

    // Sign reveal
    const signed = await signingService.signGachaReveal(
      playerAddress,
      result.rarity,
      result.name,
      result.brand,
      result.stats,
      result.isCar,
      result.partType,
      result.slotLimit
    );

    // Save result to database so inventory is populated
    const uid = crypto.randomUUID();
    const tierPrice = getTierPrice(tierId);

    if (result.isCar) {
      await prismaClient.car.create({
        data: {
          uid,
          owner: playerAddress,
          name: result.name,
          brand: result.brand,
          rarity: result.rarity,
          slotLimit: result.slotLimit ?? 2,
          baseSpeed: result.stats.speed,
          baseAcceleration: result.stats.acceleration,
          baseHandling: result.stats.handling,
          baseDrift: result.stats.drift,
        },
      });
    } else {
      await prismaClient.sparePart.create({
        data: {
          uid,
          owner: playerAddress,
          name: result.name,
          partType: result.partType ?? 0,
          rarity: result.rarity,
          compatibleBrand: result.brand,
          bonusSpeed: result.stats.speed,
          bonusAcceleration: result.stats.acceleration,
          bonusHandling: result.stats.handling,
          bonusDrift: result.stats.drift,
        },
      });
    }

    // Record gacha history
    await prismaClient.gachaHistory.create({
      data: {
        player: playerAddress,
        tierId,
        tierPrice,
        result: result.isCar ? 'CAR' : 'SPAREPART',
        resultUid: uid,
        rarity: result.rarity,
        revealNonce: signed.nonce,
        revealedAt: new Date(),
      },
    });

    logger.info(
      `Gacha reveal generated for ${playerAddress}: ${result.isCar ? 'Car' : 'SparePart'}, ${result.name}`
    );

    return {
      ...result,
      ...signed,
    };
  }

  /**
   * Roll gacha (internal - generates random result)
   */
  private rollGacha(tier: TierConfig, forcedIsCar?: boolean): {
    isCar: boolean;
    rarity: Rarity;
    brand: number;
    name: string;
    stats: {
      speed: number;
      acceleration: number;
      handling: number;
      drift: number;
    };
    partType?: number;
    slotLimit?: number;
  } {
    // Roll rarity
    const rarity = GachaRNG.rollRarity(tier);

    // Roll car vs sparepart (use forced value if provided from on-chain commit)
    const isCar = forcedIsCar !== undefined ? forcedIsCar : GachaRNG.rollIsCar(tier);

    // Roll brand
    const brand = GachaRNG.rollBrand();

    if (isCar) {
      // Generate car
      const stats = GachaRNG.generateBalancedStats(rarity);
      const slotLimit = getSlotLimit(rarity);
      const name = GachaNames.generateUniqueCarName(brand, rarity);

      return {
        isCar: true,
        rarity,
        brand,
        name,
        stats,
        slotLimit,
      };
    } else {
      // Generate sparepart
      const partType = GachaRNG.rollPartType();
      const stats = GachaRNG.generateBonusStats(rarity);
      const name = GachaNames.generateUniqueSparePartName(brand, rarity, partType);

      return {
        isCar: false,
        rarity,
        brand,
        name,
        stats,
        partType,
      };
    }
  }

  /**
   * Get gacha history for a player
   */
  public async getHistory(
    playerAddress: string,
    limit: number = 20
  ): Promise<any[]> {
    const history = await prismaClient.gachaHistory.findMany({
      where: { player: playerAddress },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return history;
  }

  /**
   * Get gacha statistics for a player
   */
  public async getStats(playerAddress: string): Promise<{
    totalPulls: number;
    totalSpent: string;
    rarityBreakdown: Record<Rarity, number>;
    carVsPartRatio: {
      cars: number;
      parts: number;
    };
  }> {
    const history = await prismaClient.gachaHistory.findMany({
      where: { player: playerAddress },
    });

    const totalPulls = history.length;
    const totalSpent = history
      .reduce((sum, pull) => sum + BigInt(pull.tierPrice), BigInt(0))
      .toString();

    const rarityBreakdown: Record<Rarity, number> = {
      [Rarity.COMMON]: 0,
      [Rarity.RARE]: 0,
      [Rarity.EPIC]: 0,
      [Rarity.LEGENDARY]: 0,
    };

    let cars = 0;
    let parts = 0;

    for (const pull of history) {
      if (pull.rarity !== null) {
        rarityBreakdown[pull.rarity as Rarity]++;
      }
      if (pull.result === 'CAR') {
        cars++;
      } else {
        parts++;
      }
    }

    return {
      totalPulls,
      totalSpent,
      rarityBreakdown,
      carVsPartRatio: { cars, parts },
    };
  }

  /**
   * Get tier information
   */
  public getTierInfo(tierId: number): TierConfig | null {
    return getTier(tierId);
  }

  /**
   * Get all tiers information
   */
  public getAllTiers(): TierConfig[] {
    return Object.values([getTier(1), getTier(2), getTier(3)]).filter(
      (t) => t !== null
    ) as TierConfig[];
  }

  /**
   * Simulate gacha (for testing/preview - doesn't consume resources)
   */
  public simulateGacha(tierId: number, count: number = 10): {
    results: any[];
    statistics: {
      rarityBreakdown: Record<Rarity, number>;
      carVsPartRatio: { cars: number; parts: number };
    };
  } {
    const tier = getTier(tierId);
    if (!tier) {
      throw new Error(`Invalid tier: ${tierId}`);
    }

    const results: any[] = [];
    const rarityBreakdown: Record<Rarity, number> = {
      [Rarity.COMMON]: 0,
      [Rarity.RARE]: 0,
      [Rarity.EPIC]: 0,
      [Rarity.LEGENDARY]: 0,
    };
    let cars = 0;
    let parts = 0;

    for (let i = 0; i < count; i++) {
      const result = this.rollGacha(tier);
      results.push(result);

      rarityBreakdown[result.rarity]++;
      if (result.isCar) {
        cars++;
      } else {
        parts++;
      }
    }

    return {
      results,
      statistics: {
        rarityBreakdown,
        carVsPartRatio: { cars, parts },
      },
    };
  }
}

// Export singleton instance
export const gachaService = GachaService.getInstance();
export default gachaService;
