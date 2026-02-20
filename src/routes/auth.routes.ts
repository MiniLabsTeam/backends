import { Router, Request, Response } from 'express';
import { authService } from '../services/auth/AuthService';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { validate, schemas } from '../middleware/validator';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import Joi from 'joi';

const router = Router();

/**
 * POST /api/auth/nonce
 * Get nonce for wallet signing
 */
router.post(
  '/nonce',
  authLimiter,
  validate(
    Joi.object({
      address: schemas.address,
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { address } = req.body;

    const nonce = await authService.generateNonce(address);
    const message = authService.getSignMessage(address, nonce);

    res.json({
      success: true,
      data: {
        nonce,
        message,
      },
    });
  })
);

/**
 * POST /api/auth/connect
 * Wallet connect - verify signature and issue JWT
 */
router.post(
  '/connect',
  authLimiter,
  validate(schemas.walletConnect),
  asyncHandler(async (req: Request, res: Response) => {
    const { address, signature, message } = req.body;

    const result = await authService.verifyAndAuthenticate(address, signature, message);

    res.json({
      success: true,
      data: result,
      message: 'Authentication successful',
    });
  })
);

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post(
  '/refresh',
  authLimiter,
  validate(schemas.refreshToken),
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    const tokens = await authService.refreshAccessToken(refreshToken);

    res.json({
      success: true,
      data: tokens,
      message: 'Token refreshed successfully',
    });
  })
);

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const user = await authService.getUserById(req.user.id);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        address: user.address,
        username: user.username,
        email: user.email,
        tokenBalance: (user as any).tokenBalance ?? 0,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
      },
    });
  })
);

/**
 * POST /api/auth/logout
 * Logout user (invalidate refresh token)
 */
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('User not found', 401);
    }

    await authService.logout(req.user.id);

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  })
);

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put(
  '/profile',
  authenticate,
  validate(
    Joi.object({
      username: Joi.string().alphanum().min(3).max(20).optional(),
      email: Joi.string().email().optional(),
    })
  ),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('User not found', 401);
    }

    const { username, email } = req.body;

    // Check username availability if provided
    if (username) {
      const isAvailable = await authService.isUsernameAvailable(username);
      if (!isAvailable) {
        throw new AppError('Username already taken', 400);
      }
    }

    const updatedUser = await authService.updateProfile(req.user.id, {
      username,
      email,
    });

    res.json({
      success: true,
      data: {
        id: updatedUser.id,
        address: updatedUser.address,
        username: updatedUser.username,
        email: updatedUser.email,
      },
      message: 'Profile updated successfully',
    });
  })
);

/**
 * GET /api/auth/check-username/:username
 * Check if username is available
 */
router.get(
  '/check-username/:username',
  asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.params;

    if (!username || username.length < 3 || username.length > 20) {
      throw new AppError('Username must be between 3 and 20 characters', 400);
    }

    const isAvailable = await authService.isUsernameAvailable(username);

    res.json({
      success: true,
      data: {
        username,
        available: isAvailable,
      },
    });
  })
);

/**
 * GET /api/auth/user/:address
 * Get user by wallet address (public info only)
 */
router.get(
  '/user/:address',
  asyncHandler(async (req: Request, res: Response) => {
    const { address } = req.params;

    const user = await authService.getUserByAddress(address);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      success: true,
      data: {
        address: user.address,
        username: user.username,
        createdAt: user.createdAt,
      },
    });
  })
);

/**
 * POST /api/auth/test-login
 * TESTING ONLY - Direct login without wallet signature
 * This endpoint should be REMOVED in production!
 */
if (process.env.NODE_ENV !== 'production') {
  router.post(
    '/test-login',
    validate(
      Joi.object({
        address: schemas.address,
      })
    ),
    asyncHandler(async (req: Request, res: Response) => {
      const { address } = req.body;

      // Generate test token without signature verification
      const token = await authService.generateTestToken(address);

      res.json({
        success: true,
        data: {
          accessToken: token,
          user: {
            address,
          },
        },
        message: '⚠️  TEST LOGIN - Not for production use!',
      });
    })
  );
}

export default router;
