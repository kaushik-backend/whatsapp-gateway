import db from '../models/index.js';
import AppError from '../utils/AppError.js';
import outboxService from './outbox.service.js';

class MessageService {
  /**
   * Internal method to check idempotency key
   */
  async _checkIdempotency(idempotencyKey) {
    if (!idempotencyKey) return null;
    return await db.Message.findOne({ where: { idempotencyKey } });
  }

  /**
   * Normalize a phone number to a WhatsApp JID
   */
  _normalizeJid(to) {
    if (typeof to !== 'string') return '';
    const trimmed = to.trim();
    if (trimmed.endsWith('@s.whatsapp.net') || trimmed.endsWith('@lid') || trimmed.endsWith('@g.us')) {
      return trimmed;
    }
    const cleanNumber = trimmed.replace(/[^0-9]/g, '');
    return `${cleanNumber}@s.whatsapp.net`;
  }

  async sendText(sessionId, to, text, idempotencyKey = null) {
    if (idempotencyKey) {
      const existing = await this._checkIdempotency(idempotencyKey);
      if (existing) return existing;
    }

    const session = await db.Session.findByPk(sessionId);
    if (!session) {
      throw new AppError('Session not found', 404);
    }

    const chatJid = this._normalizeJid(to);

    return await db.sequelize.transaction(async (t) => {
      const message = await db.Message.create({
        sessionId,
        chatJid,
        fromMe: true,
        type: 'text',
        body: { text },
        timestamp: Date.now(),
        status: 'queued',
        idempotencyKey
      }, { transaction: t });

      await outboxService.enqueue(sessionId, message.id, 'text', { text, to: chatJid }, t);

      return message;
    });
  }

  async sendImage(sessionId, to, url, caption, idempotencyKey = null) {
    if (idempotencyKey) {
      const existing = await this._checkIdempotency(idempotencyKey);
      if (existing) return existing;
    }

    const session = await db.Session.findByPk(sessionId);
    if (!session) {
      throw new AppError('Session not found', 404);
    }

    const chatJid = this._normalizeJid(to);

    return await db.sequelize.transaction(async (t) => {
      const message = await db.Message.create({
        sessionId,
        chatJid,
        fromMe: true,
        type: 'image',
        body: { url, caption },
        timestamp: Date.now(),
        status: 'queued',
        idempotencyKey
      }, { transaction: t });

      await outboxService.enqueue(sessionId, message.id, 'image', { url, caption, to: chatJid }, t);

      return message;
    });
  }

  async sendDocument(sessionId, to, url, filename, mimetype, idempotencyKey = null) {
    if (idempotencyKey) {
      const existing = await this._checkIdempotency(idempotencyKey);
      if (existing) return existing;
    }

    const session = await db.Session.findByPk(sessionId);
    if (!session) {
      throw new AppError('Session not found', 404);
    }

    const chatJid = this._normalizeJid(to);

    return await db.sequelize.transaction(async (t) => {
      const message = await db.Message.create({
        sessionId,
        chatJid,
        fromMe: true,
        type: 'document',
        body: { url, filename, mimetype },
        timestamp: Date.now(),
        status: 'queued',
        idempotencyKey
      }, { transaction: t });

      await outboxService.enqueue(sessionId, message.id, 'document', { url, filename, mimetype, to: chatJid }, t);

      return message;
    });
  }

  async sendVoice(sessionId, to, url, text = '', idempotencyKey = null) {
    if (idempotencyKey) {
      const existing = await this._checkIdempotency(idempotencyKey);
      if (existing) return existing;
    }

    const session = await db.Session.findByPk(sessionId);
    if (!session) {
      throw new AppError('Session not found', 404);
    }

    const chatJid = this._normalizeJid(to);

    return await db.sequelize.transaction(async (t) => {
      const message = await db.Message.create({
        sessionId,
        chatJid,
        fromMe: true,
        type: 'voice',
        body: { url, text: text || '' },
        timestamp: Date.now(),
        status: 'queued',
        idempotencyKey
      }, { transaction: t });

      await outboxService.enqueue(sessionId, message.id, 'voice', { url, text: text || '', to: chatJid }, t);

      return message;
    });
  }

  async sendReaction(sessionId, to, waMessageId, emoji) {
    const session = await db.Session.findByPk(sessionId);
    if (!session) {
      throw new AppError('Session not found', 404);
    }

    const chatJid = this._normalizeJid(to);

    return await db.sequelize.transaction(async (t) => {
      const message = await db.Message.create({
        sessionId,
        chatJid,
        fromMe: true,
        type: 'reaction',
        body: { waMessageId, emoji },
        timestamp: Date.now(),
        status: 'queued'
      }, { transaction: t });

      await outboxService.enqueue(sessionId, message.id, 'reaction', { waMessageId, emoji, to: chatJid }, t);

      return message;
    });
  }

  async getById(messageId) {
    const message = await db.Message.findByPk(messageId);
    if (!message) {
      throw new AppError('Message not found', 404);
    }
    return message;
  }

  async getBySession(sessionId, { chatJid, limit = 50, offset = 0 } = {}) {
    const where = { sessionId };
    if (chatJid) {
      where.chatJid = chatJid;
    }

    const { count, rows } = await db.Message.findAndCountAll({
      where,
      limit,
      offset,
      order: [['timestamp', 'DESC']]
    });

    return { total: count, data: rows };
  }

  async getChatContext(sessionId, chatJid, limit = 50) {
    const messages = await db.Message.findAll({
      where: { sessionId, chatJid },
      limit,
      order: [['timestamp', 'DESC']]
    });
    return messages;
  }
}

export default new MessageService();
