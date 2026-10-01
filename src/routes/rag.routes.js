import { Router } from 'express';
import upload from '../middleware/upload.middleware.js';
import * as ragController from '../controllers/rag.controller.js';

const router = Router();

router.get('/documents', ragController.listDocuments);
router.post('/documents/upload', upload.single('file'), ragController.uploadDocument);
router.delete('/documents/:id', ragController.deleteDocument);
router.post('/query', ragController.queryKnowledgeBase);
router.get('/settings', ragController.getSettings);
router.post('/settings', ragController.updateSettings);

export default router;
