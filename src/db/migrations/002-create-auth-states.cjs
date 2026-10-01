'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('auth_states', {
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
      type: {
        type: Sequelize.ENUM('creds', 'key'),
        allowNull: false
      },
      key: {
        type: Sequelize.STRING,
        allowNull: false
      },
      value: {
        type: Sequelize.JSONB,
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

    await queryInterface.addIndex('auth_states', ['sessionId', 'type', 'key'], {
      unique: true,
      name: 'auth_states_session_type_key_unique'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('auth_states');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_auth_states_type";');
  }
};
