import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prismaClient } from '../config/database';

// Extend Express Request to include user
export interface AuthRequest extends Request {
  user?: {
    id: string;
    address: string;
    username?: string;
  };
}

// JWT payload interface
interface JWTPayload {
  userId: string;
  address: string;
  username?: string;
}

// Middleware to verify JWT token
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'No token provided',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, env.jwtSecret) as JWTPayload;

    // Check if user exists (use address as primary identifier)
    const user = await prismaClient.user.findUnique({
      where: { address: decoded.address },
      select: {
        id: true,
        address: true,
        username: true,
      },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Invalid token - user not found',
      });
      return;
    }

    // Attach user to request
    req.user = user;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
      return;
    }

    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Token expired',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Authentication failed',
    });
  }
};

// Optional authentication (doesn't fail if no token)
export const optionalAuthenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user
      next();
      return;
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, env.jwtSecret) as JWTPayload;

      const user = await prismaClient.user.findUnique({
        where: { address: decoded.address },
        select: {
          id: true,
          address: true,
          username: true,
        },
      });

      if (user) {
        req.user = user;
      }
    } catch (error) {
      // Invalid token, but continue without user
    }

    next();
  } catch (error) {
    next();
  }
};

// Generate JWT token
export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
};

// Generate refresh token
export const generateRefreshToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn,
  });
};

// Verify refresh token
export const verifyRefreshToken = (token: string): JWTPayload => {
  return jwt.verify(token, env.jwtRefreshSecret) as JWTPayload;
};

// Middleware to check if user owns a resource
export const checkOwnership = (
  getOwnerAddress: (req: AuthRequest) => string | Promise<string>
) => {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const ownerAddress = await getOwnerAddress(req);

      if (ownerAddress !== req.user.address) {
        res.status(403).json({
          success: false,
          error: 'You do not have permission to access this resource',
        });
        return;
      }

      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to verify ownership',
      });
    }
  };
};

export default authenticate;
