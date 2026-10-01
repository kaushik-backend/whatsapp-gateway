'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('webhook_deliveries', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      webhookId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'webhooks',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      messageId: {
        type: Sequelize.STRING,
        allowNull: true
      },
      event: {
        type: Sequelize.STRING,
        allowNull: false
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('pending', 'delivered', 'failed', 'dead'),
        allowNull: false,
        defaultValue: 'pending'
      },
      attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      nextRetryAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      lastError: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      lastStatusCode: {
        type: Sequelize.INTEGER,
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

    await queryInterface.addIndex('webhook_deliveries', ['status', 'nextRetryAt']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('webhook_deliveries');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_webhook_deliveries_status";');
  }
};
