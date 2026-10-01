import WhatsAppProvider from './WhatsAppProvider.js';
import logger from '../utils/logger.js';

export default class MockProvider extends WhatsAppProvider {
  /**
   * @param {string} sessionId
   * @param {Object} [options]
   */
  constructor(sessionId, options = {}) {
    super();
    this.sessionId = sessionId;
    this.phoneNumber = options.phoneNumber || '15550192834';
    this.autoConnectDelay = options.autoConnectDelay ?? 3000; // Auto-connect after 3s
    this.qr = 'MOCK_QR_CODE_' + sessionId + '_' + Date.now();
    this.isConnected = false;
    this.connectTimer = null;
  }

  async connect() {
    logger.info(`[${this.sessionId}] [MOCK] Starting Simulated WhatsApp Provider...`);
    
    // 1. Emit QR code first
    this.emit('qr', this.qr);
    logger.info(`[${this.sessionId}] [MOCK] QR code generated. Waiting ${this.autoConnectDelay / 1000}s for auto-pairing...`);

    // 2. Automatically simulate pairing after autoConnectDelay
    if (this.autoConnectDelay > 0) {
      this.connectTimer = setTimeout(() => {
        this.isConnected = true;
        this.qr = null;
        logger.info(`[${this.sessionId}] [MOCK] Phone linked successfully! Simulated Phone: +${this.phoneNumber}`);
        this.emit('connected', this.phoneNumber);
      }, this.autoConnectDelay);
    }
  }

  async disconnect() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
    }
    this.isConnected = false;
    this.qr = null;
    logger.info(`[${this.sessionId}] [MOCK] Disconnected.`);
    this.emit('disconnected');
  }

  async getQR() {
    return this.qr;
  }

  async sendTextMessage(jid, text) {
    const waMessageId = `3EB0_MOCK_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    logger.info(`[${this.sessionId}] [MOCK] Sent text to ${jid}: "${text}" (WA ID: ${waMessageId})`);

    // Simulate async delivery & read receipts after natural delay
    setTimeout(() => {
      this.emit('message.status', { key: { id: waMessageId, remoteJid: jid }, update: { status: 3 /* DELIVERED */ } });
    }, 1500);

    setTimeout(() => {
      this.emit('message.status', { key: { id: waMessageId, remoteJid: jid }, update: { status: 4 /* READ */ } });
    }, 3500);

    return {
      key: {
        id: waMessageId,
        remoteJid: jid,
        fromMe: true
      }
    };
  }

  async sendImageMessage(jid, url, caption) {
    const waMessageId = `3EB0_IMG_${Date.now()}`;
    logger.info(`[${this.sessionId}] [MOCK] Sent image to ${jid}: ${url} ${caption ? `("${caption}")` : ''}`);
    return { key: { id: waMessageId, remoteJid: jid, fromMe: true } };
  }

  async sendDocumentMessage(jid, url, filename, mimetype) {
    const waMessageId = `3EB0_DOC_${Date.now()}`;
    logger.info(`[${this.sessionId}] [MOCK] Sent document to ${jid}: ${filename} (${mimetype})`);
    return { key: { id: waMessageId, remoteJid: jid, fromMe: true } };
  }

  async sendVoiceMessage(jid, url) {
    const waMessageId = `3EB0_VOICE_${Date.now()}`;
    logger.info(`[${this.sessionId}] [MOCK] Sent voice note to ${jid}: ${url}`);

    // Simulate async delivery & read receipts
    setTimeout(() => {
      this.emit('message.status', { key: { id: waMessageId, remoteJid: jid }, update: { status: 3 /* DELIVERED */ } });
    }, 1500);

    setTimeout(() => {
      this.emit('message.status', { key: { id: waMessageId, remoteJid: jid }, update: { status: 4 /* READ */ } });
    }, 3500);

    return { key: { id: waMessageId, remoteJid: jid, fromMe: true } };
  }

  async sendReaction(jid, messageId, emoji) {
    const waMessageId = `3EB0_REACT_${Date.now()}`;
    logger.info(`[${this.sessionId}] [MOCK] Reacted to ${messageId} with ${emoji}`);
    return { key: { id: waMessageId, remoteJid: jid, fromMe: true } };
  }

  async sendPresenceUpdate(jid, type) {
    logger.debug(`[${this.sessionId}] [MOCK] Presence update: ${type} for ${jid}`);
    return true;
  }

  /**
   * Helper to simulate a customer messaging the company number
   */
  simulateIncomingMessage({ fromPhone, text = 'Hello from customer!', type = 'text', body = null, url = null }) {
    const chatJid = fromPhone.includes('@') ? fromPhone : `${fromPhone}@s.whatsapp.net`;
    const waMessageId = `3EB0_IN_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    let msgContent = body;
    if (!msgContent) {
      if (type === 'voice') {
        msgContent = {
          audioMessage: {
            url: url || '/uploads/test-voice.mp3',
            mimetype: 'audio/mp4',
            ptt: true,
            seconds: 12
          },
          url: url || '/uploads/test-voice.mp3',
          conversation: text,
          text: text
        };
      } else {
        msgContent = { conversation: text, text };
      }
    }

    const rawMsg = {
      key: {
        id: waMessageId,
        remoteJid: chatJid,
        fromMe: false
      },
      message: msgContent,
      messageTimestamp: Math.floor(Date.now() / 1000)
    };

    logger.info(`[${this.sessionId}] [MOCK] Simulating incoming customer ${type} message from ${chatJid}: "${text || url}"`);
    this.emit('message', rawMsg);

    return {
      waMessageId,
      chatJid,
      text,
      url,
      type,
      timestamp: rawMsg.messageTimestamp
    };
  }
}
