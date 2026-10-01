import { Router } from 'express';
import upload from '../middleware/upload.middleware.js';
import * as uploadController from '../controllers/upload.controller.js';

const router = Router();

router.post('/', upload.single('file'), uploadController.uploadFile);

export default router;
