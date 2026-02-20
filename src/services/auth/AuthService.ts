import { prismaClient } from '../../config/database';
import { cache } from '../../config/redis';
import { generateNonce } from '../../utils/crypto';
import { generateToken, generateRefreshToken, verifyRefreshToken } from '../../middleware/auth';
import logger from '../../config/logger';
import { User } from '../../types';
import { verifyPersonalMessage } from '@mysten/sui.js/verify';

/**
 * AuthService
 *
 * Handles Web3 wallet authentication:
 * 1. Generate nonce for wallet signing
 * 2. Verify wallet signature
 * 3. Issue JWT tokens
 * 4. Refresh tokens
 */
export class AuthService {
  private static instance: AuthService;

  private constructor() {
    logger.info('🔐 AuthService initialized');
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Get or create user by wallet address
   */
  private async getOrCreateUser(address: string): Promise<User> {
    let user = await prismaClient.user.findUnique({
      where: { address },
    });

    if (!user) {
      // Create new user
      user = await prismaClient.user.create({
        data: {
          address,
          nonce: generateNonce(),
        },
      });

      logger.info(`New user created: ${address}`);
    }

    return user;
  }

  /**
   * Generate nonce for wallet signing
   * Nonce is stored in cache and database
   */
  public async generateNonce(address: string): Promise<string> {
    // Normalize address
    const normalizedAddress = address.toLowerCase();

    // Get or create user
    const user = await this.getOrCreateUser(normalizedAddress);

    // Generate new nonce
    const nonce = generateNonce();

    // Update user nonce in database
    await prismaClient.user.update({
      where: { address: normalizedAddress },
      data: { nonce },
    });

    // Store nonce in cache (expires in 5 minutes)
    const cacheKey = `auth:nonce:${normalizedAddress}`;
    await cache.set(cacheKey, nonce, 300);

    logger.info(`Nonce generated for ${normalizedAddress}`);

    return nonce;
  }

  /**
   * Get message to sign
   * Standard format for wallet signing
   */
  public getSignMessage(address: string, nonce: string): string {
    return `OneChain Racing Game - Sign in

Wallet Address: ${address}
Nonce: ${nonce}

This request will not trigger a blockchain transaction or cost any gas fees.`;
  }

  /**
   * Verify wallet signature and authenticate user
   */
  public async verifyAndAuthenticate(
    address: string,
    signature: string,
    message: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      address: string;
      username?: string;
    };
  }> {
    // Normalize address
    const normalizedAddress = address.toLowerCase();

    // Get user
    const user = await prismaClient.user.findUnique({
      where: { address: normalizedAddress },
    });

    if (!user) {
      throw new Error('User not found. Please request a nonce first.');
    }

    // Verify nonce exists in cache or database
    const cacheKey = `auth:nonce:${normalizedAddress}`;
    const cachedNonce = await cache.get<string>(cacheKey);

    if (!cachedNonce && !user.nonce) {
      throw new Error('Nonce expired. Please request a new nonce.');
    }

    // Extract nonce from message
    const nonceMatch = message.match(/Nonce: (.+)/);
    if (!nonceMatch) {
      throw new Error('Invalid message format');
    }
    const messageNonce = nonceMatch[1];

    // Verify nonce matches
    const expectedNonce = cachedNonce || user.nonce;
    if (messageNonce !== expectedNonce) {
      throw new Error('Invalid nonce');
    }

    // Verify signature
    const isValid = await this.verifySignature(normalizedAddress, signature, message);
    if (!isValid) {
      throw new Error('Invalid signature');
    }

    // Generate new nonce for future logins
    const newNonce = generateNonce();
    await prismaClient.user.update({
      where: { address: normalizedAddress },
      data: {
        nonce: newNonce,
        lastLogin: new Date(),
      },
    });

    // Delete used nonce from cache
    await cache.del(cacheKey);

    // Generate JWT tokens
    const payload = {
      userId: user.id,
      address: user.address,
      username: user.username || undefined,
    };

    const accessToken = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Store refresh token in cache (30 days)
    const refreshKey = `auth:refresh:${user.id}`;
    await cache.set(refreshKey, refreshToken, 30 * 24 * 60 * 60);

    logger.info(`User authenticated: ${normalizedAddress}`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        address: user.address,
        username: user.username || undefined,
      },
    };
  }

  /**
   * Verify wallet signature
   * This is a simplified version - in production, use proper Sui signature verification
   */
  private async verifySignature(
    address: string,
    signature: string,
    message: string
  ): Promise<boolean> {
    if (!signature || !message) return false;

    try {
      // Sui personal message signatures are base64-encoded.
      // verifyPersonalMessage recovers the public key from the signature
      // and returns it; we then derive the Sui address and compare.
      const msgBytes = new TextEncoder().encode(message);
      const publicKey = await verifyPersonalMessage(msgBytes, signature);
      const derivedAddress = publicKey.toSuiAddress();

      const matches = derivedAddress.toLowerCase() === address.toLowerCase();
      if (!matches) {
        logger.warn(`Signature address mismatch: derived=${derivedAddress}, claimed=${address}`);
      }
      return matches;
    } catch (err) {
      // Fallback for development environments where the wallet may send
      // a non-standard signature format (e.g. plain hex from test-login flow).
      if (process.env.NODE_ENV !== 'production') {
        logger.warn(`Signature verification failed (${err}), allowing in non-production mode`);
        return typeof signature === 'string' && signature.length >= 10;
      }
      logger.error(`Signature verification error: ${err}`);
      return false;
    }
  }

  /**
   * Refresh access token
   */
  public async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      // Verify refresh token
      const payload = verifyRefreshToken(refreshToken);

      // Check if refresh token exists in cache
      const refreshKey = `auth:refresh:${payload.userId}`;
      const cachedToken = await cache.get<string>(refreshKey);

      if (!cachedToken || cachedToken !== refreshToken) {
        throw new Error('Invalid or expired refresh token');
      }

      // Get user
      const user = await prismaClient.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Generate new tokens
      const newPayload = {
        userId: user.id,
        address: user.address,
        username: user.username || undefined,
      };

      const newAccessToken = generateToken(newPayload);
      const newRefreshToken = generateRefreshToken(newPayload);

      // Update refresh token in cache
      await cache.set(refreshKey, newRefreshToken, 30 * 24 * 60 * 60);

      logger.info(`Access token refreshed for user: ${user.address}`);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      logger.error('Failed to refresh access token:', error);
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Logout user (invalidate refresh token)
   */
  public async logout(userId: string): Promise<void> {
    const refreshKey = `auth:refresh:${userId}`;
    await cache.del(refreshKey);

    logger.info(`User logged out: ${userId}`);
  }

  /**
   * Get user by ID
   */
  public async getUserById(userId: string): Promise<User | null> {
    return await prismaClient.user.findUnique({
      where: { id: userId },
    });
  }

  /**
   * Get user by address
   */
  public async getUserByAddress(address: string): Promise<User | null> {
    return await prismaClient.user.findUnique({
      where: { address: address.toLowerCase() },
    });
  }

  /**
   * Update user profile
   */
  public async updateProfile(
    userId: string,
    data: {
      username?: string;
      email?: string;
    }
  ): Promise<User> {
    return await prismaClient.user.update({
      where: { id: userId },
      data,
    });
  }

  /**
   * Check if username is available
   */
  public async isUsernameAvailable(username: string): Promise<boolean> {
    const existingUser = await prismaClient.user.findUnique({
      where: { username },
    });

    return !existingUser;
  }

  /**
   * Generate test token WITHOUT signature verification
   * ⚠️  TESTING ONLY - Should NEVER be used in production!
   */
  public async generateTestToken(address: string): Promise<string> {
    // Normalize address
    const normalizedAddress = address.toLowerCase();

    // Get or create user
    const user = await this.getOrCreateUser(normalizedAddress);

    // Update last login
    await prismaClient.user.update({
      where: { address: normalizedAddress },
      data: { lastLogin: new Date() },
    });

    // Generate JWT token
    const payload = {
      userId: user.id,
      address: user.address,
      username: user.username || undefined,
    };

    const accessToken = generateToken(payload);

    logger.warn(`⚠️  TEST TOKEN generated for ${normalizedAddress} - This should NOT be used in production!`);

    return accessToken;
  }
}

// Export singleton instance
export const authService = AuthService.getInstance();
export default authService;
