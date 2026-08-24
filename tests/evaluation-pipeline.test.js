const { evaluationService } = require('../src/modules/evaluations/services/evaluation.service');
const { cleanDatabase, disconnectDatabase, prisma } = require('./setup');

describe('Phase 8.12 — Evaluation Pipeline & Execution', () => {
  let user, org;

  beforeEach(async () => {
    await cleanDatabase();

    user = await prisma.user.create({
      data: { email: `eval_user_${Date.now()}@test.com`, passwordHash: 'hash', name: 'Eval User' },
    });
    org = await prisma.organization.create({ data: { name: 'Eval Org' } });
    await prisma.organizationMember.create({
      data: { userId: user.id, organizationId: org.id, role: 'OWNER' },
    });
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('should create datasets and execute evaluation runs with detailed metric aggregation', async () => {
    const dataset = await evaluationService.createDataset({
      organizationId: org.id,
      name: 'Q3 Policy QA Dataset',
      description: 'Test cases for HR and billing policies',
      cases: [
        {
          question: 'What is the refund policy?',
          expectedAnswer: 'Refunds are given within 30 days.',
          expectedSources: ['doc-1'],
        },
        {
          question: 'How many vacation days do employees receive?',
          expectedAnswer: 'Employees receive 20 days.',
          expectedSources: ['doc-2'],
        },
      ],
    });

    expect(dataset.id).toBeDefined();
    expect(dataset.caseCount).toBe(2);

    // Execute synchronous evaluation run
    const run = await evaluationService.createRun({
      datasetId: dataset.id,
      organizationId: org.id,
      config: { enableHybrid: true },
      asyncRun: false,
    });

    expect(run.status).toBe('COMPLETED');
    expect(run.completedCases).toBe(2);
    expect(run.metrics).toBeDefined();
    expect(typeof run.metrics.precisionAt5).toBe('number');
    expect(typeof run.metrics.faithfulness).toBe('number');

    // Retrieve detailed results
    const { results } = await evaluationService.getRunResults({
      runId: run.id,
      organizationId: org.id,
    });

    expect(results.length).toBe(2);
    expect(results[0].scores).toBeDefined();
    expect(results[0].generatedAnswer).toBeDefined();
  });

  it('should execute benchmark comparison between Baseline RAG and Advanced RAG', async () => {
    const dataset = await evaluationService.createDataset({
      organizationId: org.id,
      name: 'Benchmark Dataset',
      cases: [
        {
          question: 'What is the pricing tier?',
          expectedAnswer: '$20/month',
          expectedSources: ['doc-pricing'],
        },
      ],
    });

    const benchmark = await evaluationService.benchmarkComparison({
      datasetId: dataset.id,
      organizationId: org.id,
    });

    expect(benchmark.baseline).toBeDefined();
    expect(benchmark.advanced).toBeDefined();
    expect(benchmark.improvement).toBeDefined();
    expect(benchmark.baseline.status).toBe('COMPLETED');
    expect(benchmark.advanced.status).toBe('COMPLETED');
  });
});
