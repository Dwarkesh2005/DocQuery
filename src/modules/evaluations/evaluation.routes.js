const { Router } = require('express');
const evaluationController = require('./evaluation.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { resolveOrganization } = require('../../middleware/organization.middleware');
const { validate } = require('../../middleware/validate.middleware');
const {
  createDatasetSchema,
  addCasesSchema,
  datasetIdParamSchema,
  createRunSchema,
  runIdParamSchema,
  benchmarkSchema,
} = require('./evaluation.schema');

// ============================================================
// Evaluation Routes
// ============================================================

const router = Router();

// All evaluation endpoints require authentication and tenant resolution
router.use(authenticate, resolveOrganization);

// ── Datasets ──
router.post('/datasets', validate(createDatasetSchema), evaluationController.createDataset);
router.get('/datasets', evaluationController.listDatasets);
router.get('/datasets/:id', validate(datasetIdParamSchema), evaluationController.getDataset);
router.delete('/datasets/:id', validate(datasetIdParamSchema), evaluationController.deleteDataset);
router.post('/datasets/:id/cases', validate(addCasesSchema), evaluationController.addCases);

// ── Runs ──
router.post('/runs', validate(createRunSchema), evaluationController.createRun);
router.get('/runs', evaluationController.listRuns);
router.get('/runs/:id', validate(runIdParamSchema), evaluationController.getRun);
router.get('/runs/:id/results', validate(runIdParamSchema), evaluationController.getRunResults);
router.post('/runs/:id/execute', validate(runIdParamSchema), evaluationController.executeRun);

// ── Benchmarking ──
router.post('/benchmark', validate(benchmarkSchema), evaluationController.benchmark);

module.exports = router;
