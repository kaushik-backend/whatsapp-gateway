import db from '../models/index.js';
import AppError from '../utils/AppError.js';
import { webhookDispatcher } from '../workers/webhookDispatcher.js';

class WebhookService {
  /**
   * Register a new webhook
   */
  async register(sessionId, url, secret, events, chatJids = []) {
    const webhook = await db.Webhook.create({
      sessionId,
      url,
      secret,
      events,
      chatJids,
      active: true,
    });
    return webhook;
  }

  /**
   * List webhooks for a session or globally
   */
  async list(sessionId = null) {
    const where = {};
    if (sessionId) {
      where.sessionId = sessionId;
    }
    return await db.Webhook.findAll({ where, order: [['id', 'DESC']] });
  }

  /**
   * Update a webhook
   */
  async update(id, data) {
    const webhook = await db.Webhook.findByPk(id);
    if (!webhook) {
      throw new AppError('Webhook not found', 404);
    }

    const { url, events, chatJids, active } = data;
    if (url !== undefined) webhook.url = url;
    if (events !== undefined) webhook.events = events;
    if (chatJids !== undefined) webhook.chatJids = chatJids;
    if (active !== undefined) webhook.active = active;

    await webhook.save();
    return webhook;
  }

  /**
   * Delete a webhook
   */
  async delete(id) {
    const webhook = await db.Webhook.findByPk(id);
    if (!webhook) {
      throw new AppError('Webhook not found', 404);
    }
    await webhook.destroy();
    return true;
  }

  /**
   * Get deliveries for a webhook
   */
  async getDeliveries(webhookId, { status, limit = 50, offset = 0 } = {}) {
    const webhook = await db.Webhook.findByPk(webhookId);
    if (!webhook) {
      throw new AppError('Webhook not found', 404);
    }

    const where = { webhookId };
    if (status) {
      where.status = status;
    }

    const { count, rows } = await db.WebhookDelivery.findAndCountAll({
      where,
      limit,
      offset,
      order: [['id', 'DESC']],
    });

    return { total: count, deliveries: rows };
  }

  /**
   * Retry a failed delivery
   */
  async retryDelivery(deliveryId) {
    const delivery = await db.WebhookDelivery.findByPk(deliveryId);
    if (!delivery) {
      throw new AppError('Webhook delivery not found', 404);
    }

    if (delivery.status === 'delivered') {
      throw new AppError('Delivery already successful', 400);
    }

    delivery.status = 'pending';
    delivery.attempts = 0;
    delivery.nextRetryAt = new Date();
    await delivery.save();

    return delivery;
  }

  /**
   * Handle inbound message from Baileys
   */
  async handleInboundMessage(sessionId, messagePayload) {
    const { waMessageId, chatJid, fromMe, type, body, timestamp } = messagePayload;

    const allowedTypes = ['text', 'image', 'document', 'voice', 'reaction'];
    const safeType = allowedTypes.includes(type) ? type : 'text';

    // Save message to DB (upsert/ignore if exists)
    let messageRecord;
    try {
      [messageRecord] = await db.Message.findOrCreate({
        where: { waMessageId },
        defaults: {
          sessionId,
          waMessageId,
          chatJid,
          fromMe: false,
          type: safeType,
          body: body || { text: '' },
          timestamp: timestamp || Math.floor(Date.now() / 1000),
          status: 'delivered' // Inbound message
        }
      });
    } catch (error) {
      logger.warn(`Could not findOrCreate inbound message: ${error.message}`);
      messageRecord = await db.Message.findOne({ where: { waMessageId } });
    }

    if (!messageRecord) {
      logger.error(`Could not persist or find inbound message with WA ID: ${waMessageId}`);
      return;
    }

    // Find webhooks interested in this
    const webhooks = await db.Webhook.findAll({
      where: {
        sessionId,
        active: true
      }
    });

    for (const webhook of webhooks) {
      if (!webhook.events.includes('message.received')) continue;
      if (webhook.chatJids && webhook.chatJids.length > 0 && !webhook.chatJids.includes(chatJid)) continue;

      const payload = {
        event: 'message.received',
        sessionId,
        message: messageRecord.toJSON()
      };

      const delivery = await db.WebhookDelivery.create({
        webhookId: webhook.id,
        messageId: waMessageId,
        event: 'message.received',
        payload,
        status: 'pending',
        attempts: 0,
        nextRetryAt: new Date()
      });

      // Trigger dispatch without waiting
      webhookDispatcher.dispatch(delivery).catch(() => {});
    }

    // Trigger AI Support Bot with RAG pipeline
    try {
      const { aiBotService } = await import('./aiBot.service.js');
      if (aiBotService) {
        aiBotService.handleInboundMessage(sessionId, messageRecord).catch((err) => {
          logger.error(`Error in AI bot auto-reply: ${err.message}`);
        });
      }
    } catch (err) {
      logger.error(`Error importing AI bot service: ${err.message}`);
    }
  }

  /**
   * Handle status updates from Baileys
   */
  async handleStatusUpdate(sessionId, waMessageId, status) {
    const message = await db.Message.findOne({ where: { waMessageId } });
    if (message) {
      message.status = status;
      await message.save();
    }

    // Find webhooks
    const webhooks = await db.Webhook.findAll({
      where: {
        sessionId,
        active: true
      }
    });

    for (const webhook of webhooks) {
      if (!webhook.events.includes('message.status')) continue;

      const payload = {
        event: 'message.status',
        sessionId,
        waMessageId,
        status
      };

      const delivery = await db.WebhookDelivery.create({
        webhookId: webhook.id,
        messageId: waMessageId,
        event: 'message.status',
        payload,
        status: 'pending',
        attempts: 0,
        nextRetryAt: new Date()
      });

      // Trigger dispatch without waiting
      webhookDispatcher.dispatch(delivery).catch(() => {});
    }
  }
}

export const webhookService = new WebhookService();
