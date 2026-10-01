import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Session extends Model {
  static associate(models) {
    Session.hasMany(models.AuthState, { foreignKey: 'sessionId', as: 'authStates' });
    Session.hasMany(models.Message, { foreignKey: 'sessionId', as: 'messages' });
    Session.hasMany(models.OutboxJob, { foreignKey: 'sessionId', as: 'outboxJobs' });
    Session.hasMany(models.Webhook, { foreignKey: 'sessionId', as: 'webhooks' });
  }
}

Session.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('starting', 'qr', 'connected', 'reconnecting', 'logged_out'),
      allowNull: false,
      defaultValue: 'starting'
    },
    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'Session',
    tableName: 'sessions',
    indexes: [
      {
        fields: ['status']
      }
    ]
  }
);

export default Session;
