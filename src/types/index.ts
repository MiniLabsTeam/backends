// Common types used across the application

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Stats {
  speed: number;
  acceleration: number;
  handling: number;
  drift: number;
}

export interface User {
  id: string;
  address: string;
  username?: string;
  email?: string;
  nonce: string;
  lastLogin: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Car {
  id: string;
  uid: string;
  owner: string;
  name: string;
  brand: number;
  rarity: number;
  slotLimit: number;
  baseSpeed: number;
  baseAcceleration: number;
  baseHandling: number;
  baseDrift: number;
  imageUrl?: string;
  metadataUri?: string;
  isListed: boolean;
  isEquipped: boolean;
  isClaimed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SparePart {
  id: string;
  uid: string;
  owner: string;
  name: string;
  partType: number;
  rarity: number;
  compatibleBrand: number;
  bonusSpeed: number;
  bonusAcceleration: number;
  bonusHandling: number;
  bonusDrift: number;
  imageUrl?: string;
  metadataUri?: string;
  isListed: boolean;
  isEquipped: boolean;
  isClaimed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Room {
  id: string;
  roomUid: string;
  roomHash: string;
  entryFee: string;
  maxPlayers: number;
  deadline: string;
  status: RoomStatus;
  gameMode: GameMode;
  isOnChain: boolean;
  txDigest?: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
}

export enum RoomStatus {
  WAITING = 'WAITING',
  READY = 'READY',
  STARTED = 'STARTED',
  FINISHED = 'FINISHED',
}

export enum GameMode {
  DRAG_RACE = 'DRAG_RACE',
  ENDLESS_RACE = 'ENDLESS_RACE',
  ROYAL_RUMBLE = 'ROYAL_RUMBLE',
}

export interface RoomPlayer {
  id: string;
  roomId: string;
  playerAddress: string;
  carUid: string;
  isApproved: boolean;
  approvedAt?: Date;
  joinedAt: Date;
}

export interface Race {
  id: string;
  roomId: string;
  roomUid: string;
  winner: string;
  finishTime: string;
  prizePool: string;
  raceData?: any;
  isFinalized: boolean;
  txDigest?: string;
  createdAt: Date;
  finalizedAt?: Date;
}

export interface MarketListing {
  id: string;
  listingId: string;
  seller: string;
  nftType: 'CAR' | 'SPAREPART';
  nftUid: string;
  price: string;
  expiry: string;
  isActive: boolean;
  isSold: boolean;
  txDigest?: string;
  createdAt: Date;
  updatedAt: Date;
  soldAt?: Date;
}

export interface Bet {
  id: string;
  poolId: string;
  bettor: string;
  predictedWinner: string;
  amount: string;
  hasClaimed: boolean;
  payout: string;
  createdAt: Date;
  claimedAt?: Date;
}

export interface Quest {
  id: string;
  name: string;
  description: string;
  type: 'DAILY' | 'WEEKLY' | 'SPECIAL';
  requirement: QuestRequirement;
  reward: QuestReward;
  isActive: boolean;
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestRequirement {
  type: string;
  count: number;
  [key: string]: any;
}

export interface QuestReward {
  type: string;
  amount: number;
  [key: string]: any;
}

export interface QuestProgress {
  id: string;
  questId: string;
  playerAddress: string;
  progress: number;
  isCompleted: boolean;
  isClaimed: boolean;
  completedAt?: Date;
  claimedAt?: Date;
}

export interface PhysicalClaim {
  id: string;
  claimant: string;
  carUid: string;
  carId: string;
  shippingAddress: string;
  trackingNumber?: string;
  status: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED';
  claimedAt: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  txDigest?: string;
}

export * from './blockchain';
export * from './game';
export * from './api';
