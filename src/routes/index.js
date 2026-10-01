import { Router } from 'express';
import sessionRoutes from './session.routes.js';
import messageRoutes from './message.routes.js';
import webhookRoutes from './webhook.routes.js';
import apiKeyRoutes from './apiKey.routes.js';
import uploadRoutes from './upload.routes.js';
import ragRoutes from './rag.routes.js';

const router = Router();

router.use('/sessions', sessionRoutes);
router.use('/sessions/:sessionId/messages', messageRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/api-keys', apiKeyRoutes);
router.use('/uploads', uploadRoutes);
router.use('/rag', ragRoutes);

// Health check route
router.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'OK' });
});

export default router;
