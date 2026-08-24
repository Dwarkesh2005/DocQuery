const request = require('supertest');
const app = require('../src/app');
const { metricsService } = require('../src/services/metrics.service');

describe('Phase 7.6 — Observability & Application Metrics', () => {
  beforeEach(() => {
    metricsService.reset();
  });

  describe('Metrics Service Functionality', () => {
    it('should track HTTP request metrics and calculate average latency', () => {
      metricsService.recordHttpRequest({ statusCode: 200, durationMs: 50 });
      metricsService.recordHttpRequest({ statusCode: 200, durationMs: 150 });
      metricsService.recordHttpRequest({ statusCode: 404, durationMs: 10 });
      metricsService.recordHttpRequest({ statusCode: 500, durationMs: 90 });

      const summary = metricsService.getSummary();
      expect(summary.http.totalRequests).toBe(4);
      expect(summary.http.totalErrors).toBe(2);
      expect(summary.http.statusCodes['2xx']).toBe(2);
      expect(summary.http.statusCodes['4xx']).toBe(1);
      expect(summary.http.statusCodes['5xx']).toBe(1);
      expect(summary.http.avgLatencyMs).toBe(75);
    });

    it('should track RAG metrics and compute cache hit rate', () => {
      metricsService.recordRagQuery({
        cacheHit: true,
        totalDurationMs: 10,
        chunksRetrieved: 0,
      });

      metricsService.recordRagQuery({
        cacheHit: false,
        retrievalDurationMs: 40,
        llmDurationMs: 200,
        totalDurationMs: 245,
        chunksRetrieved: 5,
      });

      metricsService.recordRagQuery({
        cacheHit: false,
        noContext: true,
        retrievalDurationMs: 30,
        llmDurationMs: 0,
        totalDurationMs: 32,
        chunksRetrieved: 0,
      });

      const summary = metricsService.getSummary();
      expect(summary.rag.totalQueries).toBe(3);
      expect(summary.rag.cacheHits).toBe(1);
      expect(summary.rag.cacheMisses).toBe(2);
      expect(summary.rag.cacheHitRate).toBe(33.33);
      expect(summary.rag.noContextResponses).toBe(1);
      expect(summary.rag.totalChunksRetrieved).toBe(5);
    });

    it('should track LLM generation metrics and provider distribution', () => {
      metricsService.recordLlmCall({
        provider: 'openai',
        model: 'gpt-4o-mini',
        durationMs: 300,
        success: true,
      });
      metricsService.recordLlmCall({
        provider: 'openai',
        model: 'gpt-4o-mini',
        durationMs: 400,
        success: false,
      });

      const summary = metricsService.getSummary();
      expect(summary.llm.requests).toBe(2);
      expect(summary.llm.errors).toBe(1);
      expect(summary.llm.avgLatencyMs).toBe(350);
      expect(summary.llm.providers['openai:gpt-4o-mini']).toBe(2);
    });

    it('should track Vector Embedding generation metrics', () => {
      metricsService.recordEmbeddingCall({
        textCount: 15,
        durationMs: 120,
        success: true,
      });

      const summary = metricsService.getSummary();
      expect(summary.embeddings.requests).toBe(1);
      expect(summary.embeddings.totalTexts).toBe(15);
      expect(summary.embeddings.avgLatencyMs).toBe(120);
      expect(summary.embeddings.errors).toBe(0);
    });

    it('should track Worker processing metrics', () => {
      metricsService.recordWorkerJob({ durationMs: 100, success: true });
      metricsService.recordWorkerJob({ durationMs: 200, success: false });

      const summary = metricsService.getSummary();
      expect(summary.workers.jobsProcessed).toBe(1);
      expect(summary.workers.jobsFailed).toBe(1);
      expect(summary.workers.avgDurationMs).toBe(150);
    });
  });

  describe('GET /health/metrics Endpoint', () => {
    it('should return aggregated application metrics without leaking secrets or PII', async () => {
      const res = await request(app).get('/health/metrics');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { data } = res.body;
      expect(data.timestamp).toBeDefined();
      expect(data.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(data.memory).toBeDefined();
      expect(data.http).toBeDefined();
      expect(data.rag).toBeDefined();
      expect(data.llm).toBeDefined();
      expect(data.embeddings).toBeDefined();
      expect(data.workers).toBeDefined();

      // Ensure no passwords, keys, or sensitive fields are returned
      const str = JSON.stringify(data);
      expect(str).not.toContain('password');
      expect(str).not.toContain('secret');
      expect(str).not.toContain('OPENAI_API_KEY');
    });
  });
});
