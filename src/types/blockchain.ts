// Blockchain-related types

export interface SignedMessage {
  message: string;
  signature: string;
  nonce: string;
}

export interface BackendSignature {
  signature: string;
  message: string;
  nonce: string;
  expiresAt?: number;
}

export interface GachaPricingSignature extends BackendSignature {
  tierId: number;
  tierPrice: string;
  playerAddress: string;
}

export interface GachaRevealSignature extends BackendSignature {
  playerAddress: string;
  rarity: number;
  name: string;
  brand: number;
  partType?: number;
  stats: {
    speed: number;
    acceleration: number;
    handling: number;
    drift: number;
  };
  slotLimit?: number;
}

export interface RoomCreationSignature extends BackendSignature {
  roomHash: string;
  players: string[];
  entryFee: string;
  deadline: string;
}

export interface RaceResultSignature extends BackendSignature {
  roomUid: string;
  winner: string;
  finishTime: string;
}

export interface PredictionSettlementSignature extends BackendSignature {
  roomUid: string;
  actualWinner: string;
}

export interface EventData {
  id: {
    txDigest: string;
    eventSeq: string;
  };
  packageId: string;
  transactionModule: string;
  sender: string;
  type: string;
  parsedJson: any;
  bcs: string;
  timestampMs: string;
}

// Event payloads
export interface CarMintedEvent {
  car_uid: string;
  owner: string;
  name: string;
  brand: number;
  rarity: number;
  base_stats: {
    speed: number;
    acceleration: number;
    handling: number;
    drift: number;
  };
  slot_limit: number;
}

export interface SparePartMintedEvent {
  part_uid: string;
  owner: string;
  name: string;
  part_type: number;
  rarity: number;
  compatible_brand: number;
  bonus: {
    speed: number;
    acceleration: number;
    handling: number;
    drift: number;
  };
}

export interface PartEquippedEvent {
  car_uid: string;
  part_uid: string;
  owner: string;
}

export interface PartUnequippedEvent {
  car_uid: string;
  part_uid: string;
  owner: string;
}

export interface RoomCreatedEvent {
  room_uid: string;
  room_hash: string;
  players: string[];
  entry_fee: string;
  deadline: string;
}

export interface RoomApprovedEvent {
  room_uid: string;
  player: string;
}

export interface RoomStartedEvent {
  room_uid: string;
  timestamp: string;
}

export interface RaceFinalizedEvent {
  room_uid: string;
  winner: string;
  finish_time: string;
  prize_pool: string;
}

export interface GachaCommittedEvent {
  player: string;
  commit_hash: string;
  is_car: boolean;
  tier_id: number;
  tier_price: string;
  timestamp: string;
}

export interface GachaResultEvent {
  player: string;
  rarity: number;
  is_car: boolean;
  nft_uid: string;
  name: string;
}

export interface CarListedEvent {
  listing_id: string;
  seller: string;
  car_uid: string;
  price: string;
  expiry: string;
}

export interface SparePartListedEvent {
  listing_id: string;
  seller: string;
  part_uid: string;
  price: string;
  expiry: string;
}

export interface NFTSoldEvent {
  listing_id: string;
  buyer: string;
  seller: string;
  nft_uid: string;
  price: string;
  fee: string;
}

export interface ListingCancelledEvent {
  listing_id: string;
  seller: string;
  nft_uid: string;
}

export interface PoolCreatedEvent {
  room_uid: string;
}

export interface BetPlacedEvent {
  room_uid: string;
  bettor: string;
  predicted_winner: string;
  amount: string;
}

export interface PredictionSettledEvent {
  room_uid: string;
  actual_winner: string;
  total_pool: string;
}

export interface PayoutClaimedEvent {
  room_uid: string;
  bettor: string;
  payout: string;
}

export interface PhysicalClaimedEvent {
  car_uid: string;
  claimant: string;
  part_uids: string[];
  timestamp: string;
}
