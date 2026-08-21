const request = require('supertest');
const app = require('../src/app');
const { cleanDatabase, disconnectDatabase } = require('./setup');

// ============================================================
// Tenant Isolation Tests
// ============================================================
// THE MOST IMPORTANT TEST:
// User A belonging to Organization A must NOT be able to
// access Organization B's resources or context.

let userA, userB;
let orgA_Id, orgB_Id;

beforeEach(async () => {
  await cleanDatabase();

  // Register User A
  const resA = await request(app).post('/api/v1/auth/register').send({
    name: 'User A',
    email: 'usera@example.com',
    password: 'StrongPass123!',
  });
  userA = {
    accessToken: resA.body.data.accessToken,
    userId: resA.body.data.user.id,
  };

  // Register User B
  const resB = await request(app).post('/api/v1/auth/register').send({
    name: 'User B',
    email: 'userb@example.com',
    password: 'StrongPass123!',
  });
  userB = {
    accessToken: resB.body.data.accessToken,
    userId: resB.body.data.user.id,
  };

  // User A creates Organization A
  const orgARes = await request(app)
    .post('/api/v1/organizations')
    .set('Authorization', `Bearer ${userA.accessToken}`)
    .send({ name: 'Organization A' });
  orgA_Id = orgARes.body.data.organization.id;

  // User B creates Organization B
  const orgBRes = await request(app)
    .post('/api/v1/organizations')
    .set('Authorization', `Bearer ${userB.accessToken}`)
    .send({ name: 'Organization B' });
  orgB_Id = orgBRes.body.data.organization.id;
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

// ────────────────────────────────────────────
// Cross-Tenant Access Prevention
// ────────────────────────────────────────────

describe('Tenant Isolation', () => {
  it('User A cannot access Organization B via X-Organization-Id', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgB_Id}/members`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .set('X-Organization-Id', orgB_Id)
      .expect(403);

    expect(res.body.error.code).toBe('ORG_ACCESS_DENIED');
  });

  it('User B cannot access Organization A via X-Organization-Id', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgA_Id}/members`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .set('X-Organization-Id', orgA_Id)
      .expect(403);

    expect(res.body.error.code).toBe('ORG_ACCESS_DENIED');
  });

  it('User A cannot get Organization B details', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgB_Id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(403);

    expect(res.body.error.code).toBe('ORG_ACCESS_DENIED');
  });

  it('User A cannot add members to Organization B', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgB_Id}/members`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .set('X-Organization-Id', orgB_Id)
      .send({ email: 'usera@example.com', role: 'MEMBER' })
      .expect(403);

    expect(res.body.error.code).toBe('ORG_ACCESS_DENIED');
  });

  it('User A only sees their own organizations', async () => {
    const res = await request(app)
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    const orgIds = res.body.data.organizations.map((o) => o.id);
    expect(orgIds).toContain(orgA_Id);
    expect(orgIds).not.toContain(orgB_Id);
  });

  it('User B only sees their own organizations', async () => {
    const res = await request(app)
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);

    const orgIds = res.body.data.organizations.map((o) => o.id);
    expect(orgIds).toContain(orgB_Id);
    expect(orgIds).not.toContain(orgA_Id);
  });

  it('Changing X-Organization-Id header does not grant access', async () => {
    // User A is member of Org A. Try to use Org B's ID.
    const res = await request(app)
      .get(`/api/v1/organizations/${orgB_Id}/members`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .set('X-Organization-Id', orgB_Id)
      .expect(403);

    expect(res.body.error.code).toBe('ORG_ACCESS_DENIED');
  });

  it('After joining Org B, User A can access it', async () => {
    // Owner (User B) adds User A to Org B
    await request(app)
      .post(`/api/v1/organizations/${orgB_Id}/members`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .set('X-Organization-Id', orgB_Id)
      .send({ email: 'usera@example.com', role: 'MEMBER' });

    // Now User A should be able to access Org B
    const res = await request(app)
      .get(`/api/v1/organizations/${orgB_Id}/members`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .set('X-Organization-Id', orgB_Id)
      .expect(200);

    expect(res.body.data.members.length).toBe(2);
  });

  it('After removal from Org B, User A loses access', async () => {
    // Add User A to Org B
    await request(app)
      .post(`/api/v1/organizations/${orgB_Id}/members`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .set('X-Organization-Id', orgB_Id)
      .send({ email: 'usera@example.com', role: 'MEMBER' });

    // Remove User A from Org B
    await request(app)
      .delete(`/api/v1/organizations/${orgB_Id}/members/${userA.userId}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .set('X-Organization-Id', orgB_Id);

    // User A should no longer have access
    const res = await request(app)
      .get(`/api/v1/organizations/${orgB_Id}/members`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .set('X-Organization-Id', orgB_Id)
      .expect(403);

    expect(res.body.error.code).toBe('ORG_ACCESS_DENIED');
  });
});
