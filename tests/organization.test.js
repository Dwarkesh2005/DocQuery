const request = require('supertest');
const app = require('../src/app');
const { cleanDatabase, disconnectDatabase } = require('./setup');

// ============================================================
// Organization Integration Tests
// ============================================================

let accessToken;
let userId;

beforeEach(async () => {
  await cleanDatabase();

  // Register a user for each test
  const res = await request(app).post('/api/v1/auth/register').send({
    name: 'Alice',
    email: 'alice@example.com',
    password: 'StrongPass123!',
  });
  accessToken = res.body.data.accessToken;
  userId = res.body.data.user.id;
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

// ────────────────────────────────────────────
// Create Organization
// ────────────────────────────────────────────

describe('POST /api/v1/organizations', () => {
  it('should create a new organization', async () => {
    const res = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Acme Corp' })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.organization.name).toBe('Acme Corp');
    expect(res.body.data.organization.id).toBeDefined();
  });

  it('should make creator the OWNER', async () => {
    const createRes = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Acme Corp' });

    const orgId = createRes.body.data.organization.id;

    // Check via organizations list
    const listRes = await request(app)
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const org = listRes.body.data.organizations.find((o) => o.id === orgId);
    expect(org.role).toBe('OWNER');
  });

  it('should reject unauthenticated request', async () => {
    await request(app)
      .post('/api/v1/organizations')
      .send({ name: 'Acme Corp' })
      .expect(401);
  });

  it('should reject empty name', async () => {
    await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: '' })
      .expect(422);
  });
});

// ────────────────────────────────────────────
// List Organizations
// ────────────────────────────────────────────

describe('GET /api/v1/organizations', () => {
  it('should list user organizations (includes default workspace)', async () => {
    const res = await request(app)
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    // Should have at least the default workspace from registration
    expect(res.body.data.organizations.length).toBeGreaterThanOrEqual(1);
  });

  it('should include newly created organizations', async () => {
    await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Org Two' });

    const res = await request(app)
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Default workspace + Org Two
    expect(res.body.data.organizations.length).toBe(2);
  });
});

// ────────────────────────────────────────────
// Get Organization by ID
// ────────────────────────────────────────────

describe('GET /api/v1/organizations/:id', () => {
  it('should return organization if user is member', async () => {
    const createRes = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'My Org' });

    const orgId = createRes.body.data.organization.id;

    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.organization.name).toBe('My Org');
  });

  it('should deny access to non-member organization', async () => {
    // Register another user and create an org
    const otherRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Bob',
      email: 'bob@example.com',
      password: 'StrongPass123!',
    });

    const otherOrgRes = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${otherRes.body.data.accessToken}`)
      .send({ name: 'Bob Only Org' });

    const bobOrgId = otherOrgRes.body.data.organization.id;

    // Alice tries to access Bob's org
    const res = await request(app)
      .get(`/api/v1/organizations/${bobOrgId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(res.body.error.code).toBe('ORG_ACCESS_DENIED');
  });
});
