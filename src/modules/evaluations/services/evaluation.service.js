const { evaluationRepository } = require('../repositories/evaluation.repository');
const { queryService } = require('../../query/query.service');
const { RetrievalMetrics } = require('../metrics/retrieval.metrics');
const { GenerationMetrics, generationMetrics } = require('../metrics/generation.metrics');
const { getEvaluationQueue } = require('../../../config/queue.config');
const { parsePaginationParams, buildOffsetPagination } = require('../../../utils/pagination');
const { NotFoundError, BadRequestError } = require('../../../utils/errors');
const { logger } = require('../../../config/logger');

// ============================================================
// Evaluation Service — Offline & Background RAG Benchmarking
// ============================================================
// Executes datasets against the RAG pipeline, computes IR and generation
// metrics, persists results, and generates comparative benchmark reports.

class EvaluationService {
  /**
   * @param {object} [options]
   * @param {import('../repositories/evaluation.repository').EvaluationRepository} [options.repository]
   * @param {import('../../query/query.service').QueryService} [options.queryService]
   * @param {import('../metrics/generation.metrics').GenerationMetrics} [options.generationMetrics]
   */
  constructor(options = {}) {
    this.repo = options.repository || evaluationRepository;
    this.queryService = options.queryService || queryService;
    this.genMetrics = options.generationMetrics || generationMetrics;
  }

  // ────────────────────────────────────────────────────────────
  // Datasets
  // ────────────────────────────────────────────────────────────

  async createDataset({ organizationId, name, description = null, cases = [] }) {
    if (!name || !name.trim()) {
      throw new BadRequestError('Dataset name is required', 'DATASET_NAME_REQUIRED');
    }

    const dataset = await this.repo.createDataset({
      organizationId,
      name: name.trim(),
      description,
    });

    if (Array.isArray(cases) && cases.length > 0) {
      await this.repo.addCases(dataset.id, cases);
    }

    return this.getDataset({ id: dataset.id, organizationId });
  }

  async getDataset({ id, organizationId }) {
    const dataset = await this.repo.findDatasetById(id, organizationId);
    if (!dataset) {
      throw new NotFoundError('Evaluation dataset not found', 'DATASET_NOT_FOUND');
    }

    const cases = await this.repo.findCasesByDatasetId(id);

    return {
      id: dataset.id,
      organizationId: dataset.organizationId,
      name: dataset.name,
      description: dataset.description,
      caseCount: cases.length,
      cases,
      createdAt: dataset.createdAt,
      updatedAt: dataset.updatedAt,
    };
  }

  async listDatasets({ organizationId, query = {} }) {
    const { limit, page } = parsePaginationParams(query);
    const skip = (page - 1) * limit;

    const [datasets, total] = await Promise.all([
      this.repo.listDatasets(organizationId, { skip, take: limit }),
      this.repo.countDatasets(organizationId),
    ]);

    const formatted = datasets.map((d) => ({
      id: d.id,
      organizationId: d.organizationId,
      name: d.name,
      description: d.description,
      caseCount: d._count?.cases || 0,
      runCount: d._count?.runs || 0,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    return {
      datasets: formatted,
      pagination: buildOffsetPagination(total, page, limit),
    };
  }

  async deleteDataset({ id, organizationId }) {
    const dataset = await this.repo.findDatasetById(id, organizationId);
    if (!dataset) {
      throw new NotFoundError('Evaluation dataset not found', 'DATASET_NOT_FOUND');
    }

    await this.repo.deleteDataset(id, organizationId);
    return { id, deleted: true };
  }

  async addCases({ datasetId, organizationId, cases = [] }) {
    const dataset = await this.repo.findDatasetById(datasetId, organizationId);
    if (!dataset) {
      throw new NotFoundError('Evaluation dataset not found', 'DATASET_NOT_FOUND');
    }

    if (!Array.isArray(cases) || cases.length === 0) {
      throw new BadRequestError('Cases array must contain at least one test case');
    }

    await this.repo.addCases(datasetId, cases);
    return this.getDataset({ id: datasetId, organizationId });
  }

  // ────────────────────────────────────────────────────────────
  // Runs & Execution
  // ────────────────────────────────────────────────────────────

  async createRun({ datasetId, organizationId, config = {}, asyncRun = false }) {
    const dataset = await this.repo.findDatasetById(datasetId, organizationId);
    if (!dataset) {
      throw new NotFoundError('Evaluation dataset not found', 'DATASET_NOT_FOUND');
    }

    const cases = await this.repo.findCasesByDatasetId(datasetId);
    if (cases.length === 0) {
      throw new BadRequestError('Cannot run evaluation on an empty dataset', 'EMPTY_DATASET');
    }

    const run = await this.repo.createRun({
      organizationId,
      datasetId,
      config,
      totalCases: cases.length,
    });

    if (asyncRun) {
      const queue = getEvaluationQueue();
      if (queue) {
        await queue.add('evaluation.run', {
          runId: run.id,
          organizationId,
        });
      }
      return run;
    }

    // Synchronous execution
    return this.executeRun({ runId: run.id, organizationId });
  }

  async getRun({ id, organizationId }) {
    const run = await this.repo.findRunById(id, organizationId);
    if (!run) {
      throw new NotFoundError('Evaluation run not found', 'EVALUATION_RUN_NOT_FOUND');
    }
    return run;
  }

  async listRuns({ organizationId, query = {} }) {
    const { limit, page } = parsePaginationParams(query);
    const skip = (page - 1) * limit;

    const [runs, total] = await Promise.all([
      this.repo.listRuns(organizationId, { skip, take: limit }),
      this.repo.countRuns(organizationId),
    ]);

    return {
      runs,
      pagination: buildOffsetPagination(total, page, limit),
    };
  }

  async getRunResults({ runId, organizationId }) {
    const run = await this.repo.findRunById(runId, organizationId);
    if (!run) {
      throw new NotFoundError('Evaluation run not found', 'EVALUATION_RUN_NOT_FOUND');
    }

    const results = await this.repo.findResultsByRunId(runId);
    return {
      run,
      results,
    };
  }

  /**
   * Execute an evaluation run against the RAG pipeline.
   *
   * @param {object} params
   * @param {string} params.runId
   * @param {string} params.organizationId
   * @returns {Promise<object>} Completed evaluation run
   */
  async executeRun({ runId, organizationId }) {
    const run = await this.repo.findRunById(runId, organizationId);
    if (!run) {
      throw new NotFoundError('Evaluation run not found', 'EVALUATION_RUN_NOT_FOUND');
    }

    const startTime = Date.now();
    await this.repo.updateRun(runId, { status: 'RUNNING' });

    try {
      const cases = await this.repo.findCasesByDatasetId(run.datasetId);
      const runConfig = run.config || {};

      const detailedResults = [];
      const retrievalScores = {
        precisionAt5: [],
        recallAt5: [],
        rr: [],
        hitRate: [],
      };
      const genScores = {
        answerRelevance: [],
        faithfulness: [],
        contextUtilization: [],
        overallScore: [],
      };

      for (const testCase of cases) {
        const caseStart = Date.now();
        let ragRes;
        let caseError = null;

        try {
          ragRes = await this.queryService.query({
            organizationId,
            query: testCase.question,
            topK: runConfig.topK || 5,
            answerMode: runConfig.answerMode || 'STRICT',
            enableHybrid: runConfig.enableHybrid !== false,
            enableReranking: runConfig.enableReranking !== false,
          });
        } catch (err) {
          caseError = err.message;
          ragRes = {
            answer: 'Error during query',
            citations: [],
            metadata: { retrievedChunks: 0, documentIds: [] },
          };
        }

        const caseDurationMs = Date.now() - caseStart;

        // Calculate Retrieval Metrics
        const expectedSources = Array.isArray(testCase.expectedSources) ? testCase.expectedSources : [];
        const retrievedDocIds = ragRes.metadata?.documentIds || [];
        const retrievedChunkIds = (ragRes.citations || []).map((c) => c.chunkId);
        const combinedRetrieved = [...retrievedDocIds, ...retrievedChunkIds];

        const pAt5 = RetrievalMetrics.precisionAtK(combinedRetrieved, expectedSources, 5);
        const rAt5 = RetrievalMetrics.recallAtK(combinedRetrieved, expectedSources, 5);
        const rr = RetrievalMetrics.reciprocalRank(combinedRetrieved, expectedSources);
        const hr = RetrievalMetrics.hitRate(combinedRetrieved, expectedSources, 5);

        retrievalScores.precisionAt5.push(pAt5);
        retrievalScores.recallAt5.push(rAt5);
        retrievalScores.rr.push(rr);
        retrievalScores.hitRate.push(hr);

        // Calculate Generation Metrics
        const genEval = await this.genMetrics.evaluate({
          question: testCase.question,
          generatedAnswer: ragRes.answer,
          retrievedChunks: ragRes.citations || [],
          citations: ragRes.citations || [],
          expectedAnswer: testCase.expectedAnswer,
        });

        genScores.answerRelevance.push(genEval.answerRelevance);
        genScores.faithfulness.push(genEval.faithfulness);
        genScores.contextUtilization.push(genEval.contextUtilization);
        genScores.overallScore.push(genEval.overallScore);

        detailedResults.push({
          runId,
          caseId: testCase.id,
          question: testCase.question,
          generatedAnswer: ragRes.answer,
          retrievedChunks: ragRes.citations || [],
          citations: ragRes.citations || [],
          scores: {
            precisionAt5: pAt5,
            recallAt5: rAt5,
            rr,
            hitRate: hr,
            answerRelevance: genEval.answerRelevance,
            faithfulness: genEval.faithfulness,
            contextUtilization: genEval.contextUtilization,
            overallScore: genEval.overallScore,
          },
          latencyMs: caseDurationMs,
          passed: caseError == null && genEval.faithfulness >= 0.5,
          errorMessage: caseError,
        });
      }

      // Persist individual results
      await this.repo.createResultsBatch(detailedResults);

      // Aggregate Metrics
      const avg = (arr) => (arr.length > 0 ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(4)) : 0);

      const aggregatedMetrics = {
        totalCases: cases.length,
        precisionAt5: avg(retrievalScores.precisionAt5),
        recallAt5: avg(retrievalScores.recallAt5),
        mrr: avg(retrievalScores.rr),
        hitRate: avg(retrievalScores.hitRate),
        answerRelevance: avg(genScores.answerRelevance),
        faithfulness: avg(genScores.faithfulness),
        contextUtilization: avg(genScores.contextUtilization),
        overallScore: avg(genScores.overallScore),
      };

      const totalDurationMs = Date.now() - startTime;

      const completedRun = await this.repo.updateRun(runId, {
        status: 'COMPLETED',
        metrics: aggregatedMetrics,
        completedCases: cases.length,
        latencyMs: totalDurationMs,
      });

      logger.info(
        { runId, organizationId, metrics: aggregatedMetrics, totalDurationMs },
        'Evaluation run completed successfully'
      );

      return completedRun;
    } catch (error) {
      const totalDurationMs = Date.now() - startTime;
      logger.error({ runId, error: error.message }, 'Evaluation run failed');

      return this.repo.updateRun(runId, {
        status: 'FAILED',
        errorMessage: error.message,
        latencyMs: totalDurationMs,
      });
    }
  }

  /**
   * Run Benchmark comparing Baseline RAG (pure vector) vs Phase 8 Advanced RAG (Hybrid + RRF + Rerank).
   *
   * @param {object} params
   * @param {string} params.datasetId
   * @param {string} params.organizationId
   * @returns {Promise<{ baseline: object, advanced: object, comparison: object }>}
   */
  async benchmarkComparison({ datasetId, organizationId }) {
    // 1. Run Baseline RAG (Pure vector, no rerank, no rewrite)
    const baselineRun = await this.createRun({
      datasetId,
      organizationId,
      config: {
        enableHybrid: false,
        enableReranking: false,
        enableQueryRewrite: false,
        answerMode: 'STRICT',
      },
    });

    // 2. Run Advanced RAG (Hybrid search, RRF fusion, score reranking, query rewriting)
    const advancedRun = await this.createRun({
      datasetId,
      organizationId,
      config: {
        enableHybrid: true,
        enableReranking: true,
        enableQueryRewrite: true,
        answerMode: 'STRICT',
      },
    });

    const bMetrics = baselineRun.metrics || {};
    const aMetrics = advancedRun.metrics || {};

    const diff = (a, b) => Number(((a || 0) - (b || 0)).toFixed(4));

    return {
      datasetId,
      baseline: {
        runId: baselineRun.id,
        status: baselineRun.status,
        ...bMetrics,
        latencyMs: baselineRun.latencyMs,
      },
      advanced: {
        runId: advancedRun.id,
        status: advancedRun.status,
        ...aMetrics,
        latencyMs: advancedRun.latencyMs,
      },
      improvement: {
        precisionAt5Diff: diff(aMetrics.precisionAt5, bMetrics.precisionAt5),
        recallAt5Diff: diff(aMetrics.recallAt5, bMetrics.recallAt5),
        mrrDiff: diff(aMetrics.mrr, bMetrics.mrr),
        hitRateDiff: diff(aMetrics.hitRate, bMetrics.hitRate),
        overallScoreDiff: diff(aMetrics.overallScore, bMetrics.overallScore),
      },
    };
  }
}

const evaluationService = new EvaluationService();

module.exports = {
  EvaluationService,
  evaluationService,
};
