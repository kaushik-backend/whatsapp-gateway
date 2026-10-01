'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('outbox_jobs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      sessionId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: 'sessions',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      messageId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'messages',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      type: {
        type: Sequelize.STRING,
        allowNull: false
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('queued', 'processing', 'sent', 'failed'),
        allowNull: false,
        defaultValue: 'queued'
      },
      attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      maxAttempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 5
      },
      nextRetryAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      lockedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      lockedBy: {
        type: Sequelize.STRING,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.addIndex('outbox_jobs', ['sessionId', 'status']);
    await queryInterface.addIndex('outbox_jobs', ['status', 'nextRetryAt']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('outbox_jobs');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_outbox_jobs_status";');
  }
};
