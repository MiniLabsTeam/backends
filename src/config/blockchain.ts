import { SuiClient, SuiHTTPTransport } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { env } from './env';

// Singleton Sui Client
let suiClientInstance: SuiClient | null = null;
let backendKeypair: Ed25519Keypair;

// Create Sui Client
const createSuiClient = (): SuiClient => {
  return new SuiClient({
    transport: new SuiHTTPTransport({
      url: env.onechainRpcUrl,
    }),
  });
};

// Get Sui Client instance (singleton pattern)
export const getSuiClient = (): SuiClient => {
  if (!suiClientInstance) {
    suiClientInstance = createSuiClient();
  }
  return suiClientInstance;
};

// Get Backend Keypair for signing transactions
export const getBackendKeypair = (): Ed25519Keypair => {
  if (!backendKeypair) {
    // Remove '0x' prefix if exists
    const privateKeyHex = env.backendPrivateKey.startsWith('0x')
      ? env.backendPrivateKey.slice(2)
      : env.backendPrivateKey;

    // Convert hex string to Uint8Array
    const privateKeyBytes = Uint8Array.from(
      Buffer.from(privateKeyHex, 'hex')
    );

    backendKeypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
  }
  return backendKeypair;
};

// Blockchain configuration
export const blockchainConfig = {
  packageId: env.packageId,
  backendAddress: env.backendAddress,
  treasuryAddress: env.treasuryAddress,
  rpcUrl: env.onechainRpcUrl,
  wssUrl: env.onechainWssUrl,
};

// Module addresses (from deployed package)
export const moduleAddresses = {
  config: `${env.packageId}::config`,
  coin_vault: `${env.packageId}::coin_vault`,
  car: `${env.packageId}::car`,
  sparepart: `${env.packageId}::sparepart`,
  garage: `${env.packageId}::garage`,
  room: `${env.packageId}::room`,
  race: `${env.packageId}::race`,
  gacha: `${env.packageId}::gacha`,
  marketplace: `${env.packageId}::marketplace`,
  prediction: `${env.packageId}::prediction`,
  rwa_claim: `${env.packageId}::rwa_claim`,
};

// Event types (untuk indexer)
export const eventTypes = {
  // Config events
  AdminTransferred: `${env.packageId}::config::AdminTransferred`,
  BackendPubkeySet: `${env.packageId}::config::BackendPubkeySet`,
  TreasurySet: `${env.packageId}::config::TreasurySet`,

  // Car events
  CarMinted: `${env.packageId}::car::CarMinted`,
  CarBurned: `${env.packageId}::car::CarBurned`,

  // SparePart events
  SparePartMinted: `${env.packageId}::sparepart::SparePartMinted`,
  SparePartBurned: `${env.packageId}::sparepart::SparePartBurned`,

  // Garage events
  PartEquipped: `${env.packageId}::garage::PartEquipped`,
  PartUnequipped: `${env.packageId}::garage::PartUnequipped`,

  // Room events
  RoomCreated: `${env.packageId}::room::RoomCreated`,
  RoomApproved: `${env.packageId}::room::RoomApproved`,
  RoomStarted: `${env.packageId}::room::RoomStarted`,

  // Race events
  RaceFinalized: `${env.packageId}::race::RaceFinalized`,

  // Gacha events
  GachaCommitted: `${env.packageId}::gacha::GachaCommitted`,
  GachaResult: `${env.packageId}::gacha::GachaResult`,

  // Marketplace events
  CarListed: `${env.packageId}::marketplace::CarListed`,
  SparePartListed: `${env.packageId}::marketplace::SparePartListed`,
  NFTSold: `${env.packageId}::marketplace::NFTSold`,
  ListingCancelled: `${env.packageId}::marketplace::ListingCancelled`,

  // Prediction events
  PoolCreated: `${env.packageId}::prediction::PoolCreated`,
  BetPlaced: `${env.packageId}::prediction::BetPlaced`,
  PredictionSettled: `${env.packageId}::prediction::PredictionSettled`,
  PayoutClaimed: `${env.packageId}::prediction::PayoutClaimed`,

  // RWA events
  PhysicalClaimed: `${env.packageId}::rwa_claim::PhysicalClaimed`,
};

// Rarity constants (match smart contract)
export enum Rarity {
  COMMON = 0,
  RARE = 1,
  EPIC = 2,
  LEGENDARY = 3,
}

// Brand constants (match smart contract)
export enum Brand {
  LAMBORGHINI = 0,
  FERRARI = 1,
  FORD = 2,
  CHEVROLET = 3,
}

// Part type constants (match smart contract)
export enum PartType {
  WHEELS = 0,
  ENGINE = 1,
  BODY = 2,
  SHOCKS = 3,
}

// Utility: Convert Rarity enum to string
export const getRarityName = (rarity: number): string => {
  switch (rarity) {
    case Rarity.COMMON:
      return 'Common';
    case Rarity.RARE:
      return 'Rare';
    case Rarity.EPIC:
      return 'Epic';
    case Rarity.LEGENDARY:
      return 'Legendary';
    default:
      return 'Unknown';
  }
};

// Utility: Convert Brand enum to string
export const getBrandName = (brand: number): string => {
  switch (brand) {
    case Brand.LAMBORGHINI:
      return 'Lamborghini';
    case Brand.FERRARI:
      return 'Ferrari';
    case Brand.FORD:
      return 'Ford';
    case Brand.CHEVROLET:
      return 'Chevrolet';
    default:
      return 'Unknown';
  }
};

// Utility: Convert PartType enum to string
export const getPartTypeName = (partType: number): string => {
  switch (partType) {
    case PartType.WHEELS:
      return 'Wheels';
    case PartType.ENGINE:
      return 'Engine';
    case PartType.BODY:
      return 'Body';
    case PartType.SHOCKS:
      return 'Shocks';
    default:
      return 'Unknown';
  }
};

// Test connection
export const testBlockchainConnection = async (): Promise<boolean> => {
  try {
    const client = getSuiClient();
    const chainId = await client.getChainIdentifier();
    console.log('✅ Blockchain connected. Chain ID:', chainId);
    return true;
  } catch (error) {
    console.error('❌ Blockchain connection failed:', error);
    return false;
  }
};

// Export instances
export const suiClient = getSuiClient();
export const keypair = getBackendKeypair();

export default {
  suiClient,
  keypair,
  blockchainConfig,
  moduleAddresses,
  eventTypes,
  Rarity,
  Brand,
  PartType,
};
