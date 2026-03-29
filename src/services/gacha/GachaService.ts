import crypto from 'crypto';
import { prismaClient } from '../../config/database';
import { cache } from '../../config/redis';
import { Rarity, Brand } from '../../config/blockchain';
import { signingService } from '../signing/SigningService';

// Car 2D images mapped by model name keyword
const CAR_IMAGE_BY_MODEL: Record<string, string> = {
  // Lamborghini
  'Revuelto':    '/assets/assetdcar2d/lamborghin/lamborghini_Revuelto.png',
  'Temerario':   '/assets/assetdcar2d/lamborghin/lamborghini_Temerario.png',
  'Aventador':   '/assets/assetdcar2d/lamborghin/lamborghini_aventador.png',
  'Huracan':     '/assets/assetdcar2d/lamborghin/lamborghini_huracan.png',
  'Countach':    '/assets/assetdcar2d/lamborghin/Lamborghini_Countach.png',
  'Diablo':      '/assets/assetdcar2d/lamborghin/lamborghini_diablo.png',
  'Murciélago':  '/assets/assetdcar2d/lamborghin/Murcelago.png',
  'Gallardo':    '/assets/assetdcar2d/lamborghin/galardo.png',
  // Ferrari
  'F80':         '/assets/assetdcar2d/ferrari/f80.png',
  '12Cilindri':  '/assets/assetdcar2d/ferrari/12Cilindri.png',
  '296 GTB':     '/assets/assetdcar2d/ferrari/296 GTB.png',
  'SF90':        '/assets/assetdcar2d/ferrari/SF90 Stradale.png',
  '812':         '/assets/assetdcar2d/ferrari/812superfast.png',
  'Enzo':        '/assets/assetdcar2d/ferrari/enzo.png',
  'LaFerrari':   '/assets/assetdcar2d/ferrari/Laferrari.png',
  'F40':         '/assets/assetdcar2d/ferrari/f80.png',
  // Ford
  'Mach-E':      '/assets/assetdcar2d/ford/mach-e.png',
  'Mustang':     '/assets/assetdcar2d/ford/ford_mustang.png',
  'Shelby':      '/assets/assetdcar2d/ford/shelby.png',
  'Ford GT':     '/assets/assetdcar2d/ford/ford_gt.png',
  'Everest':     '/assets/assetdcar2d/ford/everest.png',
  'Ranger':      '/assets/assetdcar2d/ford/ranger.png',
  'Focus':       '/assets/assetdcar2d/ford/focus.png',
  'Fiesta':      '/assets/assetdcar2d/ford/fiesta.png',
  'Capri':       '/assets/assetdcar2d/ford/capri.png',
  // Chevrolet
  'Corvette':    '/assets/assetdcar2d/chevrolet/corvette.png',
  'Camaro':      '/assets/assetdcar2d/chevrolet/camaro.png',
  'Silverado':   '/assets/assetdcar2d/chevrolet/silverado.png',
  'Colorado':    '/assets/assetdcar2d/chevrolet/colorado.png',
  'Cruze':       '/assets/assetdcar2d/chevrolet/cruza.png',
  'Impala':      '/assets/assetdcar2d/chevrolet/impala.png',
  'Chevelle':    '/assets/assetdcar2d/chevrolet/chevelle.png',
};

// Car 3D models mapped by model name keyword
const CAR_MODEL_BY_NAME: Record<string, string> = {
  // Lamborghini
  'Revuelto':    '/asset3d/cars_assets3d/lamborghini/lamborghini_revuelto.glb',
  'Temerario':   '/asset3d/cars_assets3d/lamborghini/lamborghini_temerario.glb',
  'Aventador':   '/asset3d/cars_assets3d/lamborghini/lamborghini_aventador.glb',
  'Huracan':     '/asset3d/cars_assets3d/lamborghini/lamborghini_huracan.glb',
  'Countach':    '/asset3d/cars_assets3d/lamborghini/lamborghini_countach.glb',
  'Diablo':      '/asset3d/cars_assets3d/lamborghini/lamborghini_diablo_sv.glb',
  'Murciélago':  '/asset3d/cars_assets3d/lamborghini/lamborghini_murcielago.glb',
  'Gallardo':    '/asset3d/cars_assets3d/lamborghini/free_lamborghini_gallardo.glb',
  // Ferrari
  'F80':         '/asset3d/cars_assets3d/ferrari/2020_ferrari_sf90_stradale.glb',
  '12Cilindri':  '/asset3d/cars_assets3d/ferrari/2025_ferrari_12cilindri.glb',
  '296 GTB':     '/asset3d/cars_assets3d/ferrari/2022_ferrari_296_gtb.glb',
  'SF90':        '/asset3d/cars_assets3d/ferrari/2020_ferrari_sf90_stradale.glb',
  '812':         '/asset3d/cars_assets3d/ferrari/2018_ferrari_812_superfast.glb',
  'F40':         '/asset3d/cars_assets3d/ferrari/ferrari_f40.glb',
  'Enzo':        '/asset3d/cars_assets3d/ferrari/2002_ferrari_enzo_ferrari_out_run.glb',
  'LaFerrari':   '/asset3d/cars_assets3d/ferrari/2014_ferrari_laferrari.glb',
  // Ford
  'Mach-E':      '/asset3d/cars_assets3d/ford/2020_ford_mustang_mach-e_1400_concept.glb',
  'Mustang':     '/asset3d/cars_assets3d/ford/ford_mustang_shelby_2012.glb',
  'Shelby':      '/asset3d/cars_assets3d/ford/2020_ford_shelby_gt500.glb',
  'Ford GT':     '/asset3d/cars_assets3d/ford/2019_ford_gt_heritage_edition.glb',
  'Everest':     '/asset3d/cars_assets3d/ford/ford_everest_sport_2023.glb',
  'Ranger':      '/asset3d/cars_assets3d/ford/2014_ford_ranger_dakar.glb',
  'Focus':       '/asset3d/cars_assets3d/ford/2009_ford_focus_rs.glb',
  'Fiesta':      '/asset3d/cars_assets3d/ford/2013_ford_fiesta_st_grc.glb',
  'Capri':       '/asset3d/cars_assets3d/ford/ford_capri_group_b.glb',
  // Chevrolet
  'Corvette':    '/asset3d/cars_assets3d/chevrolet/2019_chevrolet_corvette_zr1.glb',
  'Camaro':      '/asset3d/cars_assets3d/chevrolet/2012_chevrolet_camaro_zl1.glb',
  'Silverado':   '/asset3d/cars_assets3d/chevrolet/2024_chevrolet_silverado_ev_rst.glb',
  'Colorado':    '/asset3d/cars_assets3d/chevrolet/2017_chevrolet_colorado_zr2.glb',
  'Cruze':       '/asset3d/cars_assets3d/chevrolet/2017_chevrolet_cruze_ltz.glb',
  'Impala':      '/asset3d/cars_assets3d/chevrolet/chevrolet_impala_1967-_supernatural.glb',
  'Chevelle':    '/asset3d/cars_assets3d/chevrolet/1970_chevrolet_chevelle_ss_454.glb',
};

const CAR_MODEL_FALLBACK: Record<number, string> = {
  [Brand.LAMBORGHINI]: '/asset3d/cars_assets3d/lamborghini/lamborghini_huracan.glb',
  [Brand.FERRARI]:     '/asset3d/cars_assets3d/ferrari/2020_ferrari_sf90_stradale.glb',
  [Brand.FORD]:        '/asset3d/cars_assets3d/ford/ford_mustang_shelby_2012.glb',
  [Brand.CHEVROLET]:   '/asset3d/cars_assets3d/chevrolet/2019_chevrolet_corvette_zr1.glb',
};

function pickCarModel(brand: number, name?: string): string {
  if (name) {
    for (const [key, path] of Object.entries(CAR_MODEL_BY_NAME)) {
      if (name.includes(key)) return path;
    }
  }
  return CAR_MODEL_FALLBACK[brand] ?? CAR_MODEL_FALLBACK[Brand.LAMBORGHINI];
}

// Fallback images per brand
const CAR_FALLBACK: Record<number, string> = {
  [Brand.LAMBORGHINI]: '/assets/assetdcar2d/lamborghin/lamborghini_huracan.png',
  [Brand.FERRARI]:     '/assets/assetdcar2d/ferrari/f80.png',
  [Brand.FORD]:        '/assets/assetdcar2d/ford/ford_mustang.png',
  [Brand.CHEVROLET]:   '/assets/assetdcar2d/chevrolet/corvette.png',
};

// partType: 0=Wheels, 1=Engine, 2=Body, 3=Shocks
const PART_IMAGES: Record<number, string> = {
  0: '/assets/Fragments/Wheels.png',
  1: '/assets/Fragments/Engine.png',
  2: '/assets/Fragments/Body.png',
  3: '/assets/Fragments/Chasis.png',
};

function pickPartImage(partType: number): string {
  return PART_IMAGES[partType] ?? '/assets/Fragments/Body.png';
}

function pickCarImage(brand: number, name?: string): string {
  if (name) {
    for (const [key, path] of Object.entries(CAR_IMAGE_BY_MODEL)) {
      if (name.includes(key)) return path;
    }
  }
  return CAR_FALLBACK[brand] ?? CAR_FALLBACK[Brand.LAMBORGHINI];
}
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
    // Note: In production, you might want to verify this matches commitHash
    void generateCommitHash(seed, playerAddress);

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
          imageUrl: pickCarImage(result.brand, result.name),
          modelUrl: pickCarModel(result.brand, result.name),
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
          imageUrl: pickPartImage(result.partType ?? 0),
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
