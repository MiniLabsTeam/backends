// API request/response types

// Auth
export interface WalletConnectRequest {
  address: string;
  signature: string;
  message: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    address: string;
    username?: string;
  };
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// Game Room
export interface CreateRoomRequest {
  gameMode: string;
  maxPlayers: number;
  entryFee: string;
  deadline: number;
}

export interface JoinRoomRequest {
  roomId: string;
  carUid: string;
}

export interface ApproveRoomRequest {
  roomId: string;
  paymentTxDigest: string;
}

// Gacha
export interface GetGachaPricingRequest {
  tierId: number;
}

export interface GetGachaPricingResponse {
  tierId: number;
  tierPrice: string;
  signature: string;
  message: string;
  nonce: string;
  expiresAt: number;
}

export interface CommitGachaRequest {
  tierId: number;
  tierPrice: string;
  signature: string;
  message: string;
  nonce: string;
  expiresAt: number;
}

export interface CommitGachaResponse {
  commitHash: string;
  txDigest: string;
}

export interface RevealGachaRequest {
  playerAddress: string;
}

export interface RevealGachaResponse {
  nftType: 'CAR' | 'SPAREPART';
  nftUid: string;
  rarity: number;
  name: string;
  txDigest: string;
}

// Marketplace
export interface ListNFTRequest {
  nftType: 'CAR' | 'SPAREPART';
  nftUid: string;
  price: string;
  expiry: number;
}

export interface BuyNFTRequest {
  listingId: string;
  paymentTxDigest: string;
}

export interface GetListingsRequest {
  nftType?: 'CAR' | 'SPAREPART';
  brand?: number;
  rarity?: number;
  minPrice?: string;
  maxPrice?: string;
  sortBy?: 'price' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

// Prediction
export interface PlaceBetRequest {
  roomUid: string;
  predictedWinner: string;
  amount: string;
}

export interface ClaimPayoutRequest {
  roomUid: string;
}

export interface GetPredictionPoolResponse {
  roomUid: string;
  totalPool: string;
  bets: {
    [playerAddress: string]: {
      amount: string;
      count: number;
    };
  };
  odds: {
    [playerAddress: string]: number;
  };
  isSettled: boolean;
  actualWinner?: string;
}

// Inventory
export interface EquipPartRequest {
  carUid: string;
  partUid: string;
}

export interface UnequipPartRequest {
  carUid: string;
  partUid: string;
}

export interface GetEquippedPartsResponse {
  carUid: string;
  equippedParts: {
    uid: string;
    partType: number;
    name: string;
    bonus: {
      speed: number;
      acceleration: number;
      handling: number;
      drift: number;
    };
  }[];
  finalStats: {
    speed: number;
    acceleration: number;
    handling: number;
    drift: number;
  };
}

// Quest
export interface ClaimQuestRewardRequest {
  questId: string;
}

export interface GetDailyQuestsResponse {
  quests: {
    id: string;
    name: string;
    description: string;
    progress: number;
    requirement: number;
    isCompleted: boolean;
    isClaimed: boolean;
    reward: {
      type: string;
      amount: number;
    };
  }[];
}

// RWA
export interface ClaimPhysicalRequest {
  carUid: string;
  partUids: string[];
  shippingAddress: string;
}

export interface GetClaimStatusResponse {
  carUid: string;
  status: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED';
  trackingNumber?: string;
  shippedAt?: Date;
  deliveredAt?: Date;
}
