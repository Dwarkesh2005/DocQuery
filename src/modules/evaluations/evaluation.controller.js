const { evaluationService } = require('./services/evaluation.service');

// ============================================================
// Evaluation Controller — Thin HTTP Layer
// ============================================================

async function createDataset(req, res, next) {
  try {
    const { name, description, cases } = req.body;
    const data = await evaluationService.createDataset({
      organizationId: req.organization.id,
      name,
      description,
      cases,
    });

    res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function getDataset(req, res, next) {
  try {
    const data = await evaluationService.getDataset({
      id: req.params.id,
      organizationId: req.organization.id,
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function listDatasets(req, res, next) {
  try {
    const data = await evaluationService.listDatasets({
      organizationId: req.organization.id,
      query: req.query,
    });

    res.status(200).json({
      success: true,
      data: data.datasets,
      pagination: data.pagination,
    });
  } catch (error) {
    next(error);
  }
}

async function deleteDataset(req, res, next) {
  try {
    const data = await evaluationService.deleteDataset({
      id: req.params.id,
      organizationId: req.organization.id,
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function addCases(req, res, next) {
  try {
    const data = await evaluationService.addCases({
      datasetId: req.params.id,
      organizationId: req.organization.id,
      cases: req.body.cases,
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function createRun(req, res, next) {
  try {
    const { datasetId, config, async: asyncRun } = req.body;
    const data = await evaluationService.createRun({
      datasetId,
      organizationId: req.organization.id,
      config,
      asyncRun,
    });

    res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function getRun(req, res, next) {
  try {
    const data = await evaluationService.getRun({
      id: req.params.id,
      organizationId: req.organization.id,
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function listRuns(req, res, next) {
  try {
    const data = await evaluationService.listRuns({
      organizationId: req.organization.id,
      query: req.query,
    });

    res.status(200).json({
      success: true,
      data: data.runs,
      pagination: data.pagination,
    });
  } catch (error) {
    next(error);
  }
}

async function getRunResults(req, res, next) {
  try {
    const data = await evaluationService.getRunResults({
      runId: req.params.id,
      organizationId: req.organization.id,
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function executeRun(req, res, next) {
  try {
    const data = await evaluationService.executeRun({
      runId: req.params.id,
      organizationId: req.organization.id,
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function benchmark(req, res, next) {
  try {
    const { datasetId } = req.body;
    const data = await evaluationService.benchmarkComparison({
      datasetId,
      organizationId: req.organization.id,
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createDataset,
  getDataset,
  listDatasets,
  deleteDataset,
  addCases,
  createRun,
  getRun,
  listRuns,
  getRunResults,
  executeRun,
  benchmark,
};
