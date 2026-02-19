import crypto from 'crypto';
import { Rarity, Brand, PartType } from '../../config/blockchain';
import { TierConfig, getStatRange } from './GachaTiers';

/**
 * GachaRNG
 *
 * Random Number Generator for gacha system.
 * Uses cryptographically secure randomness for fair results.
 */
export class GachaRNG {
  /**
   * Generate random number between 0 and 1
   */
  private static random(): number {
    const buffer = crypto.randomBytes(4);
    return buffer.readUInt32BE(0) / 0xffffffff;
  }

  /**
   * Generate random integer between min and max (inclusive)
   */
  private static randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /**
   * Roll rarity based on tier probabilities
   */
  public static rollRarity(tier: TierConfig): Rarity {
    const roll = this.random();
    let cumulative = 0;

    // Check each rarity in order
    for (const [rarityStr, probability] of Object.entries(tier.probabilities)) {
      cumulative += probability;
      if (roll < cumulative) {
        return parseInt(rarityStr, 10) as Rarity;
      }
    }

    // Fallback to guaranteed min rarity or common
    return tier.guaranteedMinRarity ?? Rarity.COMMON;
  }

  /**
   * Roll whether result is Car or SparePart
   */
  public static rollIsCar(tier: TierConfig): boolean {
    return this.random() < tier.carProbability;
  }

  /**
   * Roll random brand
   */
  public static rollBrand(): Brand {
    return this.randomInt(Brand.LAMBORGHINI, Brand.CHEVROLET) as Brand;
  }

  /**
   * Roll random part type
   */
  public static rollPartType(): PartType {
    return this.randomInt(PartType.WHEELS, PartType.SHOCKS) as PartType;
  }

  /**
   * Generate random stats based on rarity
   * Returns: { speed, acceleration, handling, drift }
   */
  public static generateStats(rarity: Rarity): {
    speed: number;
    acceleration: number;
    handling: number;
    drift: number;
  } {
    const range = getStatRange(rarity);

    return {
      speed: this.randomInt(range.min, range.max),
      acceleration: this.randomInt(range.min, range.max),
      handling: this.randomInt(range.min, range.max),
      drift: this.randomInt(range.min, range.max),
    };
  }

  /**
   * Generate balanced stats (all stats are similar)
   * Good for well-rounded cars
   */
  public static generateBalancedStats(rarity: Rarity): {
    speed: number;
    acceleration: number;
    handling: number;
    drift: number;
  } {
    const range = getStatRange(rarity);
    const baseValue = this.randomInt(range.min, range.max);
    const variance = Math.floor((range.max - range.min) * 0.1); // 10% variance

    return {
      speed: Math.max(range.min, Math.min(range.max, baseValue + this.randomInt(-variance, variance))),
      acceleration: Math.max(range.min, Math.min(range.max, baseValue + this.randomInt(-variance, variance))),
      handling: Math.max(range.min, Math.min(range.max, baseValue + this.randomInt(-variance, variance))),
      drift: Math.max(range.min, Math.min(range.max, baseValue + this.randomInt(-variance, variance))),
    };
  }

  /**
   * Generate specialized stats (one stat is dominant)
   * Good for specialized cars/parts
   */
  public static generateSpecializedStats(rarity: Rarity, dominantStat?: 'speed' | 'acceleration' | 'handling' | 'drift'): {
    speed: number;
    acceleration: number;
    handling: number;
    drift: number;
  } {
    const range = getStatRange(rarity);
    const dominant = dominantStat || this.randomChoice(['speed', 'acceleration', 'handling', 'drift']);

    const stats = {
      speed: this.randomInt(range.min, Math.floor((range.min + range.max) / 2)),
      acceleration: this.randomInt(range.min, Math.floor((range.min + range.max) / 2)),
      handling: this.randomInt(range.min, Math.floor((range.min + range.max) / 2)),
      drift: this.randomInt(range.min, Math.floor((range.min + range.max) / 2)),
    };

    // Boost dominant stat
    stats[dominant] = this.randomInt(Math.floor((range.min + range.max) / 2), range.max);

    return stats;
  }

  /**
   * Generate bonus stats (for SpareParts - lower than base stats)
   */
  public static generateBonusStats(rarity: Rarity): {
    speed: number;
    acceleration: number;
    handling: number;
    drift: number;
  } {
    const range = getStatRange(rarity);

    // Bonus stats are 30-50% of normal stat range
    const bonusMin = Math.floor(range.min * 0.3);
    const bonusMax = Math.floor(range.max * 0.5);

    return {
      speed: this.randomInt(bonusMin, bonusMax),
      acceleration: this.randomInt(bonusMin, bonusMax),
      handling: this.randomInt(bonusMin, bonusMax),
      drift: this.randomInt(bonusMin, bonusMax),
    };
  }

  /**
   * Choose random element from array
   */
  public static randomChoice<T>(array: T[]): T {
    return array[this.randomInt(0, array.length - 1)];
  }

  /**
   * Generate random seed for commit-reveal
   */
  public static generateSeed(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Shuffle array (Fisher-Yates algorithm)
   */
  public static shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = this.randomInt(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Weighted random choice
   * weights: array of weights corresponding to choices
   */
  public static weightedChoice<T>(choices: T[], weights: number[]): T {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const roll = this.random() * totalWeight;

    let cumulative = 0;
    for (let i = 0; i < choices.length; i++) {
      cumulative += weights[i];
      if (roll < cumulative) {
        return choices[i];
      }
    }

    return choices[choices.length - 1];
  }
}

export default GachaRNG;
