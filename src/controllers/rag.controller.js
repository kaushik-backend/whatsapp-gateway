import catchAsync from '../utils/catchAsync.js';
import SuccessResponse from '../utils/SuccessResponse.js';
import AppError from '../utils/AppError.js';
import ragService from '../services/rag.service.js';
import aiBotService from '../services/aiBot.service.js';
import db from '../models/index.js';

export const listDocuments = catchAsync(async (req, res) => {
  const documents = await db.KnowledgeDocument.findAll({
    order: [['createdAt', 'DESC']],
    include: [
      {
        model: db.KnowledgeChunk,
        as: 'chunks',
        attributes: ['id']
      }
    ]
  });

  const formatted = documents.map((doc) => ({
    id: doc.id,
    filename: doc.filename,
    title: doc.title,
    mimeType: doc.mimeType,
    size: doc.size,
    totalChunks: doc.chunks ? doc.chunks.length : doc.totalChunks,
    createdAt: doc.createdAt
  }));

  new SuccessResponse({
    data: formatted,
    message: 'Knowledge documents retrieved'
  }).send(res);
});

export const uploadDocument = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new AppError('No document file uploaded', 400);
  }

  const { title } = req.body;
  const doc = await ragService.ingestFile({
    filePath: req.file.path,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    title
  });

  new SuccessResponse({
    statusCode: 201,
    data: doc,
    message: `Document "${doc.title}" indexed successfully with ${doc.totalChunks} chunks`
  }).send(res);
});

export const deleteDocument = catchAsync(async (req, res) => {
  const { id } = req.params;
  const doc = await db.KnowledgeDocument.findByPk(id);
  if (!doc) {
    throw new AppError('Document not found', 404);
  }

  await doc.destroy();
  new SuccessResponse({
    message: 'Document deleted from knowledge base'
  }).send(res);
});

export const queryKnowledgeBase = catchAsync(async (req, res) => {
  const { query, topK, chatHistory, synthesizeVoice } = req.body;
  if (!query || typeof query !== 'string') {
    throw new AppError('query is required', 400);
  }

  const result = await ragService.answerQuestion({
    query,
    chatHistory: chatHistory || [],
    topK: topK || 4
  });

  let voice = null;
  if (synthesizeVoice && result.answer) {
    try {
      const { voiceService } = await import('../services/voice.service.js');
      voice = await voiceService.synthesizeVoice({ text: result.answer });
    } catch (err) {
      // Non-fatal
    }
  }

  new SuccessResponse({
    data: { ...result, voice },
    message: 'RAG response generated'
  }).send(res);
});

export const getSettings = catchAsync(async (req, res) => {
  const { sessionId } = req.query;
  const botStatus = aiBotService.getBotStatus(sessionId || 'global');

  new SuccessResponse({
    data: {
      botEnabled: botStatus.enabled,
      isConfigured: botStatus.isConfigured,
      model: botStatus.model,
      voiceReplyMode: aiBotService.getVoiceReplyMode(),
      hasGeminiApiKey: Boolean(ragService.getApiKey()),
      maskedKey: ragService.getApiKey() ? `${ragService.getApiKey().slice(0, 6)}...${ragService.getApiKey().slice(-4)}` : null
    },
    message: 'RAG settings retrieved'
  }).send(res);
});

export const updateSettings = catchAsync(async (req, res) => {
  const { apiKey, botEnabled, voiceReplyMode, sessionId } = req.body;

  if (apiKey !== undefined) {
    ragService.setApiKey(apiKey.trim());
  }

  if (botEnabled !== undefined) {
    aiBotService.setBotEnabled(sessionId || 'global', Boolean(botEnabled));
  }

  if (voiceReplyMode !== undefined) {
    aiBotService.setVoiceReplyMode(voiceReplyMode);
  }

  new SuccessResponse({
    data: {
      botEnabled: aiBotService.isBotEnabled(sessionId || 'global'),
      isConfigured: ragService.isConfigured(),
      voiceReplyMode: aiBotService.getVoiceReplyMode(),
      hasGeminiApiKey: Boolean(ragService.getApiKey())
    },
    message: 'RAG settings updated'
  }).send(res);
});
