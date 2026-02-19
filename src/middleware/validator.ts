import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from './errorHandler';

// Validation middleware factory
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errorMessage = error.details
        .map((detail) => detail.message)
        .join(', ');

      throw new AppError(errorMessage, 400);
    }

    // Replace request body with validated value
    req.body = value;
    next();
  };
};

// Common validation schemas
export const schemas = {
  // Wallet address validation
  address: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{64}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid wallet address format',
    }),

  // Signature validation
  signature: Joi.string()
    .required()
    .messages({
      'string.empty': 'Signature is required',
    }),

  // UID validation (blockchain object UID)
  uid: Joi.string()
    .pattern(/^0x[a-fA-F0-9]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid UID format',
    }),

  // Pagination
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  }),

  // ID validation
  id: Joi.string().uuid().required(),

  // Room creation
  createRoom: Joi.object({
    gameMode: Joi.string()
      .valid('DRAG_RACE', 'ENDLESS_RACE', 'ROYAL_RUMBLE')
      .required(),
    maxPlayers: Joi.number().integer().min(2).max(8).required(),
    entryFee: Joi.string()
      .pattern(/^\d+$/)
      .required(),
    deadline: Joi.number().integer().min(Date.now()).required(),
  }),

  // Join room
  joinRoom: Joi.object({
    roomId: Joi.string().uuid().required(),
    carUid: Joi.string()
      .pattern(/^0x[a-fA-F0-9]+$/)
      .required(),
  }),

  // Equip part
  equipPart: Joi.object({
    carUid: Joi.string()
      .pattern(/^0x[a-fA-F0-9]+$/)
      .required(),
    partUid: Joi.string()
      .pattern(/^0x[a-fA-F0-9]+$/)
      .required(),
  }),

  // List NFT
  listNFT: Joi.object({
    nftType: Joi.string().valid('CAR', 'SPAREPART').required(),
    nftUid: Joi.string()
      .pattern(/^0x[a-fA-F0-9]+$/)
      .required(),
    price: Joi.string()
      .pattern(/^\d+$/)
      .required(),
    expiry: Joi.number().integer().min(Date.now()).required(),
  }),

  // Place bet
  placeBet: Joi.object({
    roomUid: Joi.string()
      .pattern(/^0x[a-fA-F0-9]+$/)
      .required(),
    predictedWinner: Joi.string()
      .pattern(/^0x[a-fA-F0-9]{64}$/)
      .required(),
    amount: Joi.string()
      .pattern(/^\d+$/)
      .required(),
  }),

  // Claim physical
  claimPhysical: Joi.object({
    carUid: Joi.string()
      .pattern(/^0x[a-fA-F0-9]+$/)
      .required(),
    partUids: Joi.array()
      .items(
        Joi.string().pattern(/^0x[a-fA-F0-9]+$/)
      )
      .min(4)
      .max(4)
      .required(),
    shippingAddress: Joi.string().min(10).max(500).required(),
  }),

  // Wallet connect
  walletConnect: Joi.object({
    address: Joi.string()
      .pattern(/^0x[a-fA-F0-9]{64}$/)
      .required(),
    signature: Joi.string().required(),
    message: Joi.string().required(),
  }),

  // Refresh token
  refreshToken: Joi.object({
    refreshToken: Joi.string().required(),
  }),
};

export default validate;
