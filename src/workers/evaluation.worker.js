const { Worker } = require('bullmq');
const { getRedisClient } = require('../config/redis');
const { QUEUE_NAMES, QUEUE_PREFIX } = require('../config/queue.config');
const { evaluationService } = require('../modules/evaluations/services/evaluation.service');
const { logger } = require('../config/logger');

// ============================================================
// Evaluation Worker — Background Evaluation Processor
// ============================================================
// Processes long-running offline RAG evaluation runs asynchronously.

function createEvaluationWorker() {
  const worker = new Worker(
    QUEUE_NAMES.EVALUATION,
    async (job) => {
      logger.info(
        {
          jobId: job.id,
          runId: job.data.runId,
          organizationId: job.data.organizationId,
        },
        'Processing background evaluation run'
      );

      const result = await evaluationService.executeRun({
        runId: job.data.runId,
        organizationId: job.data.organizationId,
      });

      logger.info(
        { jobId: job.id, runId: job.data.runId, status: result.status },
        'Background evaluation run finished'
      );

      return result;
    },
    {
      connection: getRedisClient(),
      prefix: QUEUE_PREFIX,
      concurrency: 1, // Run 1 heavy evaluation job at a time per worker
    }
  );

  worker.on('failed', (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        runId: job?.data?.runId,
        organizationId: job?.data?.organizationId,
        attempt: job?.attemptsMade,
        error: error.message,
      },
      'Evaluation worker job failed'
    );
  });

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id, runId: job.data?.runId }, 'Evaluation worker job completed');
  });

  return worker;
}

module.exports = { createEvaluationWorker };
