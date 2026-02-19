import { Router, Response } from 'express';
import { gameEngineService } from '../services/game/GameEngineService';
import { prismaClient } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validator';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import Joi from 'joi';

const router = Router();

/**
 * POST /api/game/room/create
 * Create a new game room
 */
router.post(
  '/room/create',
  authenticate,
  validate(
    Joi.object({
      gameMode: Joi.string().valid('ENDLESS_RACE', 'DRAG_RACE', 'ROYAL_RUMBLE').required(),
      maxPlayers: Joi.number().integer().min(1).max(8).required(), // Allow 1 player for solo testing
      entryFee: Joi.string().required(),
      deadline: Joi.date().iso().required(),
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { gameMode, maxPlayers, entryFee, deadline } = req.body;

    const room = await gameEngineService.createRoom(
      gameMode,
      req.user.address,
      maxPlayers,
      entryFee,
      new Date(deadline).toISOString()
    );

    res.status(201).json({
      success: true,
      data: room,
      message: 'Room created successfully',
    });
  })
);

/**
 * POST /api/game/room/:roomUid/join
 * Join a game room
 */
router.post(
  '/room/:roomUid/join',
  authenticate,
  validate(
    Joi.object({
      carUid: Joi.string().required(),
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { roomUid } = req.params;
    const { carUid } = req.body;

    const result = await gameEngineService.joinRoom(
      roomUid,
      req.user.address,
      carUid
    );

    res.json({
      success: true,
      data: result,
      message: 'Joined room successfully',
    });
  })
);

/**
 * POST /api/game/room/:roomUid/ready
 * Mark player as ready
 */
router.post(
  '/room/:roomUid/ready',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { roomUid } = req.params;

    await gameEngineService.markPlayerReady(roomUid, req.user.address);

    res.json({
      success: true,
      message: 'Marked as ready',
    });
  })
);

/**
 * GET /api/game/room/:roomUid
 * Get room details and status
 */
router.get(
  '/room/:roomUid',
  asyncHandler(async (req, res: Response) => {
    const { roomUid } = req.params;

    const room = await prismaClient.room.findUnique({
      where: { uid: roomUid },
      include: {
        players: {
          include: {
            user: {
              select: {
                address: true,
                username: true,
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new AppError('Room not found', 404);
    }

    res.json({
      success: true,
      data: room,
    });
  })
);

/**
 * GET /api/game/rooms
 * List active game rooms
 */
router.get(
  '/rooms',
  asyncHandler(async (req, res: Response) => {
    const { gameMode, status } = req.query;

    const where: any = {
      isPublic: true,
    };

    if (gameMode) {
      where.gameMode = gameMode;
    }

    if (status) {
      where.status = status;
    }

    const rooms = await prismaClient.room.findMany({
      where,
      include: {
        players: {
          include: {
            user: {
              select: {
                address: true,
                username: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({
      success: true,
      data: rooms,
    });
  })
);

/**
 * GET /api/game/:roomUid/state
 * Get current game state (for polling)
 */
router.get(
  '/:roomUid/state',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { roomUid } = req.params;

    const state = await gameEngineService.getGameState(roomUid);

    if (!state) {
      throw new AppError('Game state not found', 404);
    }

    res.json({
      success: true,
      data: state,
    });
  })
);

/**
 * POST /api/game/:roomUid/input
 * Submit player input
 */
router.post(
  '/:roomUid/input',
  authenticate,
  validate(
    Joi.object({
      action: Joi.string()
        .valid('ACCELERATE', 'BRAKE', 'TURN_LEFT', 'TURN_RIGHT', 'DRIFT', 'BOOST')
        .required(),
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { roomUid } = req.params;
    const { action } = req.body;

    await gameEngineService.processPlayerInput(
      roomUid,
      req.user.address,
      action
    );

    res.json({
      success: true,
      message: 'Input processed',
    });
  })
);

/**
 * GET /api/game/:roomUid/result
 * Get race result
 */
router.get(
  '/:roomUid/result',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { roomUid } = req.params;

    const result = await gameEngineService.getGameResult(roomUid);

    if (!result) {
      throw new AppError('Race result not found', 404);
    }

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * GET /api/game/active
 * Get list of active games
 */
router.get(
  '/active',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const activeGames = gameEngineService.getActiveGames();

    res.json({
      success: true,
      data: {
        activeGames,
        count: activeGames.length,
      },
    });
  })
);

/**
 * POST /api/game/:roomUid/stop
 * Stop a game (admin/debug endpoint)
 */
router.post(
  '/:roomUid/stop',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const { roomUid } = req.params;

    await gameEngineService.stopGame(roomUid);

    res.json({
      success: true,
      message: 'Game stopped',
    });
  })
);

export default router;
