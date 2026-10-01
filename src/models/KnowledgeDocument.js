import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class KnowledgeDocument extends Model {
  static associate(models) {
    KnowledgeDocument.hasMany(models.KnowledgeChunk, {
      foreignKey: 'documentId',
      as: 'chunks',
      onDelete: 'CASCADE'
    });
  }
}

KnowledgeDocument.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    filename: {
      type: DataTypes.STRING,
      allowNull: false
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    mimeType: {
      type: DataTypes.STRING,
      allowNull: false
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    totalChunks: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  },
  {
    sequelize,
    modelName: 'KnowledgeDocument',
    tableName: 'knowledge_documents',
    timestamps: true
  }
);

export default KnowledgeDocument;
