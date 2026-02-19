import { env } from '../../config/env';
import { Rarity } from '../../config/blockchain';

/**
 * GachaTiers
 *
 * Configuration for gacha tier system:
 * - Tier 1: Basic tier - mostly Common, some Rare
 * - Tier 2: Premium tier - Rare/Epic focus
 * - Tier 3: Ultimate tier - Epic/Legendary guaranteed
 */

export interface TierConfig {
  id: number;
  name: string;
  price: string;
  probabilities: {
    [Rarity.COMMON]: number;
    [Rarity.RARE]: number;
    [Rarity.EPIC]: number;
    [Rarity.LEGENDARY]: number;
  };
  guaranteedMinRarity?: Rarity;
  carProbability: number; // Probability of getting car vs sparepart
}

export interface StatRange {
  min: number;
  max: number;
}

export interface RarityStatRanges {
  [Rarity.COMMON]: StatRange;
  [Rarity.RARE]: StatRange;
  [Rarity.EPIC]: StatRange;
  [Rarity.LEGENDARY]: StatRange;
}

/**
 * Tier 1: Basic Gacha
 * - Price: 1,000,000 (1 ONE)
 * - 70% Common, 25% Rare, 4.5% Epic, 0.5% Legendary
 * - 30% chance for Car, 70% for SparePart
 */
export const TIER_1: TierConfig = {
  id: 1,
  name: 'Basic Gacha',
  price: env.gachaTier1Price,
  probabilities: {
    [Rarity.COMMON]: 0.70,
    [Rarity.RARE]: 0.25,
    [Rarity.EPIC]: 0.045,
    [Rarity.LEGENDARY]: 0.005,
  },
  carProbability: 0.30,
};

/**
 * Tier 2: Premium Gacha
 * - Price: 5,000,000 (5 ONE)
 * - 40% Common, 40% Rare, 18% Epic, 2% Legendary
 * - 50% chance for Car, 50% for SparePart
 */
export const TIER_2: TierConfig = {
  id: 2,
  name: 'Premium Gacha',
  price: env.gachaTier2Price,
  probabilities: {
    [Rarity.COMMON]: 0.40,
    [Rarity.RARE]: 0.40,
    [Rarity.EPIC]: 0.18,
    [Rarity.LEGENDARY]: 0.02,
  },
  carProbability: 0.50,
};

/**
 * Tier 3: Ultimate Gacha
 * - Price: 10,000,000 (10 ONE)
 * - 0% Common, 30% Rare, 50% Epic, 20% Legendary
 * - 60% chance for Car, 40% for SparePart
 * - Guaranteed minimum: Epic
 */
export const TIER_3: TierConfig = {
  id: 3,
  name: 'Ultimate Gacha',
  price: env.gachaTier3Price,
  probabilities: {
    [Rarity.COMMON]: 0.0,
    [Rarity.RARE]: 0.30,
    [Rarity.EPIC]: 0.50,
    [Rarity.LEGENDARY]: 0.20,
  },
  guaranteedMinRarity: Rarity.EPIC,
  carProbability: 0.60,
};

/**
 * All tiers
 */
export const TIERS: Record<number, TierConfig> = {
  1: TIER_1,
  2: TIER_2,
  3: TIER_3,
};

/**
 * Stat ranges based on rarity
 * Stats: Speed, Acceleration, Handling, Drift
 * Total stats increase with rarity
 */
export const STAT_RANGES: RarityStatRanges = {
  [Rarity.COMMON]: {
    min: 10,
    max: 30,
  },
  [Rarity.RARE]: {
    min: 25,
    max: 50,
  },
  [Rarity.EPIC]: {
    min: 45,
    max: 75,
  },
  [Rarity.LEGENDARY]: {
    min: 70,
    max: 100,
  },
};

/**
 * Slot limit based on rarity (for Cars only)
 */
export const SLOT_LIMITS: Record<Rarity, number> = {
  [Rarity.COMMON]: 2,
  [Rarity.RARE]: 3,
  [Rarity.EPIC]: 3,
  [Rarity.LEGENDARY]: 4,
};

/**
 * Get tier configuration
 */
export const getTier = (tierId: number): TierConfig | null => {
  return TIERS[tierId] || null;
};

/**
 * Validate tier ID
 */
export const isValidTier = (tierId: number): boolean => {
  return tierId >= 1 && tierId <= 3;
};

/**
 * Get tier price
 */
export const getTierPrice = (tierId: number): string => {
  const tier = getTier(tierId);
  return tier ? tier.price : '0';
};

/**
 * Calculate discounted price
 */
export const calculateDiscountedPrice = (
  tierId: number,
  discountPercent: number
): string => {
  const tier = getTier(tierId);
  if (!tier) return '0';

  // Validate discount doesn't exceed max
  const validDiscount = Math.min(discountPercent, env.gachaMaxDiscountPercent);

  const originalPrice = BigInt(tier.price);
  const discount = (originalPrice * BigInt(validDiscount)) / BigInt(100);
  const discountedPrice = originalPrice - discount;

  return discountedPrice.toString();
};

/**
 * Get stat range for rarity
 */
export const getStatRange = (rarity: Rarity): StatRange => {
  return STAT_RANGES[rarity];
};

/**
 * Get slot limit for rarity
 */
export const getSlotLimit = (rarity: Rarity): number => {
  return SLOT_LIMITS[rarity];
};

/**
 * Validate probabilities sum to 1.0
 */
export const validateTierProbabilities = (tier: TierConfig): boolean => {
  const sum =
    tier.probabilities[Rarity.COMMON] +
    tier.probabilities[Rarity.RARE] +
    tier.probabilities[Rarity.EPIC] +
    tier.probabilities[Rarity.LEGENDARY];

  // Allow small floating point error
  return Math.abs(sum - 1.0) < 0.0001;
};

/**
 * Get all tiers as array
 */
export const getAllTiers = (): TierConfig[] => {
  return [TIER_1, TIER_2, TIER_3];
};

export default {
  TIER_1,
  TIER_2,
  TIER_3,
  TIERS,
  STAT_RANGES,
  SLOT_LIMITS,
  getTier,
  isValidTier,
  getTierPrice,
  calculateDiscountedPrice,
  getStatRange,
  getSlotLimit,
  validateTierProbabilities,
  getAllTiers,
};
