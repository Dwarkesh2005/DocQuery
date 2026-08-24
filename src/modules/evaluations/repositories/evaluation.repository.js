const { prisma } = require('../../../config/database');

// ============================================================
// Evaluation Repository — Tenant-Isolated Persistence Layer
// ============================================================
// Manages database persistence for Evaluation Datasets, Cases, Runs, and Results.

class EvaluationRepository {
  // ── Datasets ──

  async createDataset({ organizationId, name, description = null }) {
    return prisma.evaluationDataset.create({
      data: {
        organizationId,
        name,
        description,
      },
    });
  }

  async findDatasetById(id, organizationId) {
    return prisma.evaluationDataset.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        _count: {
          select: { cases: true, runs: true },
        },
      },
    });
  }

  async listDatasets(organizationId, { skip = 0, take = 50 } = {}) {
    return prisma.evaluationDataset.findMany({
      where: { organizationId },
      include: {
        _count: {
          select: { cases: true, runs: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async countDatasets(organizationId) {
    return prisma.evaluationDataset.count({
      where: { organizationId },
    });
  }

  async deleteDataset(id, organizationId) {
    return prisma.evaluationDataset.deleteMany({
      where: { id, organizationId },
    });
  }

  // ── Cases ──

  async addCases(datasetId, cases = []) {
    const data = cases.map((c) => ({
      datasetId,
      question: c.question,
      expectedAnswer: c.expectedAnswer || null,
      expectedSources: c.expectedSources || [],
      metadata: c.metadata || {},
    }));

    return prisma.evaluationCase.createMany({
      data,
    });
  }

  async findCasesByDatasetId(datasetId) {
    return prisma.evaluationCase.findMany({
      where: { datasetId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ── Runs ──

  async createRun({ organizationId, datasetId, config = {}, totalCases = 0 }) {
    return prisma.evaluationRun.create({
      data: {
        organizationId,
        datasetId,
        status: 'PENDING',
        config,
        totalCases,
        completedCases: 0,
      },
    });
  }

  async findRunById(id, organizationId) {
    return prisma.evaluationRun.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        dataset: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async listRuns(organizationId, { skip = 0, take = 50 } = {}) {
    return prisma.evaluationRun.findMany({
      where: { organizationId },
      include: {
        dataset: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async countRuns(organizationId) {
    return prisma.evaluationRun.count({
      where: { organizationId },
    });
  }

  async updateRun(id, data) {
    return prisma.evaluationRun.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  // ── Results ──

  async createResultsBatch(results = []) {
    return prisma.evaluationResult.createMany({
      data: results,
    });
  }

  async findResultsByRunId(runId) {
    return prisma.evaluationResult.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });
  }
}

const evaluationRepository = new EvaluationRepository();

module.exports = {
  EvaluationRepository,
  evaluationRepository,
};
