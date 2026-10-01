import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import WhatsAppProvider from './WhatsAppProvider.js';
import logger from '../utils/logger.js';
import pino from 'pino';
import fs from 'fs';
import path from 'path';

export default class BaileysProvider extends WhatsAppProvider {
  /**
   * @param {string} sessionId
   * @param {Object} authState - { state, saveCreds }
   */
  constructor(sessionId, authState) {
    super();
    this.sessionId = sessionId;
    this.authState = authState;
    this.sock = null;
    this.qr = null;
    this.retryCount = 0;
    this.isReconnecting = false;
    // Max delay = 60s
    this.maxDelay = 60000;
  }

  async connect() {
    try {
      const { version, isLatest } = await fetchLatestBaileysVersion();
      logger.info(`[${this.sessionId}] Using WA v${version.join('.')}, isLatest: ${isLatest}`);

      const socketLogger = pino({ level: 'silent' });
      const socketFactory = makeWASocket.default || makeWASocket;
      this.sock = socketFactory({
        version,
        logger: socketLogger,
        printQRInTerminal: false,
        auth: {
          creds: this.authState.state.creds,
          keys: makeCacheableSignalKeyStore(this.authState.state.keys, socketLogger)
        },
        generateHighQualityLinkPreview: true,
      });

      this.sock.ev.on('connection.update', this.handleConnectionUpdate.bind(this));
      this.sock.ev.on('creds.update', this.authState.saveCreds);
      this.sock.ev.on('messages.upsert', this.handleMessagesUpsert.bind(this));
      this.sock.ev.on('messages.update', this.handleMessagesUpdate.bind(this));

    } catch (error) {
      logger.error(`[${this.sessionId}] Error connecting Baileys socket:`, error);
      throw error;
    }
  }

  handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.qr = qr;
      this.emit('qr', qr);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      this.qr = null; // Clear QR on close

      logger.info(`[${this.sessionId}] Connection closed. Reason: ${statusCode}. Reconnecting: ${shouldReconnect}`);

      if (shouldReconnect) {
        this.emit('disconnected');
        this.reconnectWithBackoff();
      } else {
        this.emit('loggedOut');
      }
    } else if (connection === 'open') {
      logger.info(`[${this.sessionId}] Connection opened`);
      this.retryCount = 0;
      this.isReconnecting = false;
      this.qr = null;
      
      const phoneNumber = this.sock?.user?.id ? this.sock.user.id.split(':')[0] : null;
      this.emit('connected', phoneNumber);
    }
  }

  handleMessagesUpsert({ messages, type }) {
    if (type === 'notify') {
      for (const msg of messages) {
        this.emit('message', msg);
      }
    }
  }

  handleMessagesUpdate(updates) {
    for (const update of updates) {
      this.emit('message.status', update);
    }
  }

  reconnectWithBackoff() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 60s
    let delay = Math.pow(2, this.retryCount) * 1000;
    if (delay > this.maxDelay) {
      delay = this.maxDelay;
    } else {
      this.retryCount += 1;
    }

    logger.info(`[${this.sessionId}] Reconnecting in ${delay}ms (Attempt ${this.retryCount})`);
    
    setTimeout(async () => {
      this.isReconnecting = false;
      try {
        await this.connect();
      } catch (err) {
        logger.error(`[${this.sessionId}] Reconnection failed:`, err);
        this.reconnectWithBackoff();
      }
    }, delay);
  }

  async disconnect() {
    if (this.sock) {
      this.sock.ws.close();
      this.sock = null;
      this.qr = null;
      this.emit('disconnected');
    }
  }

  async getQR() {
    return this.qr;
  }

  _resolveMedia(url) {
    if (!url) return null;
    if (typeof url !== 'string') return url;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return { url };
    }
    const cleanPath = url.replace(/^\//, '');
    const localPath = path.resolve(process.cwd(), cleanPath);
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath);
    }
    return { url };
  }

  async sendTextMessage(jid, text) {
    if (!this.sock) throw new Error('Socket not connected');
    return await this.sock.sendMessage(jid, { text });
  }

  async sendImageMessage(jid, url, caption) {
    if (!this.sock) throw new Error('Socket not connected');
    const media = this._resolveMedia(url);
    const imagePayload = Buffer.isBuffer(media) ? media : media;
    return await this.sock.sendMessage(jid, { image: imagePayload, caption });
  }

  async sendDocumentMessage(jid, url, filename, mimetype) {
    if (!this.sock) throw new Error('Socket not connected');
    const media = this._resolveMedia(url);
    const docPayload = Buffer.isBuffer(media) ? media : media;
    return await this.sock.sendMessage(jid, { document: docPayload, fileName: filename, mimetype });
  }

  async sendVoiceMessage(jid, url) {
    if (!this.sock) throw new Error('Socket not connected');
    const media = this._resolveMedia(url);
    const audioPayload = Buffer.isBuffer(media) ? media : media;

    // Detect format based on filename/URL
    let mimetype = 'audio/mpeg';
    let ptt = false;

    if (typeof url === 'string') {
      const lower = url.toLowerCase();
      if (lower.endsWith('.ogg')) {
        mimetype = 'audio/ogg; codecs=opus';
        ptt = true;
      } else if (lower.endsWith('.mp3')) {
        mimetype = 'audio/mpeg';
        ptt = false;
      } else if (lower.endsWith('.m4a') || lower.endsWith('.mp4') || lower.endsWith('.aac')) {
        mimetype = 'audio/mp4';
        ptt = true;
      }
    }

    return await this.sock.sendMessage(jid, {
      audio: audioPayload,
      mimetype,
      ptt
    });
  }


  async sendReaction(jid, messageId, emoji) {
    if (!this.sock) throw new Error('Socket not connected');
    return await this.sock.sendMessage(jid, { react: { text: emoji, key: { id: messageId, remoteJid: jid } } });
  }

  async sendPresenceUpdate(jid, type) {
    if (!this.sock) return;
    try {
      await Promise.race([
        this.sock.sendPresenceUpdate(type, jid),
        new Promise((r) => setTimeout(r, 800))
      ]);
    } catch (err) {
      // Ignore non-fatal presence error
    }
  }
}

