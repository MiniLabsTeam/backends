import { Router } from 'express';
import authRoutes from './auth.routes';
import gachaRoutes from './gacha.routes';
import inventoryRoutes from './inventory.routes';
import marketplaceRoutes from './marketplace.routes';
import predictionRoutes from './prediction.routes';
import questRoutes from './quest.routes';
import rwaRoutes from './rwa.routes';
import gameRoutes from './game.routes';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/gacha', gachaRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/marketplace', marketplaceRoutes);
router.use('/prediction', predictionRoutes);
router.use('/quest', questRoutes);
router.use('/rwa', rwaRoutes);
router.use('/game', gameRoutes);

// Health check for API
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'API is healthy',
    timestamp: new Date().toISOString(),
  });
});

export default router;
