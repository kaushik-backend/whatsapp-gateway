import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import db from '../models/index.js';
import BaileysProvider from '../providers/BaileysProvider.js';
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';

import MockProvider from '../providers/MockProvider.js';
import senderWorker from '../workers/senderWorker.js';

export const activeSessions = new Map();

class SessionService {
  async create(id, name, options = {}) {
    const existing = await db.Session.findByPk(id);
    if (existing) {
      throw new AppError('Session with this ID already exists', 400);
    }

    const session = await db.Session.create({
      id,
      name,
      status: 'starting'
    });

    const isMock = process.env.WA_PROVIDER === 'mock' || options.provider === 'mock';
    let provider;

    if (isMock) {
      provider = new MockProvider(id, {
        phoneNumber: options.phoneNumber || '15550192834',
        autoConnectDelay: 3000
      });
    } else {
      const authState = await this._createAuthStateAdapter(id);
      provider = new BaileysProvider(id, authState);
    }

    activeSessions.set(id, provider);
    
    this._setupProviderEvents(provider, id);
    await provider.connect();

    return session;
  }

  async list() {
    return await db.Session.findAll();
  }

  async getById(id) {
    const session = await db.Session.findByPk(id);
    if (!session) {
      throw new AppError('Session not found', 404);
    }
    return session;
  }

  async getQR(id) {
    const session = await this.getById(id);
    if (session.status === 'connected') {
      return { status: 'connected', qr: null };
    }
    const provider = activeSessions.get(id);
    if (!provider) {
      return { status: session.status, qr: null };
    }
    const qr = await provider.getQR();
    return { status: qr ? 'qr' : session.status, qr: qr || null };
  }

  async delete(id) {
    const session = await this.getById(id);
    
    const provider = activeSessions.get(id);
    if (provider) {
      await provider.disconnect();
      activeSessions.delete(id);
    }

    await db.AuthState.destroy({ where: { sessionId: id } });
    await session.destroy();
    
    return true;
  }

  async restore() {
    const sessions = await db.Session.findAll({
      where: {
        status: ['starting', 'qr', 'connected', 'reconnecting']
      }
    });

    logger.info(`Found ${sessions.length} sessions to restore`);

    const isMock = process.env.WA_PROVIDER === 'mock';

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      setTimeout(async () => {
        try {
          logger.info(`Restoring session ${session.id}`);
          let provider;
          if (isMock) {
            provider = new MockProvider(session.id, {
              phoneNumber: session.phoneNumber || '15550192834',
              autoConnectDelay: 1000
            });
          } else {
            const authState = await this._createAuthStateAdapter(session.id);
            provider = new BaileysProvider(session.id, authState);
          }

          activeSessions.set(session.id, provider);
          
          this._setupProviderEvents(provider, session.id);
          await provider.connect();
        } catch (err) {
          logger.error(`Error restoring session ${session.id}:`, err);
        }
      }, i * 1500); // Stagger reconnection 1.5s apart
    }
  }

  getProvider(id) {
    const provider = activeSessions.get(id);
    if (!provider) {
      throw new AppError('Provider not found in memory (Session might be disconnected)', 404);
    }
    return provider;
  }

  async _createAuthStateAdapter(sessionId) {
    const writeData = async (data, type, key) => {
      const value = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
      await db.AuthState.upsert({
        sessionId,
        type,
        key: key || type,
        value
      });
    };

    const readData = async (type, key) => {
      const record = await db.AuthState.findOne({
        where: { sessionId, type, key: key || type }
      });
      if (record && record.value) {
        return JSON.parse(JSON.stringify(record.value), BufferJSON.reviver);
      }
      return null;
    };

    const removeData = async (type, key) => {
      await db.AuthState.destroy({
        where: { sessionId, type, key: key || type }
      });
    };

    let creds = await readData('creds', 'creds');
    if (!creds) {
      creds = initAuthCreds();
      await writeData(creds, 'creds', 'creds');
    }

    return {
      state: {
        creds,
        keys: {
          get: async (type, ids) => {
            const data = {};
            await Promise.all(
              ids.map(async (id) => {
                let value = await readData('key', `${type}-${id}`);
                if (type === 'app-state-sync-key' && value) {
                  value = proto.Message.AppStateSyncKeyData.fromObject(value);
                }
                data[id] = value;
              })
            );
            return data;
          },
          set: async (data) => {
            const tasks = [];
            for (const category of Object.keys(data)) {
              for (const id of Object.keys(data[category])) {
                const value = data[category][id];
                const key = `${category}-${id}`;
                if (value) {
                  tasks.push(writeData(value, 'key', key));
                } else {
                  tasks.push(removeData('key', key));
                }
              }
            }
            await Promise.all(tasks);
          }
        }
      },
      saveCreds: async () => {
        return writeData(creds, 'creds', 'creds');
      }
    };
  }

  _setupProviderEvents(provider, sessionId) {
    provider.on('qr', async () => {
      await db.Session.update({ status: 'qr' }, { where: { id: sessionId } });
      logger.info(`[${sessionId}] QR code generated`);
    });

    provider.on('connected', async (phoneNumber) => {
      await db.Session.update({ 
        status: 'connected',
        phoneNumber 
      }, { where: { id: sessionId } });
      logger.info(`[${sessionId}] Connected. Phone: ${phoneNumber}`);
      // Start outbox draining worker for this session
      senderWorker.start(sessionId, provider);
    });

    provider.on('disconnected', async () => {
      senderWorker.stop(sessionId);
      await db.Session.update({ status: 'reconnecting' }, { where: { id: sessionId } });
      logger.info(`[${sessionId}] Disconnected (reconnecting)`);
    });

    provider.on('loggedOut', async () => {
      senderWorker.stop(sessionId);
      await db.Session.update({ status: 'logged_out' }, { where: { id: sessionId } });
      logger.info(`[${sessionId}] Logged out`);
      // Cleanup provider
      activeSessions.delete(sessionId);
    });

    provider.on('message', async (rawMsg) => {
      const remoteJid = rawMsg?.key?.remoteJid;
      const fromMe = rawMsg?.key?.fromMe || false;

      // Contact Privacy & Isolation Guard: Drop personal contacts not conversing with gateway
      try {
        const { privacyFilterService } = await import('./privacyFilter.service.js');
        const allowed = await privacyFilterService.shouldCaptureMessage({
          sessionId,
          remoteJid,
          fromMe
        });
        if (!allowed) {
          logger.info(`[${sessionId}] [PrivacyFilter] Dropped message from personal contact ${remoteJid} (hidden from admin)`);
          return;
        }
      } catch (privErr) {
        logger.warn(`[${sessionId}] Privacy filter error: ${privErr.message}`);
      }

      logger.info(`[${sessionId}] New message received: ${rawMsg?.key?.id} from ${remoteJid}`);
      
      let msg = rawMsg?.message || {};
      
      // Unwrap ephemeral, viewOnce, and nested containers
      while (msg?.ephemeralMessage || msg?.viewOnceMessage || msg?.viewOnceMessageV2 || msg?.documentWithCaptionMessage) {
        msg = msg.ephemeralMessage?.message || 
              msg.viewOnceMessage?.message || 
              msg.viewOnceMessageV2?.message || 
              msg.documentWithCaptionMessage?.message || 
              msg;
      }

      let msgType = 'text';
      let extractedText = '';

      if (msg.audioMessage) {
        msgType = 'voice';
        try {
          const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
          const stream = await downloadContentFromMessage(msg.audioMessage, 'audio');
          let buffer = Buffer.from([]);
          for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
          }

          if (buffer && buffer.length > 0) {
            const fs = await import('fs');
            const path = await import('path');
            const uploadDir = path.resolve(process.cwd(), 'uploads');
            const filename = `inbound-voice-${Date.now()}-${(rawMsg?.key?.id || 'note').slice(-6)}.ogg`;
            const filePath = path.join(uploadDir, filename);
            await fs.promises.writeFile(filePath, buffer);
            msg.url = `/uploads/${filename}`;
            const { voiceService } = await import('./voice.service.js');
            extractedText = await voiceService.transcribeVoice({ audio: buffer, mimeType: 'audio/ogg' });
            logger.info(`[${sessionId}] Inbound voice note transcribed: "${extractedText}"`);
          }
        } catch (mediaErr) {
          logger.warn(`Could not download or transcribe inbound audio: ${mediaErr.message}`);
        }
      } else if (msg.imageMessage) {

        msgType = 'image';
        extractedText = msg.imageMessage.caption || '';
      } else if (msg.documentMessage) {
        msgType = 'document';
        extractedText = msg.documentMessage.caption || '';
      } else if (msg.reactionMessage) {
        msgType = 'reaction';
        extractedText = msg.reactionMessage.text || '';
      } else if (msg.conversation) {
        msgType = 'text';
        extractedText = msg.conversation;
      } else if (msg.extendedTextMessage) {
        msgType = 'text';
        extractedText = msg.extendedTextMessage.text || '';
      }

      const normalized = {
        waMessageId: rawMsg?.key?.id,
        chatJid: rawMsg?.key?.remoteJid,
        fromMe: rawMsg?.key?.fromMe || false,
        type: msgType,
        body: {
          text: extractedText,
          conversation: extractedText,
          ...msg
        },
        timestamp: rawMsg?.messageTimestamp || Math.floor(Date.now() / 1000)
      };

      // Delegate to webhook service dynamically to avoid circular dep
      try {
        const { webhookService } = await import('./webhook.service.js');
        if (webhookService) {
           await webhookService.handleInboundMessage(sessionId, normalized);
        }
      } catch (err) {
        logger.error(`Error handling inbound message: ${err.message}`);
      }
    });

    provider.on('message.status', async (update) => {
      const waId = update?.key?.id;
      const statusCode = update?.update?.status;
      const statusMap = { 2: 'sent', 3: 'delivered', 4: 'read' };
      const statusName = statusMap[statusCode] || 'sent';

      logger.info(`[${sessionId}] Message status update: ${waId} -> ${statusName}`);
      try {
        const { webhookService } = await import('./webhook.service.js');
        if (webhookService && waId) {
          await webhookService.handleStatusUpdate(sessionId, waId, statusName);
        }
      } catch (err) {
        logger.debug(`Could not delegate status update to webhook service: ${err.message}`);
      }
    });
  }

  /**
   * Simulate an incoming WhatsApp message from a customer
   */
  async simulateIncoming(sessionId, { fromPhone = '919876543210', text = 'Hello!', type = 'text', url = null }) {
    const provider = this.getProvider(sessionId);
    if (!provider) {
      throw new AppError('Session provider is not running', 404);
    }

    let finalUrl = url;
    if (type === 'voice' && !finalUrl && text) {
      try {
        const { voiceService } = await import('./voice.service.js');
        const synth = await voiceService.synthesizeVoice({ text });
        finalUrl = synth.url;
      } catch (err) {
        logger.warn(`Could not synthesize voice for simulated inbound: ${err.message}`);
      }
    }

    if (provider.simulateIncomingMessage) {
      return provider.simulateIncomingMessage({ fromPhone, text, type, url: finalUrl });
    }

    // Fallback if running with Baileys
    const chatJid = fromPhone.includes('@') ? fromPhone : `${fromPhone}@s.whatsapp.net`;
    const waMessageId = `3EB0_SIM_${Date.now()}`;
    const normalized = {
      waMessageId,
      chatJid,
      fromMe: false,
      type: type || 'text',
      body: { conversation: text, text, url: finalUrl },
      timestamp: Math.floor(Date.now() / 1000)
    };

    // Apply Privacy Filter
    const { privacyFilterService } = await import('./privacyFilter.service.js');
    const allowed = await privacyFilterService.shouldCaptureMessage({
      sessionId,
      remoteJid: chatJid,
      fromMe: false
    });
    if (!allowed) {
      logger.info(`[${sessionId}] [PrivacyFilter] Dropped simulated message from personal contact ${chatJid}`);
      return { dropped: true, reason: 'privacy_filter', chatJid };
    }

    const { webhookService } = await import('./webhook.service.js');
    await webhookService.handleInboundMessage(sessionId, normalized);
    return normalized;

  }
}

export default new SessionService();
