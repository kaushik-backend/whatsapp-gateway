import { randomUUID } from 'crypto';
import db from '../models/index.js';
import { QueryTypes } from 'sequelize';

class OutboxService {
  async enqueue(sessionId, messageId, type, payload, transaction = null) {
    return await db.OutboxJob.create({
      sessionId,
      messageId,
      type,
      payload,
      status: 'queued',
      attempts: 0,
      maxAttempts: 5,
      nextRetryAt: new Date()
    }, { transaction });
  }

  async dequeue(sessionId) {
    const workerId = randomUUID();
    const now = new Date();
    const staleLockThreshold = new Date(Date.now() - 15000);

    // Auto-recover any stale locks from crashes or timeouts
    try {
      await db.OutboxJob.update(
        { status: 'queued', lockedAt: null, lockedBy: null },
        { where: { status: 'processing', sessionId, lockedAt: { [db.Sequelize.Op.lt]: staleLockThreshold } } }
      );
    } catch (e) {}

    // Use raw query with FOR UPDATE SKIP LOCKED for concurrent safety
    const query = `
      UPDATE "outbox_jobs"
      SET 
        status = 'processing',
        "lockedAt" = :now,
        "lockedBy" = :workerId
      WHERE id = (
        SELECT id FROM "outbox_jobs"
        WHERE status = 'queued'
          AND "sessionId" = :sessionId
          AND "nextRetryAt" <= :now
        ORDER BY id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *;
    `;


    const [results] = await db.sequelize.query(query, {
      replacements: { now, workerId, sessionId },
      type: QueryTypes.UPDATE,
      logging: false
    });

    if (results && results.length > 0) {
      return results[0];
    }
    return null;
  }

  async markSent(jobId, waMessageId) {
    return await db.sequelize.transaction(async (t) => {
      const job = await db.OutboxJob.findByPk(jobId, { transaction: t });
      if (!job) return null;

      job.status = 'sent';
      job.lockedAt = null;
      job.lockedBy = null;
      await job.save({ transaction: t });

      await db.Message.update(
        { status: 'sent', waMessageId },
        { where: { id: job.messageId }, transaction: t }
      );

      return job;
    });
  }

  async markFailed(jobId, error) {
    return await db.sequelize.transaction(async (t) => {
      const job = await db.OutboxJob.findByPk(jobId, { transaction: t });
      if (!job) return null;

      job.attempts += 1;
      
      if (job.attempts < job.maxAttempts) {
        job.status = 'queued';
        // Exponential backoff: 2^attempts * 10 seconds
        const backoffSeconds = Math.pow(2, job.attempts) * 10;
        job.nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);
      } else {
        job.status = 'failed';
        await db.Message.update(
          { status: 'failed' },
          { where: { id: job.messageId }, transaction: t }
        );
      }

      job.lockedAt = null;
      job.lockedBy = null;
      await job.save({ transaction: t });

      return job;
    });
  }

  async reschedule(jobId, retryAfterMs, reason = 'rate_limited') {
    return await db.sequelize.transaction(async (t) => {
      const job = await db.OutboxJob.findByPk(jobId, { transaction: t });
      if (!job) return null;

      job.status = 'queued';
      job.lockedAt = null;
      job.lockedBy = null;
      job.nextRetryAt = new Date(Date.now() + Math.max(retryAfterMs, 1000));
      await job.save({ transaction: t });

      return job;
    });
  }

  async cleanStaleJobs() {
    // Reset jobs locked for > 5 minutes
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
    
    const [affectedCount] = await db.OutboxJob.update(
      { 
        status: 'queued', 
        lockedAt: null, 
        lockedBy: null 
      },
      { 
        where: { 
          status: 'processing',
          lockedAt: {
            [db.Sequelize.Op.lt]: staleThreshold
          }
        } 
      }
    );
    
    return affectedCount;
  }

  async getStats(sessionId) {
    const stats = await db.OutboxJob.findAll({
      attributes: ['status', [db.sequelize.fn('COUNT', '*'), 'count']],
      where: { sessionId },
      group: ['status']
    });

    const result = { queued: 0, processing: 0, sent: 0, failed: 0 };
    for (const stat of stats) {
      result[stat.status] = parseInt(stat.get('count'), 10);
    }
    return result;
  }
}

export default new OutboxService();
