const { prisma } = require('../../config/database');
const { logger } = require('../../config/logger');

// ============================================================
// Knowledge Graph Service
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================
// Manages organization-scoped entities, relations, and subgraph querying.

class KnowledgeGraphService {
  /**
   * Upsert an entity within an organization.
   * @param {object} params
   * @param {string} params.organizationId
   * @param {string} params.name
   * @param {string} params.type - 'CONCEPT' | 'ORGANIZATION' | 'TECHNOLOGY' | 'PERSON' | 'PRODUCT'
   * @param {object} [params.metadata]
   * @returns {Promise<object>}
   */
  async upsertEntity({ organizationId, name, type = 'CONCEPT', metadata = {} }) {
    const cleanName = name.trim();
    const cleanType = type.toUpperCase().trim();

    return prisma.entity.upsert({
      where: {
        organizationId_name_type: {
          organizationId,
          name: cleanName,
          type: cleanType,
        },
      },
      create: {
        organizationId,
        name: cleanName,
        type: cleanType,
        metadata,
      },
      update: {
        metadata,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Upsert a relation between two entities.
   * @param {object} params
   * @param {string} params.organizationId
   * @param {string} params.sourceEntityId
   * @param {string} params.targetEntityId
   * @param {string} params.relationType - e.g. 'USES', 'DEPENDS_ON', 'DEVELOPED_BY', 'RELATED_TO'
   * @param {number} [params.confidence=1.0]
   * @param {object} [params.metadata]
   * @returns {Promise<object>}
   */
  async upsertRelation({
    organizationId,
    sourceEntityId,
    targetEntityId,
    relationType = 'RELATED_TO',
    confidence = 1.0,
    metadata = {},
  }) {
    if (sourceEntityId === targetEntityId) return null;

    const cleanRel = relationType.toUpperCase().trim();

    return prisma.entityRelation.upsert({
      where: {
        organizationId_sourceEntityId_targetEntityId_relationType: {
          organizationId,
          sourceEntityId,
          targetEntityId,
          relationType: cleanRel,
        },
      },
      create: {
        organizationId,
        sourceEntityId,
        targetEntityId,
        relationType: cleanRel,
        confidence,
        metadata,
      },
      update: {
        confidence,
        metadata,
      },
    });
  }

  /**
   * Extract entities and relations from text heuristically or via patterns.
   * @param {object} params
   * @param {string} params.organizationId
   * @param {string} params.text
   * @param {string} [params.documentId]
   * @returns {Promise<{ entities: Array<object>, relations: Array<object> }>}
   */
  async extractAndIndexGraph({ organizationId, text, documentId = null }) {
    if (!text || typeof text !== 'string') {
      return { entities: [], relations: [] };
    }

    try {
      // 1. Heuristic entity extraction: Capitalized technical terms & acronyms
      const entityMatches = text.match(/\b([A-Z][a-zA-Z0-9_-]+(?:\s+[A-Z][a-zA-Z0-9_-]+)*)\b/g) || [];
      const stopWords = new Set(['The', 'This', 'That', 'These', 'Those', 'There', 'Where', 'When', 'What', 'How', 'Why', 'Section', 'Page', 'Table', 'DocQuery']);

      const uniqueNames = Array.from(
        new Set(
          entityMatches
            .map((e) => e.trim())
            .filter((e) => e.length > 2 && !stopWords.has(e))
        )
      ).slice(0, 15);

      const createdEntities = [];
      for (const name of uniqueNames) {
        let type = 'CONCEPT';
        if (/\b(API|SDK|PostgreSQL|Redis|Docker|Kubernetes|Prisma|JWT|BullMQ|OAuth|REST)\b/i.test(name)) {
          type = 'TECHNOLOGY';
        } else if (/\b(Inc|LLC|Corp|OpenAI|Anthropic|Google|Cohere|Microsoft)\b/i.test(name)) {
          type = 'ORGANIZATION';
        }

        const entity = await this.upsertEntity({
          organizationId,
          name,
          type,
          metadata: documentId ? { documentId } : {},
        });
        createdEntities.push(entity);
      }

      // 2. Co-occurrence relation extraction within paragraph sentences
      const createdRelations = [];
      const sentences = text.split(/[.?!]\s+/);

      for (const sentence of sentences) {
        const sentenceEntities = createdEntities.filter((e) =>
          sentence.toLowerCase().includes(e.name.toLowerCase())
        );

        if (sentenceEntities.length >= 2) {
          for (let i = 0; i < sentenceEntities.length - 1; i++) {
            const rel = await this.upsertRelation({
              organizationId,
              sourceEntityId: sentenceEntities[i].id,
              targetEntityId: sentenceEntities[i + 1].id,
              relationType: 'RELATED_TO',
              confidence: 0.85,
              metadata: documentId ? { documentId } : {},
            });
            if (rel) createdRelations.push(rel);
          }
        }
      }

      return {
        entities: createdEntities,
        relations: createdRelations,
      };
    } catch (error) {
      logger.warn({ error: error.message, organizationId }, 'Knowledge graph extraction error');
      return { entities: [], relations: [] };
    }
  }

  /**
   * Find 1-hop and 2-hop related entities.
   * @param {string} organizationId
   * @param {string[]} entityNames
   * @returns {Promise<Array<object>>}
   */
  async findRelatedEntities(organizationId, entityNames) {
    if (!entityNames || entityNames.length === 0) return [];

    const entities = await prisma.entity.findMany({
      where: {
        organizationId,
        name: { in: entityNames, mode: 'insensitive' },
      },
      include: {
        sourceOf: {
          include: { targetEntity: true },
        },
        targetOf: {
          include: { sourceEntity: true },
        },
      },
    });

    return entities;
  }
}

const knowledgeGraphService = new KnowledgeGraphService();

module.exports = {
  KnowledgeGraphService,
  knowledgeGraphService,
};
