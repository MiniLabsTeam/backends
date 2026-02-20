import { Router, Response } from 'express';
import { prismaClient } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate, schemas } from '../middleware/validator';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import Joi from 'joi';

const router = Router();

/**
 * GET /api/inventory/cars
 * Get user's cars
 */
router.get(
  '/cars',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const cars = await prismaClient.car.findMany({
      where: { owner: req.user.address },
      orderBy: { createdAt: 'desc' },
      include: {
        equippedParts: {
          include: {
            part: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: cars,
    });
  })
);

/**
 * GET /api/inventory/car/:uid
 * Get specific car details
 */
router.get(
  '/car/:uid',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { uid } = req.params;

    const car = await prismaClient.car.findUnique({
      where: { uid },
      include: {
        equippedParts: {
          include: {
            part: true,
          },
        },
      },
    });

    if (!car) {
      throw new AppError('Car not found', 404);
    }

    if (car.owner !== req.user.address) {
      throw new AppError('You do not own this car', 403);
    }

    // Calculate final stats (base + equipped parts bonuses)
    const finalStats = {
      speed: car.baseSpeed,
      acceleration: car.baseAcceleration,
      handling: car.baseHandling,
      drift: car.baseDrift,
    };

    for (const equippedPart of car.equippedParts) {
      finalStats.speed += equippedPart.part.bonusSpeed;
      finalStats.acceleration += equippedPart.part.bonusAcceleration;
      finalStats.handling += equippedPart.part.bonusHandling;
      finalStats.drift += equippedPart.part.bonusDrift;
    }

    res.json({
      success: true,
      data: {
        ...car,
        finalStats,
      },
    });
  })
);

/**
 * GET /api/inventory/spareparts
 * Get user's spare parts
 */
router.get(
  '/spareparts',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const parts = await prismaClient.sparePart.findMany({
      where: { owner: req.user.address },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: parts,
    });
  })
);

/**
 * GET /api/inventory/sparepart/:uid
 * Get specific spare part details
 */
router.get(
  '/sparepart/:uid',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { uid } = req.params;

    const part = await prismaClient.sparePart.findUnique({
      where: { uid },
    });

    if (!part) {
      throw new AppError('Spare part not found', 404);
    }

    if (part.owner !== req.user.address) {
      throw new AppError('You do not own this spare part', 403);
    }

    res.json({
      success: true,
      data: part,
    });
  })
);

/**
 * GET /api/inventory/car/:uid/equipped
 * Get equipped parts for a car
 */
router.get(
  '/car/:uid/equipped',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { uid } = req.params;

    const car = await prismaClient.car.findUnique({
      where: { uid },
    });

    if (!car) {
      throw new AppError('Car not found', 404);
    }

    if (car.owner !== req.user.address) {
      throw new AppError('You do not own this car', 403);
    }

    const equippedParts = await prismaClient.equippedPart.findMany({
      where: { carUid: uid },
      include: {
        part: true,
      },
    });

    res.json({
      success: true,
      data: equippedParts.map((ep) => ep.part),
    });
  })
);

/**
 * GET /api/inventory/stats
 * Get user's inventory statistics
 */
router.get(
  '/stats',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const [totalCars, totalParts, rarityBreakdown] = await Promise.all([
      prismaClient.car.count({
        where: { owner: req.user.address },
      }),
      prismaClient.sparePart.count({
        where: { owner: req.user.address },
      }),
      prismaClient.car.groupBy({
        by: ['rarity'],
        where: { owner: req.user.address },
        _count: true,
      }),
    ]);

    const rarityStats = {
      0: 0, // Common
      1: 0, // Rare
      2: 0, // Epic
      3: 0, // Legendary
    };

    rarityBreakdown.forEach((item) => {
      rarityStats[item.rarity as keyof typeof rarityStats] = item._count;
    });

    res.json({
      success: true,
      data: {
        totalCars,
        totalParts,
        rarityBreakdown: rarityStats,
      },
    });
  })
);

/**
 * POST /api/inventory/car/:uid/equip
 * Equip a spare part onto a car
 */
router.post(
  '/car/:uid/equip',
  authenticate,
  validate(
    Joi.object({
      partUid: Joi.string().required(),
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { uid } = req.params;
    const { partUid } = req.body;

    const [car, part] = await Promise.all([
      prismaClient.car.findUnique({
        where: { uid },
        include: { equippedParts: true },
      }),
      prismaClient.sparePart.findUnique({ where: { uid: partUid } }),
    ]);

    if (!car) throw new AppError('Car not found', 404);
    if (car.owner !== req.user.address) throw new AppError('You do not own this car', 403);
    if (!part) throw new AppError('Spare part not found', 404);
    if (part.owner !== req.user.address) throw new AppError('You do not own this spare part', 403);
    if (part.isEquipped) throw new AppError('Part is already equipped on another car', 400);
    if (part.isListed) throw new AppError('Part is listed on marketplace — cancel listing first', 400);
    if (car.equippedParts.length >= car.slotLimit) {
      throw new AppError(`No available slots (car has ${car.slotLimit} slot(s), all used)`, 400);
    }

    await Promise.all([
      prismaClient.equippedPart.create({ data: { carUid: uid, partUid } }),
      prismaClient.sparePart.update({ where: { uid: partUid }, data: { isEquipped: true } }),
    ]);

    res.json({ success: true, message: 'Part equipped successfully' });
  })
);

/**
 * DELETE /api/inventory/car/:uid/equip/:partUid
 * Unequip a spare part from a car
 */
router.delete(
  '/car/:uid/equip/:partUid',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Authentication required', 401);

    const { uid, partUid } = req.params;

    const car = await prismaClient.car.findUnique({ where: { uid } });
    if (!car) throw new AppError('Car not found', 404);
    if (car.owner !== req.user.address) throw new AppError('You do not own this car', 403);

    const equipped = await prismaClient.equippedPart.findFirst({
      where: { carUid: uid, partUid },
    });
    if (!equipped) throw new AppError('Part is not equipped on this car', 404);

    await Promise.all([
      prismaClient.equippedPart.delete({ where: { id: equipped.id } }),
      prismaClient.sparePart.update({ where: { uid: partUid }, data: { isEquipped: false } }),
    ]);

    res.json({ success: true, message: 'Part unequipped successfully' });
  })
);

export default router;
