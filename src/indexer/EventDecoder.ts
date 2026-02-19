import { SuiEvent } from '@mysten/sui.js/client';
import { eventTypes } from '../config/blockchain';
import logger from '../config/logger';
import {
  CarMintedEvent,
  SparePartMintedEvent,
  PartEquippedEvent,
  PartUnequippedEvent,
  RoomCreatedEvent,
  RoomApprovedEvent,
  RoomStartedEvent,
  RaceFinalizedEvent,
  GachaCommittedEvent,
  GachaResultEvent,
  CarListedEvent,
  SparePartListedEvent,
  NFTSoldEvent,
  ListingCancelledEvent,
  PoolCreatedEvent,
  BetPlacedEvent,
  PredictionSettledEvent,
  PayoutClaimedEvent,
  PhysicalClaimedEvent,
} from '../types/blockchain';

/**
 * EventDecoder
 *
 * Decodes blockchain event payloads into typed objects.
 */
export class EventDecoder {
  /**
   * Decode any event based on its type
   */
  public static decode(event: SuiEvent): any {
    const eventType = event.type;

    try {
      switch (eventType) {
        // Car events
        case eventTypes.CarMinted:
          return this.decodeCarMinted(event);
        case eventTypes.CarBurned:
          return this.decodeCarBurned(event);

        // SparePart events
        case eventTypes.SparePartMinted:
          return this.decodeSparePartMinted(event);
        case eventTypes.SparePartBurned:
          return this.decodeSparePartBurned(event);

        // Garage events
        case eventTypes.PartEquipped:
          return this.decodePartEquipped(event);
        case eventTypes.PartUnequipped:
          return this.decodePartUnequipped(event);

        // Room events
        case eventTypes.RoomCreated:
          return this.decodeRoomCreated(event);
        case eventTypes.RoomApproved:
          return this.decodeRoomApproved(event);
        case eventTypes.RoomStarted:
          return this.decodeRoomStarted(event);

        // Race events
        case eventTypes.RaceFinalized:
          return this.decodeRaceFinalized(event);

        // Gacha events
        case eventTypes.GachaCommitted:
          return this.decodeGachaCommitted(event);
        case eventTypes.GachaResult:
          return this.decodeGachaResult(event);

        // Marketplace events
        case eventTypes.CarListed:
          return this.decodeCarListed(event);
        case eventTypes.SparePartListed:
          return this.decodeSparePartListed(event);
        case eventTypes.NFTSold:
          return this.decodeNFTSold(event);
        case eventTypes.ListingCancelled:
          return this.decodeListingCancelled(event);

        // Prediction events
        case eventTypes.PoolCreated:
          return this.decodePoolCreated(event);
        case eventTypes.BetPlaced:
          return this.decodeBetPlaced(event);
        case eventTypes.PredictionSettled:
          return this.decodePredictionSettled(event);
        case eventTypes.PayoutClaimed:
          return this.decodePayoutClaimed(event);

        // RWA events
        case eventTypes.PhysicalClaimed:
          return this.decodePhysicalClaimed(event);

        default:
          logger.warn(`Unknown event type: ${eventType}`);
          return null;
      }
    } catch (error) {
      logger.error(`Failed to decode event ${eventType}:`, error);
      return null;
    }
  }

  // Car events
  private static decodeCarMinted(event: SuiEvent): CarMintedEvent {
    const data = event.parsedJson as any;
    return {
      car_uid: data.car_uid,
      owner: data.owner,
      name: data.name,
      brand: parseInt(data.brand, 10),
      rarity: parseInt(data.rarity, 10),
      base_stats: {
        speed: parseInt(data.base_stats?.speed || '0', 10),
        acceleration: parseInt(data.base_stats?.acceleration || '0', 10),
        handling: parseInt(data.base_stats?.handling || '0', 10),
        drift: parseInt(data.base_stats?.drift || '0', 10),
      },
      slot_limit: parseInt(data.slot_limit, 10),
    };
  }

  private static decodeCarBurned(event: SuiEvent): { car_uid: string; owner: string } {
    const data = event.parsedJson as any;
    return {
      car_uid: data.car_uid,
      owner: data.owner,
    };
  }

  // SparePart events
  private static decodeSparePartMinted(event: SuiEvent): SparePartMintedEvent {
    const data = event.parsedJson as any;
    return {
      part_uid: data.part_uid,
      owner: data.owner,
      name: data.name,
      part_type: parseInt(data.part_type, 10),
      rarity: parseInt(data.rarity, 10),
      compatible_brand: parseInt(data.compatible_brand, 10),
      bonus: {
        speed: parseInt(data.bonus?.speed || '0', 10),
        acceleration: parseInt(data.bonus?.acceleration || '0', 10),
        handling: parseInt(data.bonus?.handling || '0', 10),
        drift: parseInt(data.bonus?.drift || '0', 10),
      },
    };
  }

  private static decodeSparePartBurned(event: SuiEvent): { part_uid: string; owner: string } {
    const data = event.parsedJson as any;
    return {
      part_uid: data.part_uid,
      owner: data.owner,
    };
  }

  // Garage events
  private static decodePartEquipped(event: SuiEvent): PartEquippedEvent {
    const data = event.parsedJson as any;
    return {
      car_uid: data.car_uid,
      part_uid: data.part_uid,
      owner: data.owner,
    };
  }

  private static decodePartUnequipped(event: SuiEvent): PartUnequippedEvent {
    const data = event.parsedJson as any;
    return {
      car_uid: data.car_uid,
      part_uid: data.part_uid,
      owner: data.owner,
    };
  }

  // Room events
  private static decodeRoomCreated(event: SuiEvent): RoomCreatedEvent {
    const data = event.parsedJson as any;
    return {
      room_uid: data.room_uid,
      room_hash: data.room_hash,
      players: data.players,
      entry_fee: data.entry_fee,
      deadline: data.deadline,
    };
  }

  private static decodeRoomApproved(event: SuiEvent): RoomApprovedEvent {
    const data = event.parsedJson as any;
    return {
      room_uid: data.room_uid,
      player: data.player,
    };
  }

  private static decodeRoomStarted(event: SuiEvent): RoomStartedEvent {
    const data = event.parsedJson as any;
    return {
      room_uid: data.room_uid,
      timestamp: data.timestamp,
    };
  }

  // Race events
  private static decodeRaceFinalized(event: SuiEvent): RaceFinalizedEvent {
    const data = event.parsedJson as any;
    return {
      room_uid: data.room_uid,
      winner: data.winner,
      finish_time: data.finish_time,
      prize_pool: data.prize_pool,
    };
  }

  // Gacha events
  private static decodeGachaCommitted(event: SuiEvent): GachaCommittedEvent {
    const data = event.parsedJson as any;
    return {
      player: data.player,
      commit_hash: data.commit_hash,
      is_car: data.is_car,
      tier_id: parseInt(data.tier_id, 10),
      tier_price: data.tier_price,
      timestamp: data.timestamp,
    };
  }

  private static decodeGachaResult(event: SuiEvent): GachaResultEvent {
    const data = event.parsedJson as any;
    return {
      player: data.player,
      rarity: parseInt(data.rarity, 10),
      is_car: data.is_car,
      nft_uid: data.nft_uid,
      name: data.name,
    };
  }

  // Marketplace events
  private static decodeCarListed(event: SuiEvent): CarListedEvent {
    const data = event.parsedJson as any;
    return {
      listing_id: data.listing_id,
      seller: data.seller,
      car_uid: data.car_uid,
      price: data.price,
      expiry: data.expiry,
    };
  }

  private static decodeSparePartListed(event: SuiEvent): SparePartListedEvent {
    const data = event.parsedJson as any;
    return {
      listing_id: data.listing_id,
      seller: data.seller,
      part_uid: data.part_uid,
      price: data.price,
      expiry: data.expiry,
    };
  }

  private static decodeNFTSold(event: SuiEvent): NFTSoldEvent {
    const data = event.parsedJson as any;
    return {
      listing_id: data.listing_id,
      buyer: data.buyer,
      seller: data.seller,
      nft_uid: data.nft_uid,
      price: data.price,
      fee: data.fee,
    };
  }

  private static decodeListingCancelled(event: SuiEvent): ListingCancelledEvent {
    const data = event.parsedJson as any;
    return {
      listing_id: data.listing_id,
      seller: data.seller,
      nft_uid: data.nft_uid,
    };
  }

  // Prediction events
  private static decodePoolCreated(event: SuiEvent): PoolCreatedEvent {
    const data = event.parsedJson as any;
    return {
      room_uid: data.room_uid,
    };
  }

  private static decodeBetPlaced(event: SuiEvent): BetPlacedEvent {
    const data = event.parsedJson as any;
    return {
      room_uid: data.room_uid,
      bettor: data.bettor,
      predicted_winner: data.predicted_winner,
      amount: data.amount,
    };
  }

  private static decodePredictionSettled(event: SuiEvent): PredictionSettledEvent {
    const data = event.parsedJson as any;
    return {
      room_uid: data.room_uid,
      actual_winner: data.actual_winner,
      total_pool: data.total_pool,
    };
  }

  private static decodePayoutClaimed(event: SuiEvent): PayoutClaimedEvent {
    const data = event.parsedJson as any;
    return {
      room_uid: data.room_uid,
      bettor: data.bettor,
      payout: data.payout,
    };
  }

  // RWA events
  private static decodePhysicalClaimed(event: SuiEvent): PhysicalClaimedEvent {
    const data = event.parsedJson as any;
    return {
      car_uid: data.car_uid,
      claimant: data.claimant,
      part_uids: data.part_uids,
      timestamp: data.timestamp,
    };
  }
}

export default EventDecoder;
