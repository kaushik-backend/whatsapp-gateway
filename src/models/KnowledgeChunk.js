import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class KnowledgeChunk extends Model {
  static associate(models) {
    KnowledgeChunk.belongsTo(models.KnowledgeDocument, {
      foreignKey: 'documentId',
      as: 'document',
      onDelete: 'CASCADE'
    });
  }
}

KnowledgeChunk.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    documentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'knowledge_documents',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    embedding: {
      type: DataTypes.ARRAY(DataTypes.FLOAT),
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'KnowledgeChunk',
    tableName: 'knowledge_chunks',
    timestamps: true
  }
);

export default KnowledgeChunk;
