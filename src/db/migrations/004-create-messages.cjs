'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('messages', {
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
      waMessageId: {
        type: Sequelize.STRING,
        allowNull: true
      },
      chatJid: {
        type: Sequelize.STRING,
        allowNull: false
      },
      fromMe: {
        type: Sequelize.BOOLEAN,
        allowNull: false
      },
      type: {
        type: Sequelize.ENUM('text', 'image', 'document', 'voice', 'reaction'),
        allowNull: false
      },
      body: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      timestamp: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('queued', 'sent', 'delivered', 'read', 'failed'),
        allowNull: false,
        defaultValue: 'queued'
      },
      idempotencyKey: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true
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

    await queryInterface.addIndex('messages', ['sessionId', 'chatJid']);
    await queryInterface.addIndex('messages', ['waMessageId']);
    await queryInterface.addIndex('messages', ['idempotencyKey'], { unique: true, where: { idempotencyKey: { [Sequelize.Op.ne]: null } } });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('messages');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_messages_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_messages_status";');
  }
};
