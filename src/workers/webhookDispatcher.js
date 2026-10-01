import { Op } from 'sequelize';
import db from '../models/index.js';
import { signPayload } from '../utils/crypto.js';
import logger from '../utils/logger.js';

class WebhookDispatcher {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * Calculate next retry time based on attempt number
   */
  getNextRetryTime(attempt) {
    const now = Date.now();
    // 1s, 5s, 30s, 2m, 10m, 1h
    const delays = [1000, 5000, 30000, 120000, 600000, 3600000];
    const delay = delays[Math.min(attempt, delays.length - 1)];
    return new Date(now + delay);
  }

  /**
   * Dispatch a single delivery
   */
  async dispatch(delivery) {
    try {
      const webhook = delivery.webhook || await db.Webhook.findByPk(delivery.webhookId);
      
      if (!webhook || !webhook.active) {
        delivery.status = 'dead';
        delivery.lastError = 'Webhook inactive or deleted';
        await delivery.save();
        return;
      }

      const payloadStr = JSON.stringify(delivery.payload);
      const signature = signPayload(webhook.secret, payloadStr);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5 sec timeout

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': `sha256=${signature}`,
          'X-Timestamp': Date.now().toString(),
          'X-Delivery-Id': delivery.id.toString()
        },
        body: payloadStr,
        signal: controller.signal
      });

      clearTimeout(timeout);

      delivery.lastStatusCode = response.status;
      
      if (response.ok) {
        delivery.status = 'delivered';
      } else {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

    } catch (error) {
      logger.error(`Webhook delivery ${delivery.id} failed: ${error.message}`);
      delivery.lastError = error.message;
      delivery.attempts += 1;

      if (delivery.attempts >= 6) {
        delivery.status = 'dead';
      } else {
        delivery.status = 'failed';
        delivery.nextRetryAt = this.getNextRetryTime(delivery.attempts);
      }
    }

    await delivery.save();
  }

  /**
   * Process pending/failed retries
   */
  async processRetries() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const now = new Date();
      const deliveries = await db.WebhookDelivery.findAll({
        where: {
          [Op.or]: [
            { status: 'pending' },
            {
              status: 'failed',
              nextRetryAt: { [Op.lte]: now },
              attempts: { [Op.lt]: 6 }
            }
          ]
        },
        include: [{ model: db.Webhook, as: 'webhook' }],
        limit: 100 // Process in batches
      });

      for (const delivery of deliveries) {
        // Fire and forget (or await if strict sequence needed, but parallel is faster)
        this.dispatch(delivery).catch(err => {
          logger.error(`Error in dispatching delivery ${delivery.id}: ${err.message}`);
        });
      }
    } catch (error) {
      logger.error(`Error processing webhook retries: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start the retry polling loop
   */
  start() {
    if (this.intervalId) return;
    logger.info('Starting Webhook Dispatcher Worker...');
    this.intervalId = setInterval(() => this.processRetries(), 5000); // Check every 5s
  }

  /**
   * Stop the retry polling loop
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Stopped Webhook Dispatcher Worker');
    }
  }
}

export const webhookDispatcher = new WebhookDispatcher();
