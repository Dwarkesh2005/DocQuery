const { knowledgeGraphService } = require('../src/modules/knowledge-graph/knowledge-graph.service');
const { graphSearchService } = require('../src/modules/search/services/graph-search.service');
const { prisma, cleanDatabase } = require('./setup');

describe('Phase 9.6 — Knowledge Graph & Graph Retrieval', () => {
  let org;

  beforeEach(async () => {
    await cleanDatabase();

    org = await prisma.organization.create({
      data: { name: 'Graph Org' },
    });
  });

  it('should upsert entities and relations without duplicates', async () => {
    const e1 = await knowledgeGraphService.upsertEntity({
      organizationId: org.id,
      name: 'PostgreSQL',
      type: 'TECHNOLOGY',
    });

    const e2 = await knowledgeGraphService.upsertEntity({
      organizationId: org.id,
      name: 'pgvector',
      type: 'TECHNOLOGY',
    });

    expect(e1.name).toBe('PostgreSQL');
    expect(e2.name).toBe('pgvector');

    const rel = await knowledgeGraphService.upsertRelation({
      organizationId: org.id,
      sourceEntityId: e1.id,
      targetEntityId: e2.id,
      relationType: 'EXTENDS',
      confidence: 0.95,
    });

    expect(rel.relationType).toBe('EXTENDS');
    expect(rel.confidence).toBe(0.95);
  });

  it('should extract entities and co-occurrences from text and build subgraph', async () => {
    const text = 'DocQuery uses PostgreSQL and Redis for low latency vector search and distributed queuing with BullMQ.';
    const result = await knowledgeGraphService.extractAndIndexGraph({
      organizationId: org.id,
      text,
    });

    expect(result.entities.length).toBeGreaterThan(0);
    const names = result.entities.map((e) => e.name);
    expect(names).toContain('PostgreSQL');
    expect(names).toContain('Redis');
  });

  it('should query related entities from the knowledge graph', async () => {
    const e1 = await knowledgeGraphService.upsertEntity({
      organizationId: org.id,
      name: 'OpenAI',
      type: 'ORGANIZATION',
    });
    const e2 = await knowledgeGraphService.upsertEntity({
      organizationId: org.id,
      name: 'GPT-4',
      type: 'PRODUCT',
    });

    await knowledgeGraphService.upsertRelation({
      organizationId: org.id,
      sourceEntityId: e1.id,
      targetEntityId: e2.id,
      relationType: 'DEVELOPS',
    });

    const matches = await knowledgeGraphService.findRelatedEntities(org.id, ['OpenAI']);
    expect(matches.length).toBe(1);
    expect(matches[0].sourceOf.length).toBe(1);
    expect(matches[0].sourceOf[0].targetEntity.name).toBe('GPT-4');
  });
});
