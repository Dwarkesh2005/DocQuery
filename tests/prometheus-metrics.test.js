const request = require('supertest');
const app = require('../src/app');
const { prometheusService } = require('../src/services/prometheus.service');
const { metricsService } = require('../src/services/metrics.service');

describe('Phase 10.5 — Prometheus Metrics & Exposition Format', () => {
  beforeEach(() => {
    metricsService.reset();
  });

  it('should render valid Prometheus metric lines', () => {
    metricsService.recordHttpRequest({ statusCode: 200, durationMs: 45 });
    metricsService.recordRagQuery({ cacheHit: true, totalDurationMs: 120 });
    metricsService.recordWorkerJob({ durationMs: 300, success: true });

    const output = prometheusService.getMetrics();

    expect(output).toContain('# TYPE http_requests_total counter');
    expect(output).toContain('http_requests_total 1');
    expect(output).toContain('rag_queries_total 1');
    expect(output).toContain('rag_cache_hits_total 1');
    expect(output).toContain('worker_jobs_total{status="completed"} 1');
  });

  it('should expose GET /metrics endpoint with correct Content-Type', async () => {
    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('docquery_uptime_seconds');
  });
});
