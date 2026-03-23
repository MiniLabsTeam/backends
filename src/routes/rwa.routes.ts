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
        claimant: true,
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
 * POST /api/rwa/claim/:carUid
 * Submit a physical RWA claim for a car + matching brand spare parts
 */
router.post(
  '/claim/:carUid',
  authenticate,
  validate(
    Joi.object({
      shippingAddress: Joi.object({
        name: Joi.string().min(2).max(100).required(),
        phone: Joi.string().min(5).max(30).required(),
        street: Joi.string().min(5).max(200).required(),
        city: Joi.string().min(2).max(100).required(),
        postal: Joi.string().min(2).max(20).required(),
        country: Joi.string().min(2).max(100).required(),
      }).required(),
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { carUid } = req.params;
    const { shippingAddress } = req.body;

    // Find the car
    const car = await prismaClient.car.findUnique({
      where: { uid: carUid },
    });

    if (!car) {
      throw new AppError('Car not found', 404);
    }
    if (car.owner !== req.user.address) {
      throw new AppError('You do not own this car', 403);
    }
    if (car.isClaimed) {
      throw new AppError('This car has already been claimed', 400);
    }
    if (car.isListed) {
      throw new AppError('Cannot claim a car that is listed on the marketplace', 400);
    }

    // Check existing claim
    const existingClaim = await prismaClient.physicalClaim.findUnique({
      where: { carUid },
    });
    if (existingClaim) {
      throw new AppError('A claim for this car already exists', 400);
    }

    // Find matching brand spare parts (one of each type: 0=Wheels,1=Engine,2=Body,3=Shocks)
    const typeNames = ['Wheels', 'Engine', 'Body', 'Shocks'];
    const selectedParts: any[] = [];

    for (const partType of [0, 1, 2, 3]) {
      const part = await prismaClient.sparePart.findFirst({
        where: {
          owner: req.user.address,
          compatibleBrand: car.brand,
          partType,
          isClaimed: false,
          isListed: false,
          isEquipped: false,
        },
      });
      if (!part) {
        throw new AppError(
          `Missing required part: ${typeNames[partType]} (compatible with car brand)`,
          400
        );
      }
      selectedParts.push(part);
    }

    // Serialize shipping address to JSON string
    const shippingAddressStr = JSON.stringify(shippingAddress);

    // Create claim + mark car and parts as claimed in a transaction
    const claim = await prismaClient.$transaction(async (tx) => {
      await tx.car.update({ where: { uid: carUid }, data: { isClaimed: true } });

      for (const part of selectedParts) {
        await tx.sparePart.update({ where: { uid: part.uid }, data: { isClaimed: true } });
      }

      const newClaim = await tx.physicalClaim.create({
        data: {
          claimant: req.user!.address,
          carUid: car.uid,
          carId: car.id,
          shippingAddress: shippingAddressStr,
          status: 'PENDING',
        },
      });

      for (const part of selectedParts) {
        await tx.claimedPart.create({
          data: { claimId: newClaim.id, partUid: part.uid, partId: part.id },
        });
      }

      return newClaim;
    });

    res.status(201).json({
      success: true,
      data: claim,
      message: 'Physical claim submitted successfully',
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
    const TYPE_NAMES: Record<number, string> = { 0: 'Wheels', 1: 'Engine', 2: 'Body', 3: 'Shocks' };
    const eligibleCars = cars.map((car) => {
      const brandParts = partsByBrand[car.brand] || {};
      const partStatus = {
        wheels: brandParts[0]?.[0] || null,
        engine: brandParts[1]?.[0] || null,
        body:   brandParts[2]?.[0] || null,
        shocks: brandParts[3]?.[0] || null,
      };
      const missingParts = [0, 1, 2, 3]
        .filter((t) => !brandParts[t])
        .map((t) => TYPE_NAMES[t]);
      const isEligible = missingParts.length === 0;

      return {
        car,
        isEligible,
        availableParts: isEligible ? partStatus : null,
        partStatus,
        missingParts,
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
