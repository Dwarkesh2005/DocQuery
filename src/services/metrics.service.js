// ============================================================
// Metrics Service — Enterprise Observability & Performance Tracking
// ============================================================
// Aggregates operational telemetry for HTTP, RAG, LLMs, Vector Embeddings,
// and Background Workers.
//
// Thread-safe and in-memory with automatic rolling summary calculations.
// Strict Privacy: Never logs or stores sensitive user queries, prompts, or PII.

class MetricsService {
  constructor() {
    this.reset();
  }

  /**
   * Reset all counters and metrics.
   */
  reset() {
    this.startTime = Date.now();
    this.http = {
      totalRequests: 0,
      totalErrors: 0,
      statusCodes: {
        '2xx': 0,
        '3xx': 0,
        '4xx': 0,
        '5xx': 0,
      },
      totalDurationMs: 0,
      avgLatencyMs: 0,
    };

    this.rag = {
      totalQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRate: 0,
      noContextResponses: 0,
      totalRetrievalDurationMs: 0,
      avgRetrievalLatencyMs: 0,
      totalLlmDurationMs: 0,
      avgLlmLatencyMs: 0,
      totalRagDurationMs: 0,
      avgRagLatencyMs: 0,
      totalChunksRetrieved: 0,
    };

    this.llm = {
      requests: 0,
      errors: 0,
      totalLatencyMs: 0,
      avgLatencyMs: 0,
      providers: {},
    };

    this.embeddings = {
      requests: 0,
      totalTexts: 0,
      errors: 0,
      totalLatencyMs: 0,
      avgLatencyMs: 0,
    };

    this.workers = {
      jobsProcessed: 0,
      jobsFailed: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
    };

    this.evaluations = {
      totalRuns: 0,
      completedRuns: 0,
      failedRuns: 0,
      totalCasesEvaluated: 0,
      totalDurationMs: 0,
      avgRunDurationMs: 0,
    };
  }

  /**
   * Record HTTP request metrics.
   * @param {object} params
   * @param {number} params.statusCode
   * @param {number} params.durationMs
   */
  recordHttpRequest({ statusCode, durationMs = 0 }) {
    this.http.totalRequests += 1;
    this.http.totalDurationMs += durationMs;
    this.http.avgLatencyMs = Number(
      (this.http.totalDurationMs / this.http.totalRequests).toFixed(2)
    );

    const bucket = `${Math.floor(statusCode / 100)}xx`;
    if (this.http.statusCodes[bucket] !== undefined) {
      this.http.statusCodes[bucket] += 1;
    }

    if (statusCode >= 400) {
      this.http.totalErrors += 1;
    }
  }

  /**
   * Record RAG query metrics.
   * @param {object} params
   * @param {boolean} params.cacheHit
   * @param {boolean} [params.noContext]
   * @param {number} [params.retrievalDurationMs]
   * @param {number} [params.llmDurationMs]
   * @param {number} params.totalDurationMs
   * @param {number} [params.chunksRetrieved]
   */
  recordRagQuery({
    cacheHit = false,
    noContext = false,
    retrievalDurationMs = 0,
    llmDurationMs = 0,
    totalDurationMs = 0,
    chunksRetrieved = 0,
  }) {
    this.rag.totalQueries += 1;

    if (cacheHit) {
      this.rag.cacheHits += 1;
    } else {
      this.rag.cacheMisses += 1;
    }

    this.rag.cacheHitRate = Number(
      ((this.rag.cacheHits / this.rag.totalQueries) * 100).toFixed(2)
    );

    if (noContext) {
      this.rag.noContextResponses += 1;
    }

    this.rag.totalRetrievalDurationMs += retrievalDurationMs;
    this.rag.avgRetrievalLatencyMs = Number(
      (this.rag.totalRetrievalDurationMs / (this.rag.cacheMisses || 1)).toFixed(2)
    );

    this.rag.totalLlmDurationMs += llmDurationMs;
    this.rag.avgLlmLatencyMs = Number(
      (this.rag.totalLlmDurationMs / (this.rag.cacheMisses || 1)).toFixed(2)
    );

    this.rag.totalRagDurationMs += totalDurationMs;
    this.rag.avgRagLatencyMs = Number(
      (this.rag.totalRagDurationMs / this.rag.totalQueries).toFixed(2)
    );

    this.rag.totalChunksRetrieved += chunksRetrieved;
  }

  /**
   * Record LLM generation call metrics.
   * @param {object} params
   * @param {string} params.provider
   * @param {string} params.model
   * @param {number} params.durationMs
   * @param {boolean} [params.success=true]
   */
  recordLlmCall({ provider = 'unknown', model = 'default', durationMs = 0, success = true }) {
    this.llm.requests += 1;
    this.llm.totalLatencyMs += durationMs;
    this.llm.avgLatencyMs = Number(
      (this.llm.totalLatencyMs / this.llm.requests).toFixed(2)
    );

    if (!success) {
      this.llm.errors += 1;
    }

    const key = `${provider}:${model}`;
    this.llm.providers[key] = (this.llm.providers[key] || 0) + 1;
  }

  /**
   * Record embedding generation metrics.
   * @param {object} params
   * @param {number} params.textCount
   * @param {number} params.durationMs
   * @param {boolean} [params.success=true]
   */
  recordEmbeddingCall({ textCount = 1, durationMs = 0, success = true }) {
    this.embeddings.requests += 1;
    this.embeddings.totalTexts += textCount;
    this.embeddings.totalLatencyMs += durationMs;
    this.embeddings.avgLatencyMs = Number(
      (this.embeddings.totalLatencyMs / this.embeddings.requests).toFixed(2)
    );

    if (!success) {
      this.embeddings.errors += 1;
    }
  }

  /**
   * Record background worker job processing metrics.
   * @param {object} params
   * @param {number} params.durationMs
   * @param {boolean} [params.success=true]
   */
  recordWorkerJob({ durationMs = 0, success = true }) {
    if (success) {
      this.workers.jobsProcessed += 1;
    } else {
      this.workers.jobsFailed += 1;
    }

    const totalJobs = this.workers.jobsProcessed + this.workers.jobsFailed;
    this.workers.totalDurationMs += durationMs;
    this.workers.avgDurationMs = Number(
      (this.workers.totalDurationMs / (totalJobs || 1)).toFixed(2)
    );
  }

  /**
   * Record background evaluation run telemetry.
   * @param {object} params
   * @param {number} params.casesCount
   * @param {number} params.durationMs
   * @param {boolean} [params.success=true]
   */
  recordEvaluationRun({ casesCount = 0, durationMs = 0, success = true }) {
    this.evaluations.totalRuns += 1;
    this.evaluations.totalCasesEvaluated += casesCount;
    this.evaluations.totalDurationMs += durationMs;

    if (success) {
      this.evaluations.completedRuns += 1;
    } else {
      this.evaluations.failedRuns += 1;
    }

    this.evaluations.avgRunDurationMs = Number(
      (this.evaluations.totalDurationMs / this.evaluations.totalRuns).toFixed(2)
    );
  }

  /**
   * Retrieve structured telemetry summary.
   * @returns {object}
   */
  getSummary() {
    const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
    const memoryUsage = process.memoryUsage();

    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: uptimeSec,
      memory: {
        rssMb: Number((memoryUsage.rss / 1024 / 1024).toFixed(2)),
        heapUsedMb: Number((memoryUsage.heapUsed / 1024 / 1024).toFixed(2)),
        heapTotalMb: Number((memoryUsage.heapTotal / 1024 / 1024).toFixed(2)),
      },
      http: { ...this.http },
      rag: { ...this.rag },
      llm: { ...this.llm },
      embeddings: { ...this.embeddings },
      workers: { ...this.workers },
      evaluations: { ...this.evaluations },
    };
  }
}

const metricsService = new MetricsService();

module.exports = {
  MetricsService,
  metricsService,
};
