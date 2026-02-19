import { SuiEvent } from '@mysten/sui.js/client';
import { prismaClient } from '../config/database';
import { eventTypes } from '../config/blockchain';
import logger from '../config/logger';
import EventDecoder from './EventDecoder';
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
 * EventHandler
 *
 * Processes decoded blockchain events and updates database.
 */
export class EventHandler {
  /**
   * Handle an event based on its type
   */
  public static async handle(event: SuiEvent): Promise<void> {
    const eventType = event.type;
    const decodedEvent = EventDecoder.decode(event);

    if (!decodedEvent) {
      logger.warn(`Skipping event ${event.id.txDigest} - failed to decode`);
      return;
    }

    try {
      // Log event to database
      await this.logEvent(event, decodedEvent);

      // Handle specific event type
      switch (eventType) {
        case eventTypes.CarMinted:
          await this.handleCarMinted(event, decodedEvent);
          break;
        case eventTypes.SparePartMinted:
          await this.handleSparePartMinted(event, decodedEvent);
          break;
        case eventTypes.PartEquipped:
          await this.handlePartEquipped(event, decodedEvent);
          break;
        case eventTypes.PartUnequipped:
          await this.handlePartUnequipped(event, decodedEvent);
          break;
        case eventTypes.RoomCreated:
          await this.handleRoomCreated(event, decodedEvent);
          break;
        case eventTypes.RoomApproved:
          await this.handleRoomApproved(event, decodedEvent);
          break;
        case eventTypes.RoomStarted:
          await this.handleRoomStarted(event, decodedEvent);
          break;
        case eventTypes.RaceFinalized:
          await this.handleRaceFinalized(event, decodedEvent);
          break;
        case eventTypes.GachaCommitted:
          await this.handleGachaCommitted(event, decodedEvent);
          break;
        case eventTypes.GachaResult:
          await this.handleGachaResult(event, decodedEvent);
          break;
        case eventTypes.CarListed:
          await this.handleCarListed(event, decodedEvent);
          break;
        case eventTypes.SparePartListed:
          await this.handleSparePartListed(event, decodedEvent);
          break;
        case eventTypes.NFTSold:
          await this.handleNFTSold(event, decodedEvent);
          break;
        case eventTypes.ListingCancelled:
          await this.handleListingCancelled(event, decodedEvent);
          break;
        case eventTypes.PoolCreated:
          await this.handlePoolCreated(event, decodedEvent);
          break;
        case eventTypes.BetPlaced:
          await this.handleBetPlaced(event, decodedEvent);
          break;
        case eventTypes.PredictionSettled:
          await this.handlePredictionSettled(event, decodedEvent);
          break;
        case eventTypes.PayoutClaimed:
          await this.handlePayoutClaimed(event, decodedEvent);
          break;
        case eventTypes.PhysicalClaimed:
          await this.handlePhysicalClaimed(event, decodedEvent);
          break;
        default:
          logger.debug(`No handler for event type: ${eventType}`);
      }

      logger.info(`✅ Processed event: ${eventType} (${event.id.txDigest})`);
    } catch (error) {
      logger.error(`Failed to handle event ${event.id.txDigest}:`, error);
      throw error;
    }
  }

  /**
   * Log event to database
   */
  private static async logEvent(event: SuiEvent, decodedData: any): Promise<void> {
    await prismaClient.eventLog.upsert({
      where: { txDigest: event.id.txDigest },
      create: {
        eventType: event.type,
        txDigest: event.id.txDigest,
        sender: event.sender || null,
        timestamp: event.timestampMs || '0',
        eventData: decodedData,
      },
      update: {
        eventData: decodedData,
      },
    });
  }

  /**
   * Ensure user exists in database
   */
  private static async ensureUser(address: string): Promise<void> {
    await prismaClient.user.upsert({
      where: { address },
      create: { address },
      update: { lastLogin: new Date() },
    });
  }

  // Car events
  private static async handleCarMinted(event: SuiEvent, data: CarMintedEvent): Promise<void> {
    await this.ensureUser(data.owner);

    await prismaClient.car.create({
      data: {
        uid: data.car_uid,
        owner: data.owner,
        name: data.name,
        brand: data.brand,
        rarity: data.rarity,
        slotLimit: data.slot_limit,
        baseSpeed: data.base_stats.speed,
        baseAcceleration: data.base_stats.acceleration,
        baseHandling: data.base_stats.handling,
        baseDrift: data.base_stats.drift,
      },
    });

    logger.info(`🚗 Car minted: ${data.name} (${data.car_uid}) to ${data.owner}`);
  }

  // SparePart events
  private static async handleSparePartMinted(event: SuiEvent, data: SparePartMintedEvent): Promise<void> {
    await this.ensureUser(data.owner);

    await prismaClient.sparePart.create({
      data: {
        uid: data.part_uid,
        owner: data.owner,
        name: data.name,
        partType: data.part_type,
        rarity: data.rarity,
        compatibleBrand: data.compatible_brand,
        bonusSpeed: data.bonus.speed,
        bonusAcceleration: data.bonus.acceleration,
        bonusHandling: data.bonus.handling,
        bonusDrift: data.bonus.drift,
      },
    });

    logger.info(`🔧 SparePart minted: ${data.name} (${data.part_uid}) to ${data.owner}`);
  }

  // Garage events
  private static async handlePartEquipped(event: SuiEvent, data: PartEquippedEvent): Promise<void> {
    await prismaClient.equippedPart.create({
      data: {
        carUid: data.car_uid,
        partUid: data.part_uid,
      },
    });

    await prismaClient.sparePart.update({
      where: { uid: data.part_uid },
      data: { isEquipped: true },
    });

    logger.info(`⚙️ Part equipped: ${data.part_uid} on car ${data.car_uid}`);
  }

  private static async handlePartUnequipped(event: SuiEvent, data: PartUnequippedEvent): Promise<void> {
    await prismaClient.equippedPart.deleteMany({
      where: {
        carUid: data.car_uid,
        partUid: data.part_uid,
      },
    });

    await prismaClient.sparePart.update({
      where: { uid: data.part_uid },
      data: { isEquipped: false },
    });

    logger.info(`🔓 Part unequipped: ${data.part_uid} from car ${data.car_uid}`);
  }

  // Room events
  private static async handleRoomCreated(event: SuiEvent, data: RoomCreatedEvent): Promise<void> {
    const room = await prismaClient.room.create({
      data: {
        roomUid: data.room_uid,
        roomHash: data.room_hash,
        entryFee: data.entry_fee,
        maxPlayers: data.players.length,
        deadline: data.deadline,
        gameMode: 'DRAG_RACE', // Default, can be updated
        isOnChain: true,
        txDigest: event.id.txDigest,
      },
    });

    // Create room players
    for (const playerAddress of data.players) {
      await this.ensureUser(playerAddress);
      await prismaClient.roomPlayer.create({
        data: {
          roomId: room.id,
          playerAddress,
          carUid: '0x0', // Will be updated when player joins
        },
      });
    }

    logger.info(`🏁 Room created: ${data.room_uid} with ${data.players.length} players`);
  }

  private static async handleRoomApproved(event: SuiEvent, data: RoomApprovedEvent): Promise<void> {
    const room = await prismaClient.room.findUnique({
      where: { roomUid: data.room_uid },
    });

    if (room) {
      await prismaClient.roomPlayer.updateMany({
        where: {
          roomId: room.id,
          playerAddress: data.player,
        },
        data: {
          isApproved: true,
          approvedAt: new Date(),
        },
      });

      logger.info(`✅ Player approved for room ${data.room_uid}: ${data.player}`);
    }
  }

  private static async handleRoomStarted(event: SuiEvent, data: RoomStartedEvent): Promise<void> {
    await prismaClient.room.updateMany({
      where: { roomUid: data.room_uid },
      data: {
        status: 'STARTED',
        startedAt: new Date(parseInt(data.timestamp, 10)),
      },
    });

    logger.info(`🚀 Room started: ${data.room_uid}`);
  }

  // Race events
  private static async handleRaceFinalized(event: SuiEvent, data: RaceFinalizedEvent): Promise<void> {
    const room = await prismaClient.room.findUnique({
      where: { roomUid: data.room_uid },
    });

    if (room) {
      await prismaClient.room.update({
        where: { id: room.id },
        data: { status: 'FINISHED', finishedAt: new Date() },
      });

      await this.ensureUser(data.winner);

      await prismaClient.race.create({
        data: {
          roomId: room.id,
          roomUid: data.room_uid,
          winner: data.winner,
          finishTime: data.finish_time,
          prizePool: data.prize_pool,
          isFinalized: true,
          txDigest: event.id.txDigest,
          finalizedAt: new Date(),
        },
      });

      logger.info(`🏆 Race finalized: ${data.room_uid}, winner: ${data.winner}`);
    }
  }

  // Gacha events
  private static async handleGachaCommitted(event: SuiEvent, data: GachaCommittedEvent): Promise<void> {
    await this.ensureUser(data.player);

    await prismaClient.gachaHistory.create({
      data: {
        player: data.player,
        tierId: data.tier_id,
        tierPrice: data.tier_price,
        result: data.is_car ? 'CAR' : 'SPAREPART',
        rarity: 0, // Will be updated on reveal
        commitHash: data.commit_hash,
      },
    });

    logger.info(`🎰 Gacha committed by ${data.player}, tier ${data.tier_id}`);
  }

  private static async handleGachaResult(event: SuiEvent, data: GachaResultEvent): Promise<void> {
    await prismaClient.gachaHistory.updateMany({
      where: {
        player: data.player,
        resultUid: null,
      },
      data: {
        resultUid: data.nft_uid,
        rarity: data.rarity,
        revealedAt: new Date(),
      },
    });

    logger.info(`🎁 Gacha revealed: ${data.name} (${data.nft_uid}) for ${data.player}`);
  }

  // Marketplace events
  private static async handleCarListed(event: SuiEvent, data: CarListedEvent): Promise<void> {
    const car = await prismaClient.car.findUnique({
      where: { uid: data.car_uid },
    });

    if (car) {
      await prismaClient.car.update({
        where: { uid: data.car_uid },
        data: { isListed: true },
      });

      await prismaClient.marketListing.create({
        data: {
          listingId: data.listing_id,
          seller: data.seller,
          nftType: 'CAR',
          nftUid: data.car_uid,
          carId: car.id,
          price: data.price,
          expiry: data.expiry,
          txDigest: event.id.txDigest,
        },
      });

      logger.info(`📋 Car listed: ${data.car_uid} for ${data.price}`);
    }
  }

  private static async handleSparePartListed(event: SuiEvent, data: SparePartListedEvent): Promise<void> {
    const part = await prismaClient.sparePart.findUnique({
      where: { uid: data.part_uid },
    });

    if (part) {
      await prismaClient.sparePart.update({
        where: { uid: data.part_uid },
        data: { isListed: true },
      });

      await prismaClient.marketListing.create({
        data: {
          listingId: data.listing_id,
          seller: data.seller,
          nftType: 'SPAREPART',
          nftUid: data.part_uid,
          sparePartId: part.id,
          price: data.price,
          expiry: data.expiry,
          txDigest: event.id.txDigest,
        },
      });

      logger.info(`📋 SparePart listed: ${data.part_uid} for ${data.price}`);
    }
  }

  private static async handleNFTSold(event: SuiEvent, data: NFTSoldEvent): Promise<void> {
    await this.ensureUser(data.buyer);

    const listing = await prismaClient.marketListing.findUnique({
      where: { listingId: data.listing_id },
    });

    if (listing) {
      await prismaClient.marketListing.update({
        where: { listingId: data.listing_id },
        data: {
          isActive: false,
          isSold: true,
          soldAt: new Date(),
        },
      });

      // Update NFT owner
      if (listing.nftType === 'CAR') {
        await prismaClient.car.update({
          where: { uid: data.nft_uid },
          data: { owner: data.buyer, isListed: false },
        });
      } else {
        await prismaClient.sparePart.update({
          where: { uid: data.nft_uid },
          data: { owner: data.buyer, isListed: false },
        });
      }

      logger.info(`💰 NFT sold: ${data.nft_uid} to ${data.buyer}`);
    }
  }

  private static async handleListingCancelled(event: SuiEvent, data: ListingCancelledEvent): Promise<void> {
    const listing = await prismaClient.marketListing.findUnique({
      where: { listingId: data.listing_id },
    });

    if (listing) {
      await prismaClient.marketListing.update({
        where: { listingId: data.listing_id },
        data: { isActive: false },
      });

      // Update NFT status
      if (listing.nftType === 'CAR') {
        await prismaClient.car.update({
          where: { uid: data.nft_uid },
          data: { isListed: false },
        });
      } else {
        await prismaClient.sparePart.update({
          where: { uid: data.nft_uid },
          data: { isListed: false },
        });
      }

      logger.info(`❌ Listing cancelled: ${data.listing_id}`);
    }
  }

  // Prediction events
  private static async handlePoolCreated(event: SuiEvent, data: PoolCreatedEvent): Promise<void> {
    const room = await prismaClient.room.findUnique({
      where: { roomUid: data.room_uid },
    });

    if (room) {
      await prismaClient.predictionPool.create({
        data: {
          roomId: room.id,
          roomUid: data.room_uid,
          txDigest: event.id.txDigest,
        },
      });

      logger.info(`🎲 Prediction pool created for room ${data.room_uid}`);
    }
  }

  private static async handleBetPlaced(event: SuiEvent, data: BetPlacedEvent): Promise<void> {
    await this.ensureUser(data.bettor);

    const pool = await prismaClient.predictionPool.findUnique({
      where: { roomUid: data.room_uid },
    });

    if (pool) {
      await prismaClient.bet.create({
        data: {
          poolId: pool.id,
          bettor: data.bettor,
          predictedWinner: data.predicted_winner,
          amount: data.amount,
        },
      });

      await prismaClient.predictionPool.update({
        where: { id: pool.id },
        data: {
          totalPool: (BigInt(pool.totalPool) + BigInt(data.amount)).toString(),
        },
      });

      logger.info(`💸 Bet placed: ${data.amount} on ${data.predicted_winner}`);
    }
  }

  private static async handlePredictionSettled(event: SuiEvent, data: PredictionSettledEvent): Promise<void> {
    await prismaClient.predictionPool.updateMany({
      where: { roomUid: data.room_uid },
      data: {
        isSettled: true,
        actualWinner: data.actual_winner,
        totalPool: data.total_pool,
        settledAt: new Date(),
      },
    });

    logger.info(`✅ Prediction settled for room ${data.room_uid}, winner: ${data.actual_winner}`);
  }

  private static async handlePayoutClaimed(event: SuiEvent, data: PayoutClaimedEvent): Promise<void> {
    const pool = await prismaClient.predictionPool.findUnique({
      where: { roomUid: data.room_uid },
    });

    if (pool) {
      await prismaClient.bet.updateMany({
        where: {
          poolId: pool.id,
          bettor: data.bettor,
        },
        data: {
          hasClaimed: true,
          payout: data.payout,
          claimedAt: new Date(),
        },
      });

      logger.info(`💰 Payout claimed: ${data.payout} by ${data.bettor}`);
    }
  }

  // RWA events
  private static async handlePhysicalClaimed(event: SuiEvent, data: PhysicalClaimedEvent): Promise<void> {
    await this.ensureUser(data.claimant);

    const car = await prismaClient.car.findUnique({
      where: { uid: data.car_uid },
    });

    if (car) {
      await prismaClient.car.update({
        where: { uid: data.car_uid },
        data: { isClaimed: true },
      });

      const claim = await prismaClient.physicalClaim.create({
        data: {
          claimant: data.claimant,
          carUid: data.car_uid,
          carId: car.id,
          shippingAddress: 'Pending', // Will be updated by user
          txDigest: event.id.txDigest,
        },
      });

      // Create claimed parts
      for (const partUid of data.part_uids) {
        const part = await prismaClient.sparePart.findUnique({
          where: { uid: partUid },
        });

        if (part) {
          await prismaClient.sparePart.update({
            where: { uid: partUid },
            data: { isClaimed: true },
          });

          await prismaClient.claimedPart.create({
            data: {
              claimId: claim.id,
              partUid: partUid,
              partId: part.id,
            },
          });
        }
      }

      logger.info(`🎁 Physical claimed: ${data.car_uid} by ${data.claimant}`);
    }
  }
}

export default EventHandler;
