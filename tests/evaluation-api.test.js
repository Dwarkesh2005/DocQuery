const request = require('supertest');
const app = require('../src/app');
const { cleanDatabase, disconnectDatabase, prisma } = require('./setup');
const { generateAccessToken } = require('../src/utils/jwt');

describe('Phase 8.15 — Evaluation HTTP APIs', () => {
  let userA, orgA, tokenA;
  let userB, orgB, tokenB;

  beforeEach(async () => {
    await cleanDatabase();

    // User A & Org A
    userA = await prisma.user.create({
      data: { email: `eval_a_${Date.now()}@test.com`, name: 'User A', passwordHash: 'hash' },
    });
    orgA = await prisma.organization.create({
      data: {
        name: 'Eval Org A',
        memberships: { create: { userId: userA.id, role: 'OWNER' } },
      },
    });
    tokenA = generateAccessToken(userA.id);

    // User B & Org B
    userB = await prisma.user.create({
      data: { email: `eval_b_${Date.now()}@test.com`, name: 'User B', passwordHash: 'hash' },
    });
    orgB = await prisma.organization.create({
      data: {
        name: 'Eval Org B',
        memberships: { create: { userId: userB.id, role: 'OWNER' } },
      },
    });
    tokenB = generateAccessToken(userB.id);
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('should create, list, retrieve, and delete evaluation datasets within tenant isolation', async () => {
    // 1. Create Dataset in Org A
    const createRes = await request(app)
      .post('/api/v1/evaluations/datasets')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({
        name: 'Compliance Test Dataset',
        description: 'Test cases for SOC2 compliance',
        cases: [
          {
            question: 'What is the encryption standard for data at rest?',
            expectedAnswer: 'AES-256',
            expectedSources: ['doc-sec-1'],
          },
        ],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    const datasetId = createRes.body.data.id;
    expect(datasetId).toBeDefined();
    expect(createRes.body.data.caseCount).toBe(1);

    // 2. Org A can list datasets
    const listResA = await request(app)
      .get('/api/v1/evaluations/datasets')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id);

    expect(listResA.status).toBe(200);
    expect(listResA.body.data.length).toBe(1);

    // 3. Org B cannot see Org A dataset
    const listResB = await request(app)
      .get('/api/v1/evaluations/datasets')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Organization-Id', orgB.id);

    expect(listResB.status).toBe(200);
    expect(listResB.body.data.length).toBe(0);

    // 4. Org B cannot access Org A dataset directly (404)
    const getResB = await request(app)
      .get(`/api/v1/evaluations/datasets/${datasetId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Organization-Id', orgB.id);

    expect(getResB.status).toBe(404);

    // 5. Add cases to dataset
    const addCaseRes = await request(app)
      .post(`/api/v1/evaluations/datasets/${datasetId}/cases`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({
        cases: [
          {
            question: 'How often are penetration tests conducted?',
            expectedAnswer: 'Annually',
          },
        ],
      });

    expect(addCaseRes.status).toBe(200);
    expect(addCaseRes.body.data.caseCount).toBe(2);
  });

  it('should trigger evaluation runs, fetch run status, and retrieve itemized results', async () => {
    // 1. Create Dataset
    const dsRes = await request(app)
      .post('/api/v1/evaluations/datasets')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({
        name: 'API QA Dataset',
        cases: [{ question: 'What is our SLA target?', expectedAnswer: '99.9%' }],
      });
    const datasetId = dsRes.body.data.id;

    // 2. Trigger Evaluation Run (Synchronous)
    const runRes = await request(app)
      .post('/api/v1/evaluations/runs')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({
        datasetId,
        config: { answerMode: 'STRICT', enableHybrid: true },
        async: false,
      });

    expect(runRes.status).toBe(201);
    expect(runRes.body.data.status).toBe('COMPLETED');
    const runId = runRes.body.data.id;

    // 3. Get Run Details
    const getRunRes = await request(app)
      .get(`/api/v1/evaluations/runs/${runId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id);

    expect(getRunRes.status).toBe(200);
    expect(getRunRes.body.data.id).toBe(runId);
    expect(getRunRes.body.data.metrics).toBeDefined();

    // 4. Get Detailed Itemized Results
    const resultsRes = await request(app)
      .get(`/api/v1/evaluations/runs/${runId}/results`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id);

    expect(resultsRes.status).toBe(200);
    expect(resultsRes.body.data.results.length).toBe(1);
    expect(resultsRes.body.data.results[0].question).toBe('What is our SLA target?');
  });

  it('should run benchmark comparison endpoint POST /api/v1/evaluations/benchmark', async () => {
    const dsRes = await request(app)
      .post('/api/v1/evaluations/datasets')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({
        name: 'Benchmark API Dataset',
        cases: [{ question: 'Explain retention policy', expectedAnswer: '7 years' }],
      });

    const benchRes = await request(app)
      .post('/api/v1/evaluations/benchmark')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({
        datasetId: dsRes.body.data.id,
      });

    expect(benchRes.status).toBe(200);
    expect(benchRes.body.data.baseline).toBeDefined();
    expect(benchRes.body.data.advanced).toBeDefined();
    expect(benchRes.body.data.improvement).toBeDefined();
  });
});
