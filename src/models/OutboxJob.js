import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class OutboxJob extends Model {
  static associate(models) {
    OutboxJob.belongsTo(models.Session, { foreignKey: 'sessionId', as: 'session' });
    OutboxJob.belongsTo(models.Message, { foreignKey: 'messageId', as: 'message' });
  }
}

OutboxJob.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    sessionId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    messageId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('queued', 'processing', 'sent', 'failed'),
      allowNull: false,
      defaultValue: 'queued'
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    maxAttempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5
    },
    nextRetryAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    lockedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    lockedBy: {
      type: DataTypes.STRING,
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'OutboxJob',
    tableName: 'outbox_jobs',
    indexes: [
      {
        fields: ['sessionId', 'status']
      },
      {
        fields: ['nextRetryAt']
      }
    ]
  }
);

export default OutboxJob;
