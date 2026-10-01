import db from '../models/index.js';
import ragService from './rag.service.js';
import messageService from './message.service.js';
import logger from '../utils/logger.js';

class AiBotService {
  constructor() {
    this.enabledSessions = new Set(['global']); // Enabled by default
    this.rateLimits = new Map(); // chatJid -> array of timestamps
    this.humanInterventions = new Map(); // chatJid -> last human reply timestamp
    this.maxRepliesPerMinute = 5;
    this.humanPauseDurationMs = process.env.HUMAN_PAUSE_MS ? parseInt(process.env.HUMAN_PAUSE_MS) : 60 * 1000; // 60s pause after human manual message
    this.voiceReplyMode = process.env.VOICE_REPLY_MODE || 'auto'; // 'auto' | 'always' | 'never'
  }

  isBotEnabled(sessionId) {
    return this.enabledSessions.has('global') || this.enabledSessions.has(sessionId);
  }

  setBotEnabled(sessionId, enabled) {
    if (enabled) {
      this.enabledSessions.add(sessionId);
    } else {
      this.enabledSessions.delete(sessionId);
      if (sessionId === 'global') {
        this.enabledSessions.clear();
      }
    }
    logger.info(`AI Bot status for [${sessionId}]: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  getVoiceReplyMode() {
    return this.voiceReplyMode;
  }

  setVoiceReplyMode(mode) {
    if (['auto', 'always', 'never'].includes(mode)) {
      this.voiceReplyMode = mode;
      logger.info(`[AI BOT] Voice reply mode set to: ${mode}`);
    }
  }

  getBotStatus(sessionId) {
    return {
      enabled: this.isBotEnabled(sessionId),
      isConfigured: ragService.isConfigured(),
      model: ragService.modelName,
      voiceReplyMode: this.voiceReplyMode
    };
  }

  /**
   * Record when an agent/human sends a manual reply
   */
  recordHumanActivity(chatJid) {
    this.humanInterventions.set(chatJid, Date.now());
  }

  /**
   * Check if chat is in human-pause mode
   */
  isPausedForHuman(chatJid) {
    const lastHuman = this.humanInterventions.get(chatJid);
    if (!lastHuman) return false;
    return Date.now() - lastHuman < this.humanPauseDurationMs;
  }

  /**
   * Check rate limiting: max N replies per minute per chat
   */
  checkRateLimit(chatJid) {
    const now = Date.now();
    const timestamps = this.rateLimits.get(chatJid) || [];
    const windowStart = now - 60000;
    const recent = timestamps.filter((t) => t > windowStart);
    
    if (recent.length >= this.maxRepliesPerMinute) {
      return false; // Rate limit exceeded
    }

    recent.push(now);
    this.rateLimits.set(chatJid, recent);
    return true;
  }

  /**
   * Handle incoming customer message and generate RAG AI auto-reply
   */
  async handleInboundMessage(sessionId, messageRecord) {
    const { fromMe, chatJid, type, body } = messageRecord;

    // Guardrail 1: Never reply to outgoing messages from ourselves
    if (fromMe) {
      this.recordHumanActivity(chatJid);
      return;
    }

    // Check if bot is enabled
    if (!this.isBotEnabled(sessionId)) {
      logger.debug(`[AI BOT] Bot disabled for session ${sessionId}. Skipping auto-reply.`);
      return;
    }

    // Guardrail 2: Human intervention pause
    if (this.isPausedForHuman(chatJid)) {
      logger.info(`[AI BOT] Chat ${chatJid} is paused due to recent human operator reply.`);
      return;
    }

    // Extract customer text robustly from any WhatsApp message container
    let queryText = '';
    if (typeof body === 'string') {
      queryText = body.trim();
    } else if (body) {
      queryText = (body.text || 
                  body.conversation || 
                  body.extendedTextMessage?.text || 
                  body.caption || 
                  '').trim();
    }

    const isVoiceInbound = type === 'voice' || !!body?.audioMessage;

    // Ignore empty protocol/sync/receipt stubs
    if (!queryText && !isVoiceInbound) {
      return;
    }

    // Guardrail 3: Rate limiting (only checked for actual actionable inbound messages)
    if (!this.checkRateLimit(chatJid)) {
      logger.warn(`[AI BOT] Rate limit exceeded for chat ${chatJid}. Suppressing auto-reply.`);
      return;
    }

    if (isVoiceInbound && (!queryText || queryText.startsWith('Customer sent a voice note'))) {
      const audioSource = body?.url || body?.audioUrl || body?.audioMessage?.url;
      if (audioSource) {
        try {
          const { voiceService } = await import('./voice.service.js');
          logger.info(`[AI BOT] Transcribing inbound voice message from ${chatJid}...`);
          const transcript = await voiceService.transcribeVoice({ audio: audioSource });
          if (transcript) {
            queryText = transcript;
            // Update messageRecord body with transcript
            messageRecord.body = { ...messageRecord.body, text: transcript };
            await messageRecord.save().catch(() => {});
            logger.info(`[AI BOT] Transcribed voice query: "${transcript}"`);
          }
        } catch (transcribeErr) {
          logger.warn(`[AI BOT] Auto-transcription failed: ${transcribeErr.message}`);
        }
      }
    }

    if (!queryText && isVoiceInbound) {
      queryText = 'Customer sent a voice note asking for assistance.';
    } else if (!queryText && type === 'image') {
      queryText = body?.caption || 'Customer sent an image asking for assistance.';
    }

    if (!queryText || !queryText.trim()) {
      logger.debug(`[AI BOT] Skipping auto-reply for empty/unrecognized message from ${chatJid}`);
      return;
    }

    logger.info(`[AI BOT] Processing RAG question from ${chatJid} on [${sessionId}]: "${queryText}"`);

    try {
      // Fetch recent conversation history
      const history = await db.Message.findAll({
        where: { sessionId, chatJid },
        order: [['createdAt', 'DESC']],
        limit: 6
      });
      const reversedHistory = history.reverse();

      // Retrieve context and generate answer via LangChain RAG pipeline
      const result = await ragService.answerQuestion({
        query: queryText,
        chatHistory: reversedHistory
      });

      if (!result.answer) return;

      const shouldReplyVoice = (this.voiceReplyMode === 'always') ||
                               (this.voiceReplyMode === 'auto' && isVoiceInbound);

      if (shouldReplyVoice) {
        try {
          const { voiceService } = await import('./voice.service.js');
          logger.info(`[AI BOT] Generating and queuing VOICE NOTE auto-reply to ${chatJid} (Model: ${result.model})`);
          const voiceResult = await voiceService.synthesizeVoice({ text: result.answer });
          
          await messageService.sendVoice(sessionId, chatJid, voiceResult.url, result.answer);
          // Also send text response so user can read mathematical formulas directly
          await messageService.sendText(sessionId, chatJid, result.answer);
        } catch (voiceErr) {
          logger.error(`[AI BOT] Voice reply synthesis failed, falling back to text: ${voiceErr.message}`);
          await messageService.sendText(sessionId, chatJid, result.answer);
        }
      } else {

        logger.info(`[AI BOT] Generating and queuing text auto-reply to ${chatJid} (Model: ${result.model})`);
        await messageService.sendText(sessionId, chatJid, result.answer);
      }

      return result;
    } catch (err) {
      logger.error(`[AI BOT] Failed to process auto-reply: ${err.message}`, err);
    }
  }
}

export const aiBotService = new AiBotService();
export default aiBotService;
