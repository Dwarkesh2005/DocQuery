const { ragCacheService } = require('../src/services/rag-cache.service');
const { QueryService } = require('../src/modules/query/query.service');
const { MockLLMProvider } = require('../src/modules/query/providers/mock.llm-provider');
const redisService = require('../src/services/redis.service');
const { getRedisClient, disconnectRedis } = require('../src/config/redis');

describe('Phase 7.3 — RAG Redis Caching & Invalidation', () => {
  beforeAll(async () => {
    const client = getRedisClient();
    if (client.status !== 'ready') {
      await new Promise((resolve) => {
        let timer;
        const onDone = () => {
          clearTimeout(timer);
          client.removeListener('ready', onDone);
          client.removeListener('error', onDone);
          resolve();
        };
        client.once('ready', onDone);
        client.once('error', onDone);
        timer = setTimeout(onDone, 1500);
      });
    }
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  const testOrgA = `org_a_${Date.now()}`;
  const testOrgB = `org_b_${Date.now()}`;

  it('should store and retrieve cached RAG responses (cache hit vs miss)', async () => {
    const query = 'What is the refund policy?';
    const fakeData = {
      answer: 'Refunds are available within 30 days.',
      citations: [{ chunkId: 'c1', documentId: 'd1', content: 'Refunds 30 days', score: 0.95 }],
      metadata: { retrievedChunks: 1, topScore: 0.95 },
    };

    // 1. Initial get is a cache miss
    const initialGet = await ragCacheService.get({
      organizationId: testOrgA,
      query,
    });
    expect(initialGet).toBeNull();

    // 2. Set cache entry
    const setResult = await ragCacheService.set({
      organizationId: testOrgA,
      query,
      data: fakeData,
      ttlSeconds: 60,
    });
    expect(setResult).toBe(true);

    // 3. Subsequent get is a cache hit
    const cachedGet = await ragCacheService.get({
      organizationId: testOrgA,
      query,
    });
    expect(cachedGet).not.toBeNull();
    expect(cachedGet.answer).toBe(fakeData.answer);
    expect(cachedGet.citations.length).toBe(1);
  });

  it('should enforce strict tenant isolation in cache keys', async () => {
    const query = 'What are the company holiday hours?';
    const dataOrgA = {
      answer: 'Org A is closed on Christmas.',
      citations: [],
      metadata: { org: 'A' },
    };

    await ragCacheService.set({
      organizationId: testOrgA,
      query,
      data: dataOrgA,
      ttlSeconds: 60,
    });

    // Org A hits cache
    const cachedA = await ragCacheService.get({
      organizationId: testOrgA,
      query,
    });
    expect(cachedA).not.toBeNull();
    expect(cachedA.answer).toBe(dataOrgA.answer);

    // Org B with the exact same query MUST miss cache (tenant isolation)
    const cachedB = await ragCacheService.get({
      organizationId: testOrgB,
      query,
    });
    expect(cachedB).toBeNull();
  });

  it('should invalidate all tenant cache entries upon invalidateTenant call', async () => {
    const org = `org_inv_${Date.now()}`;
    await ragCacheService.set({
      organizationId: org,
      query: 'Query 1',
      data: { answer: 'A1' },
      ttlSeconds: 60,
    });
    await ragCacheService.set({
      organizationId: org,
      query: 'Query 2',
      data: { answer: 'A2' },
      ttlSeconds: 60,
    });

    expect(await ragCacheService.get({ organizationId: org, query: 'Query 1' })).not.toBeNull();
    expect(await ragCacheService.get({ organizationId: org, query: 'Query 2' })).not.toBeNull();

    // Invalidate
    await ragCacheService.invalidateTenant(org);

    expect(await ragCacheService.get({ organizationId: org, query: 'Query 1' })).toBeNull();
    expect(await ragCacheService.get({ organizationId: org, query: 'Query 2' })).toBeNull();
  });

  it('should integrate seamlessly with QueryService for cache hits and misses', async () => {
    const org = `org_qs_${Date.now()}`;
    const mockSearchService = {
      search: jest.fn().mockResolvedValue({
        query: 'What is the pricing?',
        results: [
          {
            chunkId: 'chunk-1',
            documentId: 'doc-1',
            content: 'Pricing is $10/month.',
            score: 0.92,
            pageNumber: 1,
            chunkIndex: 0,
            metadata: { documentName: 'pricing.pdf' },
          },
        ],
      }),
    };

    const mockLLM = new MockLLMProvider();
    const querySvc = new QueryService({
      searchService: mockSearchService,
      llmProvider: mockLLM,
      cacheService: ragCacheService,
    });

    // Turn 1: Cache Miss -> calls search & LLM
    const res1 = await querySvc.query({
      organizationId: org,
      query: 'What is the pricing?',
    });

    expect(res1.metadata.cacheHit).toBe(false);
    expect(mockSearchService.search).toHaveBeenCalledTimes(1);

    // Turn 2: Cache Hit -> does NOT call search or LLM
    const res2 = await querySvc.query({
      organizationId: org,
      query: 'What is the pricing?',
    });

    expect(res2.metadata.cacheHit).toBe(true);
    expect(mockSearchService.search).toHaveBeenCalledTimes(1); // Still 1 (skipped search)
    expect(res2.answer).toBe(res1.answer);
  });

  it('should fail-open gracefully when Redis is unavailable during cache operations', async () => {
    const originalGet = redisService.get;
    const originalSet = redisService.set;

    redisService.get = jest.fn().mockRejectedValue(new Error('Redis connection lost'));
    redisService.set = jest.fn().mockRejectedValue(new Error('Redis connection lost'));

    const result = await ragCacheService.get({
      organizationId: 'org_err',
      query: 'error test',
    });
    expect(result).toBeNull();

    const setResult = await ragCacheService.set({
      organizationId: 'org_err',
      query: 'error test',
      data: { answer: 'test' },
    });
    expect(setResult).toBe(false);

    redisService.get = originalGet;
    redisService.set = originalSet;
  });
});
