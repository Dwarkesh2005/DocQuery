const { metricsService } = require('./metrics.service');

// ============================================================
// Prometheus Metrics Exporter Service
// Phase 10: Production Deployment, SRE & Reliability
// ============================================================
// Formats application counters, histograms, and gauges into
// standard Prometheus exposition format (text/plain; version=0.0.4).

class PrometheusService {
  /**
   * Render Prometheus text metrics format.
   * @returns {string}
   */
  getMetrics() {
    const summary = metricsService.getSummary();
    const lines = [];

    // Header
    lines.push('# HELP docquery_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE docquery_uptime_seconds gauge');
    lines.push(`docquery_uptime_seconds ${summary.uptimeSeconds}`);
    lines.push('');

    // Memory
    lines.push('# HELP docquery_memory_bytes Process memory usage in bytes');
    lines.push('# TYPE docquery_memory_bytes gauge');
    lines.push(`docquery_memory_bytes{type="rss"} ${Math.round(summary.memory.rssMb * 1024 * 1024)}`);
    lines.push(`docquery_memory_bytes{type="heap_used"} ${Math.round(summary.memory.heapUsedMb * 1024 * 1024)}`);
    lines.push(`docquery_memory_bytes{type="heap_total"} ${Math.round(summary.memory.heapTotalMb * 1024 * 1024)}`);
    lines.push('');

    // HTTP Requests
    lines.push('# HELP http_requests_total Total number of HTTP requests');
    lines.push('# TYPE http_requests_total counter');
    lines.push(`http_requests_total ${summary.http.totalRequests}`);
    lines.push('');

    lines.push('# HELP http_requests_by_status_total HTTP requests partitioned by status class');
    lines.push('# TYPE http_requests_by_status_total counter');
    for (const [bucket, count] of Object.entries(summary.http.statusCodes)) {
      lines.push(`http_requests_by_status_total{status_class="${bucket}"} ${count}`);
    }
    lines.push('');

    lines.push('# HELP http_request_duration_ms Average HTTP request latency in milliseconds');
    lines.push('# TYPE http_request_duration_ms gauge');
    lines.push(`http_request_duration_ms ${summary.http.avgLatencyMs}`);
    lines.push('');

    lines.push('# HELP http_errors_total Total number of 4xx and 5xx HTTP responses');
    lines.push('# TYPE http_errors_total counter');
    lines.push(`http_errors_total ${summary.http.totalErrors}`);
    lines.push('');

    // RAG Telemetry
    lines.push('# HELP rag_queries_total Total RAG query operations');
    lines.push('# TYPE rag_queries_total counter');
    lines.push(`rag_queries_total ${summary.rag.totalQueries}`);
    lines.push('');

    lines.push('# HELP rag_cache_hits_total Total RAG query cache hits');
    lines.push('# TYPE rag_cache_hits_total counter');
    lines.push(`rag_cache_hits_total ${summary.rag.cacheHits}`);
    lines.push('');

    lines.push('# HELP rag_cache_misses_total Total RAG query cache misses');
    lines.push('# TYPE rag_cache_misses_total counter');
    lines.push(`rag_cache_misses_total ${summary.rag.cacheMisses}`);
    lines.push('');

    lines.push('# HELP rag_query_duration_ms Average RAG query latency in milliseconds');
    lines.push('# TYPE rag_query_duration_ms gauge');
    lines.push(`rag_query_duration_ms ${summary.rag.avgRagLatencyMs}`);
    lines.push('');

    // Background Workers
    lines.push('# HELP worker_jobs_total Total background jobs processed');
    lines.push('# TYPE worker_jobs_total counter');
    lines.push(`worker_jobs_total{status="completed"} ${summary.workers.jobsProcessed}`);
    lines.push(`worker_jobs_total{status="failed"} ${summary.workers.jobsFailed}`);
    lines.push('');

    lines.push('# HELP worker_job_duration_ms Average worker job processing latency in milliseconds');
    lines.push('# TYPE worker_job_duration_ms gauge');
    lines.push(`worker_job_duration_ms ${summary.workers.avgDurationMs}`);
    lines.push('');

    return lines.join('\n') + '\n';
  }
}

const prometheusService = new PrometheusService();

module.exports = {
  PrometheusService,
  prometheusService,
};
