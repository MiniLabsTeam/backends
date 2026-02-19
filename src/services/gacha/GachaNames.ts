import { Rarity, Brand, PartType, getBrandName, getPartTypeName } from '../../config/blockchain';
import { GachaRNG } from './GachaRNG';

/**
 * GachaNames
 *
 * Generate random names for Cars and SpareParts.
 */

// Car name prefixes by brand
const CAR_PREFIXES: Record<Brand, string[]> = {
  [Brand.LAMBORGHINI]: [
    'Raging',
    'Furious',
    'Blazing',
    'Thunder',
    'Lightning',
    'Storm',
    'Inferno',
    'Savage',
    'Wild',
    'Fierce',
  ],
  [Brand.FERRARI]: [
    'Crimson',
    'Scarlet',
    'Ruby',
    'Phoenix',
    'Dragon',
    'Flame',
    'Blaze',
    'Passion',
    'Royal',
    'Elite',
  ],
  [Brand.FORD]: [
    'Thunder',
    'Mustang',
    'Cobra',
    'Viper',
    'Bronco',
    'Raptor',
    'Falcon',
    'Eagle',
    'Hawk',
    'Stallion',
  ],
  [Brand.CHEVROLET]: [
    'Camaro',
    'Corvette',
    'Silverado',
    'Blazer',
    'Impala',
    'Malibu',
    'Nova',
    'El Camino',
    'Chevelle',
    'Apache',
  ],
};

// Car name suffixes by rarity
const CAR_SUFFIXES: Record<Rarity, string[]> = {
  [Rarity.COMMON]: ['GT', 'Sport', 'Classic', 'Street', 'Cruiser', 'Racer', 'Turbo', 'V6'],
  [Rarity.RARE]: [
    'GTS',
    'Premium',
    'Elite',
    'Pro',
    'Super',
    'Turbo X',
    'V8',
    'Special',
  ],
  [Rarity.EPIC]: [
    'GTR',
    'Ultimate',
    'Extreme',
    'Master',
    'Hyper',
    'Twin Turbo',
    'V10',
    'Limited',
  ],
  [Rarity.LEGENDARY]: [
    'Black Edition',
    'Platinum',
    'Diamond',
    'Signature',
    'Apex',
    'Godspeed',
    'V12',
    'Ultimate Edition',
  ],
};

// Sparepart name prefixes by rarity
const PART_PREFIXES: Record<Rarity, string[]> = {
  [Rarity.COMMON]: ['Standard', 'Basic', 'Street', 'Classic', 'Regular'],
  [Rarity.RARE]: ['Performance', 'Sport', 'Pro', 'Enhanced', 'Advanced'],
  [Rarity.EPIC]: ['Race', 'Competition', 'Elite', 'Premium', 'Master'],
  [Rarity.LEGENDARY]: ['Ultimate', 'Legendary', 'Signature', 'Champion', 'Godlike'],
};

// Sparepart descriptors
const PART_DESCRIPTORS: Record<PartType, string[]> = {
  [PartType.WHEELS]: [
    'Alloy',
    'Carbon',
    'Forged',
    'Lightweight',
    'Racing',
    'Chrome',
    'Titanium',
    'Magnesium',
  ],
  [PartType.ENGINE]: [
    'Turbocharged',
    'Supercharged',
    'Twin-Turbo',
    'V-Tech',
    'Hybrid',
    'Tuned',
    'Modified',
    'High-Output',
  ],
  [PartType.BODY]: [
    'Aerodynamic',
    'Carbon Fiber',
    'Widebody',
    'Streamlined',
    'Reinforced',
    'Vented',
    'Styled',
    'Customized',
  ],
  [PartType.SHOCKS]: [
    'Adjustable',
    'Coilover',
    'Air',
    'Magnetic',
    'Racing',
    'Performance',
    'Adaptive',
    'Sport',
  ],
};

export class GachaNames {
  /**
   * Generate car name
   */
  public static generateCarName(brand: Brand, rarity: Rarity): string {
    const brandName = getBrandName(brand);
    const prefix = GachaRNG.randomChoice(CAR_PREFIXES[brand]);
    const suffix = GachaRNG.randomChoice(CAR_SUFFIXES[rarity]);

    // Format: "Brand Prefix Suffix"
    // Example: "Lamborghini Raging Black Edition"
    return `${brandName} ${prefix} ${suffix}`;
  }

  /**
   * Generate sparepart name
   */
  public static generateSparePartName(
    brand: Brand,
    rarity: Rarity,
    partType: PartType
  ): string {
    const brandName = getBrandName(brand);
    const rarityPrefix = GachaRNG.randomChoice(PART_PREFIXES[rarity]);
    const descriptor = GachaRNG.randomChoice(PART_DESCRIPTORS[partType]);
    const partTypeName = getPartTypeName(partType);

    // Format: "Brand Rarity Descriptor PartType"
    // Example: "Ferrari Ultimate Carbon Fiber Wheels"
    return `${brandName} ${rarityPrefix} ${descriptor} ${partTypeName}`;
  }

  /**
   * Generate unique car name (with random number suffix)
   */
  public static generateUniqueCarName(brand: Brand, rarity: Rarity): string {
    const baseName = this.generateCarName(brand, rarity);
    const uniqueId = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `${baseName} #${uniqueId}`;
  }

  /**
   * Generate unique sparepart name (with random number suffix)
   */
  public static generateUniqueSparePartName(
    brand: Brand,
    rarity: Rarity,
    partType: PartType
  ): string {
    const baseName = this.generateSparePartName(brand, rarity, partType);
    const uniqueId = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `${baseName} #${uniqueId}`;
  }

  /**
   * Generate custom car name with template
   * Template variables: {brand}, {prefix}, {suffix}
   */
  public static generateCustomCarName(
    brand: Brand,
    rarity: Rarity,
    template: string
  ): string {
    const brandName = getBrandName(brand);
    const prefix = GachaRNG.randomChoice(CAR_PREFIXES[brand]);
    const suffix = GachaRNG.randomChoice(CAR_SUFFIXES[rarity]);

    return template
      .replace('{brand}', brandName)
      .replace('{prefix}', prefix)
      .replace('{suffix}', suffix);
  }

  /**
   * Get random car prefix for a brand
   */
  public static getRandomCarPrefix(brand: Brand): string {
    return GachaRNG.randomChoice(CAR_PREFIXES[brand]);
  }

  /**
   * Get random car suffix for a rarity
   */
  public static getRandomCarSuffix(rarity: Rarity): string {
    return GachaRNG.randomChoice(CAR_SUFFIXES[rarity]);
  }

  /**
   * Get random part prefix for a rarity
   */
  public static getRandomPartPrefix(rarity: Rarity): string {
    return GachaRNG.randomChoice(PART_PREFIXES[rarity]);
  }

  /**
   * Get random part descriptor for a part type
   */
  public static getRandomPartDescriptor(partType: PartType): string {
    return GachaRNG.randomChoice(PART_DESCRIPTORS[partType]);
  }
}

export default GachaNames;
