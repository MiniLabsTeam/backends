import { Router, Response } from 'express';
import { prismaClient } from '../config/database';
import { authenticate, AuthRequest, optionalAuthenticate } from '../middleware/auth';
import { marketplaceLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validator';
import { asyncHandler, AppError } from '../middleware/errorHandler';
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

    const skip = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    const take = parseInt(limit as string, 10);

    const [listings, total] = await Promise.all([
      prismaClient.marketListing.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy as string]: sortOrder },
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
  asyncHandler(async (req, res: Response) => {
    const [totalListings, totalSold, avgPrice] = await Promise.all([
      prismaClient.marketListing.count({
        where: { isActive: true },
      }),
      prismaClient.marketListing.count({
        where: { isSold: true },
      }),
      prismaClient.marketListing.aggregate({
        where: { isActive: true },
        _avg: { price: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalListings,
        totalSold,
        averagePrice: avgPrice._avg.price || '0',
      },
    });
  })
);

export default router;
