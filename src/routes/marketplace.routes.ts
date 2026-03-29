import { Router, Response } from 'express';
import { prismaClient } from '../config/database';
import { authenticate, AuthRequest, optionalAuthenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { validate } from '../middleware/validator';
import { suiClient } from '../config/blockchain';
import Joi from 'joi';

const router = Router();

/**
 * GET /api/marketplace/listings
 * Get all active marketplace listings
 */
router.get(
  '/listings',
  optionalAuthenticate,
  asyncHandler(async (req, res: Response) => {
    const {
      nftType,
      brand,
      rarity,
      minPrice,
      maxPrice,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
    } = req.query;

    const where: any = {
      isActive: true,
      isSold: false,
    };

    if (nftType) {
      where.nftType = nftType;
    }

    if (brand !== undefined) {
      if (nftType === 'CAR') {
        where.car = { brand: parseInt(brand as string, 10) };
      } else if (nftType === 'SPAREPART') {
        where.sparePart = { compatibleBrand: parseInt(brand as string, 10) };
      }
    }

    if (rarity !== undefined) {
      if (nftType === 'CAR') {
        where.car = { ...where.car, rarity: parseInt(rarity as string, 10) };
      } else if (nftType === 'SPAREPART') {
        where.sparePart = { ...where.sparePart, rarity: parseInt(rarity as string, 10) };
      }
    }

    if (minPrice) {
      where.price = { gte: minPrice };
    }

    if (maxPrice) {
      where.price = { ...where.price, lte: maxPrice };
    }

    const sortFieldMap: Record<string, string> = {
      newest: 'createdAt',
      oldest: 'createdAt',
      price_asc: 'price',
      price_desc: 'price',
      createdAt: 'createdAt',
      price: 'price',
    };
    const sortOrderMap: Record<string, string> = {
      newest: 'desc',
      oldest: 'asc',
      price_asc: 'asc',
      price_desc: 'desc',
    };
    const resolvedSortBy = sortFieldMap[sortBy as string] ?? 'createdAt';
    const resolvedSortOrder = sortOrderMap[sortBy as string] ?? (sortOrder as string) ?? 'desc';

    const skip = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    const take = parseInt(limit as string, 10);

    const [listings, total] = await Promise.all([
      prismaClient.marketListing.findMany({
        where,
        skip,
        take,
        orderBy: { [resolvedSortBy]: resolvedSortOrder },
        include: {
          car: true,
          sparePart: true,
          sellerUser: {
            select: {
              address: true,
              username: true,
            },
          },
        },
      }),
      prismaClient.marketListing.count({ where }),
    ]);

    res.json({
      success: true,
      data: listings,
      pagination: {
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit as string, 10)),
      },
    });
  })
);

/**
 * GET /api/marketplace/listing/:listingId
 * Get specific listing details
 */
router.get(
  '/listing/:listingId',
  asyncHandler(async (req, res: Response) => {
    const { listingId } = req.params;

    const listing = await prismaClient.marketListing.findUnique({
      where: { listingId },
      include: {
        car: true,
        sparePart: true,
        sellerUser: {
          select: {
            address: true,
            username: true,
          },
        },
      },
    });

    if (!listing) {
      throw new AppError('Listing not found', 404);
    }

    res.json({
      success: true,
      data: listing,
    });
  })
);

/**
 * GET /api/marketplace/my-listings
 * Get user's active listings
 */
router.get(
  '/my-listings',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const listings = await prismaClient.marketListing.findMany({
      where: {
        seller: req.user.address,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        car: true,
        sparePart: true,
      },
    });

    res.json({
      success: true,
      data: listings,
    });
  })
);

/**
 * GET /api/marketplace/sold
 * Get user's sold items
 */
router.get(
  '/sold',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const soldItems = await prismaClient.marketListing.findMany({
      where: {
        seller: req.user.address,
        isSold: true,
      },
      orderBy: { soldAt: 'desc' },
      include: {
        car: true,
        sparePart: true,
      },
    });

    res.json({
      success: true,
      data: soldItems,
    });
  })
);

/**
 * GET /api/marketplace/stats
 * Get marketplace statistics
 */
router.get(
  '/stats',
  asyncHandler(async (_req, res: Response) => {
    const [totalListings, totalSold, activeListings] = await Promise.all([
      prismaClient.marketListing.count({
        where: { isActive: true },
      }),
      prismaClient.marketListing.count({
        where: { isSold: true },
      }),
      prismaClient.marketListing.findMany({
        where: { isActive: true },
        select: { price: true },
      }),
    ]);

    // Calculate average price manually since price is stored as string
    const avgPrice = activeListings.length > 0
      ? (activeListings.reduce((sum, l) => sum + BigInt(l.price), BigInt(0)) / BigInt(activeListings.length)).toString()
      : '0';

    res.json({
      success: true,
      data: {
        totalListings,
        totalSold,
        averagePrice: avgPrice,
      },
    });
  })
);

/**
 * POST /api/marketplace/list
 * List an NFT for sale
 */
router.post(
  '/list',
  authenticate,
  validate(
    Joi.object({
      nftType: Joi.string().valid('car', 'sparePart').required(),
      nftUid: Joi.string().required(),
      price: Joi.string().pattern(/^\d+$/).required(),
      txDigest: Joi.string().optional(),
      onChainListingId: Joi.string().allow(null).optional(),
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { nftType, nftUid, price, txDigest, onChainListingId } = req.body;
    const seller = req.user.address;

    if (BigInt(price) <= 0n) throw new AppError('Price must be greater than 0', 400);

    let carId: string | undefined;
    let sparePartId: string | undefined;

    if (nftType === 'car') {
      const item = await prismaClient.car.findUnique({ where: { uid: nftUid } });
      if (!item) throw new AppError('Car not found', 404);
      if (item.owner !== seller) throw new AppError('You do not own this car', 403);
      if (item.isListed) throw new AppError('Car is already listed', 400);
      if (item.isClaimed) throw new AppError('Cannot list a claimed car', 400);
      carId = item.id;
    } else {
      const item = await prismaClient.sparePart.findUnique({ where: { uid: nftUid } });
      if (!item) throw new AppError('Spare part not found', 404);
      if (item.owner !== seller) throw new AppError('You do not own this spare part', 403);
      if (item.isListed) throw new AppError('Spare part is already listed', 400);
      if (item.isClaimed) throw new AppError('Cannot list a claimed part', 400);
      sparePartId = item.id;
    }

    const expiryMs = (Date.now() + 30 * 24 * 60 * 60 * 1000).toString();

    const listing = await prismaClient.$transaction(async (tx) => {
      if (nftType === 'car') {
        await tx.car.update({ where: { uid: nftUid }, data: { isListed: true } });
      } else {
        await tx.sparePart.update({ where: { uid: nftUid }, data: { isListed: true } });
      }

      return tx.marketListing.create({
        data: {
          listingId: require('crypto').randomUUID(),
          seller,
          nftType: nftType === 'car' ? 'CAR' : 'SPAREPART',
          nftUid,
          price,
          expiry: expiryMs,
          isActive: true,
          isSold: false,
          carId: carId ?? null,
          sparePartId: sparePartId ?? null,
          txDigest: txDigest ?? null,
          onChainListingId: onChainListingId ?? null,
        },
        include: { car: true, sparePart: true },
      });
    });

    res.status(201).json({ success: true, data: listing, message: 'Item listed successfully' });
  })
);

/**
 * DELETE /api/marketplace/listing/:listingId
 * Cancel (delist) a listing
 */
router.delete(
  '/listing/:listingId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { listingId } = req.params;
    const listing = await prismaClient.marketListing.findUnique({ where: { listingId } });
    if (!listing) throw new AppError('Listing not found', 404);
    if (listing.seller !== req.user.address) throw new AppError('You do not own this listing', 403);
    if (!listing.isActive) throw new AppError('Listing is already inactive', 400);
    if (listing.isSold) throw new AppError('Cannot cancel a sold listing', 400);

    await prismaClient.$transaction(async (tx) => {
      await tx.marketListing.update({ where: { listingId }, data: { isActive: false } });
      if (listing.nftType === 'CAR' && listing.carId) {
        await tx.car.update({ where: { id: listing.carId }, data: { isListed: false } });
      } else if (listing.sparePartId) {
        await tx.sparePart.update({ where: { id: listing.sparePartId }, data: { isListed: false } });
      }
    });

    res.json({ success: true, message: 'Listing cancelled successfully' });
  })
);

/**
 * POST /api/marketplace/buy/:listingId
 * Record a completed on-chain purchase — update DB ownership
 */
router.post(
  '/buy/:listingId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { listingId } = req.params;
    const buyer = req.user.address;

    const listing = await prismaClient.marketListing.findUnique({ where: { listingId } });
    if (!listing) throw new AppError('Listing not found', 404);
    if (!listing.isActive) throw new AppError('Listing is already inactive', 400);
    if (listing.isSold) throw new AppError('Listing is already sold', 400);
    if (listing.seller === buyer) throw new AppError('Cannot buy your own listing', 400);

    await prismaClient.$transaction(async (tx) => {
      await tx.marketListing.update({
        where: { listingId },
        data: { isActive: false, isSold: true, soldAt: new Date() },
      });
      if (listing.nftType === 'CAR' && listing.carId) {
        await tx.car.update({ where: { id: listing.carId }, data: { owner: buyer, isListed: false } });
      } else if (listing.sparePartId) {
        await tx.sparePart.update({ where: { id: listing.sparePartId }, data: { owner: buyer, isListed: false } });
      }
    });

    res.json({ success: true, message: 'Purchase recorded successfully' });
  })
);

/**
 * GET /api/marketplace/tx-events/:digest
 * Proxy: fetch transaction events from blockchain (avoids browser CORS)
 */
router.get(
  '/tx-events/:digest',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { digest } = req.params;
    try {
      const txData = await suiClient.getTransactionBlock({
        digest,
        options: { showEvents: true, showObjectChanges: true },
      });
      res.json({ success: true, events: txData.events || [], objectChanges: txData.objectChanges || [] });
    } catch (err) {
      console.error('[tx-events] error:', err);
      res.json({ success: true, events: [], objectChanges: [] });
    }
  })
);

/**
 * GET /api/marketplace/owned-objects
 * Proxy: fetch owned NFT objects from blockchain (avoids browser CORS)
 */
router.get(
  '/owned-objects',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Authentication required', 401);
    const { structType } = req.query;
    if (!structType) throw new AppError('structType is required', 400);

    const objects: any[] = [];
    let cursor: string | null | undefined = undefined;
    do {
      const page = await suiClient.getOwnedObjects({
        owner: req.user.address,
        filter: { StructType: structType as string },
        options: { showContent: true },
        cursor,
      });
      objects.push(...page.data);
      cursor = page.hasNextPage ? page.nextCursor : undefined;
    } while (cursor);

    res.json({ success: true, data: objects });
  })
);

export default router;
