import { Router, Response } from 'express';
import { prismaClient } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validator';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import Joi from 'joi';

const router = Router();

/**
 * GET /api/rwa/claims
 * Get user's physical claims
 */
router.get(
  '/claims',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const claims = await prismaClient.physicalClaim.findMany({
      where: { claimant: req.user.address },
      include: {
        car: {
          select: {
            uid: true,
            name: true,
            brand: true,
            rarity: true,
          },
        },
        parts: {
          include: {
            part: {
              select: {
                uid: true,
                name: true,
                partType: true,
                rarity: true,
              },
            },
          },
        },
      },
      orderBy: { claimedAt: 'desc' },
    });

    res.json({
      success: true,
      data: claims,
    });
  })
);

/**
 * GET /api/rwa/claim/:carUid
 * Get specific claim details
 */
router.get(
  '/claim/:carUid',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { carUid } = req.params;

    const claim = await prismaClient.physicalClaim.findUnique({
      where: { carUid },
      include: {
        car: {
          select: {
            uid: true,
            name: true,
            brand: true,
            rarity: true,
            imageUrl: true,
          },
        },
        parts: {
          include: {
            part: {
              select: {
                uid: true,
                name: true,
                partType: true,
                rarity: true,
              },
            },
          },
        },
      },
    });

    if (!claim) {
      throw new AppError('Claim not found', 404);
    }

    if (claim.claimant !== req.user.address) {
      throw new AppError('You do not have permission to view this claim', 403);
    }

    res.json({
      success: true,
      data: claim,
    });
  })
);

/**
 * GET /api/rwa/claim/:carUid/status
 * Get shipping status for a claim
 */
router.get(
  '/claim/:carUid/status',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { carUid } = req.params;

    const claim = await prismaClient.physicalClaim.findUnique({
      where: { carUid },
      select: {
        carUid: true,
        status: true,
        trackingNumber: true,
        claimedAt: true,
        shippedAt: true,
        deliveredAt: true,
      },
    });

    if (!claim) {
      throw new AppError('Claim not found', 404);
    }

    if (claim.claimant !== req.user.address) {
      throw new AppError('You do not have permission to view this claim', 403);
    }

    res.json({
      success: true,
      data: claim,
    });
  })
);

/**
 * PUT /api/rwa/claim/:carUid/address
 * Update shipping address for a claim (only if status is PENDING)
 */
router.put(
  '/claim/:carUid/address',
  authenticate,
  validate(
    Joi.object({
      shippingAddress: Joi.string().min(10).max(500).required(),
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { carUid } = req.params;
    const { shippingAddress } = req.body;

    const claim = await prismaClient.physicalClaim.findUnique({
      where: { carUid },
    });

    if (!claim) {
      throw new AppError('Claim not found', 404);
    }

    if (claim.claimant !== req.user.address) {
      throw new AppError('You do not have permission to update this claim', 403);
    }

    if (claim.status !== 'PENDING') {
      throw new AppError('Cannot update address for claims that are already processing', 400);
    }

    const updatedClaim = await prismaClient.physicalClaim.update({
      where: { carUid },
      data: { shippingAddress },
    });

    res.json({
      success: true,
      data: updatedClaim,
      message: 'Shipping address updated successfully',
    });
  })
);

/**
 * GET /api/rwa/eligible
 * Get user's eligible items for RWA claim
 */
router.get(
  '/eligible',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    // Get all cars owned by user that are not claimed
    const cars = await prismaClient.car.findMany({
      where: {
        owner: req.user.address,
        isClaimed: false,
        isListed: false,
      },
    });

    // Get all spare parts owned by user that are not claimed
    const parts = await prismaClient.sparePart.findMany({
      where: {
        owner: req.user.address,
        isClaimed: false,
        isListed: false,
        isEquipped: false,
      },
    });

    // Group parts by brand and type
    const partsByBrand: Record<number, Record<number, any[]>> = {};
    for (const part of parts) {
      if (!partsByBrand[part.compatibleBrand]) {
        partsByBrand[part.compatibleBrand] = {};
      }
      if (!partsByBrand[part.compatibleBrand][part.partType]) {
        partsByBrand[part.compatibleBrand][part.partType] = [];
      }
      partsByBrand[part.compatibleBrand][part.partType].push(part);
    }

    // Check which cars are eligible (have all 4 part types of same brand)
    const eligibleCars = cars.map((car) => {
      const brandParts = partsByBrand[car.brand] || {};
      const hasAllTypes =
        brandParts[0] && // Wheels
        brandParts[1] && // Engine
        brandParts[2] && // Body
        brandParts[3]; // Shocks

      return {
        car,
        isEligible: !!hasAllTypes,
        availableParts: hasAllTypes
          ? {
              wheels: brandParts[0][0],
              engine: brandParts[1][0],
              body: brandParts[2][0],
              shocks: brandParts[3][0],
            }
          : null,
      };
    });

    res.json({
      success: true,
      data: eligibleCars,
    });
  })
);

/**
 * GET /api/rwa/stats
 * Get RWA claim statistics
 */
router.get(
  '/stats',
  asyncHandler(async (req, res: Response) => {
    const [totalClaims, pendingClaims, shippedClaims, deliveredClaims] =
      await Promise.all([
        prismaClient.physicalClaim.count(),
        prismaClient.physicalClaim.count({ where: { status: 'PENDING' } }),
        prismaClient.physicalClaim.count({ where: { status: 'SHIPPED' } }),
        prismaClient.physicalClaim.count({ where: { status: 'DELIVERED' } }),
      ]);

    res.json({
      success: true,
      data: {
        totalClaims,
        pendingClaims,
        shippedClaims,
        deliveredClaims,
      },
    });
  })
);

export default router;
