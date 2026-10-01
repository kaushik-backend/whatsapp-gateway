import logger from '../utils/logger.js';
import outboxService from '../services/outbox.service.js';
import antiBanService from '../services/antiBan.service.js';

class SenderWorker {
  constructor() {
    this.workers = new Map();
  }

  start(sessionId, provider) {
    if (this.workers.has(sessionId)) {
      logger.warn(`Worker already running for session ${sessionId}`);
      return;
    }

    logger.info(`Starting sender worker for session ${sessionId}`);
    this.workers.set(sessionId, { running: true });
    
    // Start the asynchronous loop
    this._loop(sessionId, provider);
  }

  stop(sessionId) {
    const worker = this.workers.get(sessionId);
    if (worker) {
      worker.running = false;
      this.workers.delete(sessionId);
      logger.info(`Stopped sender worker for session ${sessionId}`);
    }
  }

  stopAll() {
    for (const sessionId of this.workers.keys()) {
      this.stop(sessionId);
    }
  }

  async _loop(sessionId, provider) {
    const worker = this.workers.get(sessionId);
    if (!worker || !worker.running) return;

    try {
      const job = await outboxService.dequeue(sessionId);
      
      if (!job) {
        // No jobs ready, wait 1.5 seconds before polling again
        setTimeout(() => this._loop(sessionId, provider), 1500);
        return;
      }

      const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
      const recipientJid = payload?.to;

      const canSend = antiBanService.canSend(sessionId, recipientJid);
      if (!canSend.allowed) {
        const waitTime = canSend.retryAfterMs || 5000;
        logger.info(`[AntiBan] Session ${sessionId} pacing: job #${job.id} deferred for ${Math.ceil(waitTime / 1000)}s. Reason: ${canSend.reason}`);
        
        // Release lock and reschedule in PostgreSQL with nextRetryAt
        await outboxService.reschedule(job.id, waitTime, canSend.reason);
        
        // Pause worker loop briefly
        setTimeout(() => this._loop(sessionId, provider), Math.min(waitTime, 3000));
        return;
      }

      await this._processJob(sessionId, provider, job, payload);

    } catch (error) {
      logger.error(`Error in sender loop for session ${sessionId}: ${error.message}`);
      setTimeout(() => this._loop(sessionId, provider), 2000);
    }
  }

  async _processJob(sessionId, provider, job, payload) {
    const worker = this.workers.get(sessionId);
    if (!worker || !worker.running) return;

    try {
      const textLen = payload.text ? payload.text.length : 20;
      
      const delay = antiBanService.getDelay(sessionId, textLen);
      
      // 1. Presence delay
      if (provider.sendPresenceUpdate) {
        await provider.sendPresenceUpdate(payload.to, 'composing');
      }
      await new Promise(r => setTimeout(r, delay.presenceDelay));
      
      // 2. Typing delay
      await new Promise(r => setTimeout(r, delay.typingDelay));
      
      // 3. Send message
      let sendResult;
      switch (job.type) {
        case 'text':
          sendResult = await provider.sendTextMessage(payload.to, payload.text);
          break;
        case 'image':
          sendResult = await provider.sendImageMessage(payload.to, payload.url, payload.caption);
          break;
        case 'document':
          sendResult = await provider.sendDocumentMessage(payload.to, payload.url, payload.filename, payload.mimetype);
          break;
        case 'voice':
          sendResult = await provider.sendVoiceMessage(payload.to, payload.url);
          break;
        case 'reaction':
          sendResult = await provider.sendReaction(payload.to, payload.waMessageId, payload.emoji);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      const waMessageId = sendResult?.key?.id || 'simulated-' + Date.now();
      
      await outboxService.markSent(job.id, waMessageId);
      antiBanService.recordSend(sessionId, payload.to);
      
      // 4. Gap delay
      await new Promise(r => setTimeout(r, delay.gapDelay));
      
    } catch (error) {
      logger.error(`Job ${job.id} failed: ${error.message}`);
      await outboxService.markFailed(job.id, error.message);
    }

    // Continue loop
    setTimeout(() => this._loop(sessionId, provider), 100);
  }
}

export default new SenderWorker();
