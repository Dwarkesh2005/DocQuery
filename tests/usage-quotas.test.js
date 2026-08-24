const { usageMeteringService } = require('../src/services/usage-metering.service');
const { quotaService, QuotaExceededError } = require('../src/services/quota.service');
const { costOptimizerService } = require('../src/services/cost-optimizer.service');
const { modelRouterService } = require('../src/services/model-router.service');
const { prisma, cleanDatabase } = require('./setup');

describe('Phase 9.9 — Usage Metering, Quotas & Cost Optimization', () => {
  let org;

  beforeEach(async () => {
    await cleanDatabase();

    org = await prisma.organization.create({
      data: { name: 'Usage Quota Org' },
    });
  });

  describe('UsageMeteringService', () => {
    it('should record usage events and calculate monthly aggregates', async () => {
      await usageMeteringService.recordUsage({
        organizationId: org.id,
        eventType: 'QUERY',
        quantity: 5,
      });

      await usageMeteringService.recordUsage({
        organizationId: org.id,
        eventType: 'API_REQUEST',
        quantity: 12,
      });

      const monthly = await usageMeteringService.getCurrentMonthlyUsage(org.id);
      expect(monthly.totalQueries).toBe(5);
      expect(monthly.totalApiRequests).toBe(12);
    });
  });

  describe('QuotaService', () => {
    it('should initialize default FREE plan quota for an organization', async () => {
      const quota = await quotaService.getOrCreateQuota(org.id, 'FREE');
      expect(quota.plan).toBe('FREE');
      expect(quota.maxDocuments).toBe(100);
      expect(quota.maxQueriesPerMonth).toBe(1000);
    });

    it('should throw QuotaExceededError when query limit is reached', async () => {
      // Create a restrictive quota with maxQueriesPerMonth = 2
      await prisma.organizationQuota.upsert({
        where: { organizationId: org.id },
        create: {
          organizationId: org.id,
          maxQueriesPerMonth: 2,
        },
        update: {
          maxQueriesPerMonth: 2,
        },
      });

      // Record 2 queries
      await usageMeteringService.recordUsage({
        organizationId: org.id,
        eventType: 'QUERY',
        quantity: 2,
      });

      await expect(quotaService.checkQuota(org.id, 'QUERIES')).rejects.toThrow(QuotaExceededError);
    });
  });

  describe('CostOptimizerService', () => {
    it('should cache and retrieve embeddings', async () => {
      const text = 'Embedding optimization test string';
      const vector = [0.1, 0.2, 0.3, 0.4];

      await costOptimizerService.cacheEmbedding(text, vector);
      const cached = await costOptimizerService.getCachedEmbedding(text);

      expect(cached).toEqual(vector);
    });

    it('should compress and deduplicate repeated context sentences', () => {
      const chunks = [
        { content: 'Sentence A. Sentence B. Sentence A.' },
        { content: 'Sentence B. Sentence C.' },
      ];

      const compressed = costOptimizerService.compressContext(chunks);
      expect(compressed.length).toBe(2);
      expect(compressed[0].content).toBe('Sentence A. Sentence B.');
      expect(compressed[1].content).toBe('Sentence C.');
    });
  });

  describe('ModelRouterService', () => {
    it('should route simple queries to fast model and complex queries to advanced model', () => {
      const simple = modelRouterService.route({ query: 'What is the vacation policy?', intent: 'factual' });
      const complex = modelRouterService.route({ query: 'Compare Plan A with Plan B in detail', intent: 'comparison' });

      expect(simple.tier).toBe('FAST');
      expect(simple.model).toBe('gpt-4o-mini');
      expect(complex.tier).toBe('ADVANCED');
      expect(complex.model).toBe('gpt-4o');
    });
  });
});
