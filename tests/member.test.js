const request = require('supertest');
const app = require('../src/app');
const { cleanDatabase, disconnectDatabase } = require('./setup');

// ============================================================
// Member Management Integration Tests
// ============================================================

let ownerToken, ownerUserId;
let memberToken, memberUserId;
let orgId;

async function registerUser(name, email) {
  const res = await request(app).post('/api/v1/auth/register').send({
    name,
    email,
    password: 'StrongPass123!',
  });
  return {
    accessToken: res.body.data.accessToken,
    userId: res.body.data.user.id,
  };
}

beforeEach(async () => {
  await cleanDatabase();

  // Owner creates an org
  const owner = await registerUser('Owner', 'owner@example.com');
  ownerToken = owner.accessToken;
  ownerUserId = owner.userId;

  const orgRes = await request(app)
    .post('/api/v1/organizations')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Test Org' });
  orgId = orgRes.body.data.organization.id;

  // Register a second user (not yet a member of Test Org)
  const member = await registerUser('Member', 'member@example.com');
  memberToken = member.accessToken;
  memberUserId = member.userId;
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

// ────────────────────────────────────────────
// List Members
// ────────────────────────────────────────────

describe('GET /api/v1/organizations/:id/members', () => {
  it('should list organization members (owner is listed)', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Organization-Id', orgId)
      .expect(200);

    expect(res.body.data.members.length).toBeGreaterThanOrEqual(1);
    const ownerMember = res.body.data.members.find((m) => m.userId === ownerUserId);
    expect(ownerMember).toBeDefined();
    expect(ownerMember.role).toBe('OWNER');
  });
});

// ────────────────────────────────────────────
// Add Member
// ────────────────────────────────────────────

describe('POST /api/v1/organizations/:id/members', () => {
  it('should add a member to the organization', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Organization-Id', orgId)
      .send({ email: 'member@example.com', role: 'MEMBER' })
      .expect(201);

    expect(res.body.data.member.email).toBe('member@example.com');
    expect(res.body.data.member.role).toBe('MEMBER');
  });

  it('should reject duplicate membership', async () => {
    await request(app)
      .post(`/api/v1/organizations/${orgId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Organization-Id', orgId)
      .send({ email: 'member@example.com', role: 'MEMBER' });

    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Organization-Id', orgId)
      .send({ email: 'member@example.com', role: 'MEMBER' })
      .expect(409);

    expect(res.body.error.code).toBe('MEMBER_ALREADY_EXISTS');
  });

  it('should reject nonexistent user email', async () => {
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Organization-Id', orgId)
      .send({ email: 'nobody@example.com', role: 'MEMBER' })
      .expect(404);

    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('should reject member attempting to add members', async () => {
    // First add the member
    await request(app)
      .post(`/api/v1/organizations/${orgId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Organization-Id', orgId)
      .send({ email: 'member@example.com', role: 'MEMBER' });

    // Register a third user
    await registerUser('Third', 'third@example.com');

    // Member tries to add a third user — should be denied
    const res = await request(app)
      .post(`/api/v1/organizations/${orgId}/members`)
      .set('Authorization', `Bearer ${memberToken}`)
      .set('X-Organization-Id', orgId)
      .send({ email: 'third@example.com', role: 'MEMBER' })
      .expect(403);

    expect(res.body.error.code).toBe('ROLE_INSUFFICIENT');
  });
});

// ────────────────────────────────────────────
// Update Member Role
// ────────────────────────────────────────────

describe('PATCH /api/v1/organizations/:id/members/:userId', () => {
  beforeEach(async () => {
    // Add member to org
    await request(app)
      .post(`/api/v1/organizations/${orgId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Organization-Id', orgId)
      .send({ email: 'member@example.com', role: 'MEMBER' });
  });

  it('should update member role', async () => {
    const res = await request(app)
      .patch(`/api/v1/organizations/${orgId}/members/${memberUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Organization-Id', orgId)
      .send({ role: 'ADMIN' })
      .expect(200);

    expect(res.body.data.member.role).toBe('ADMIN');
  });

  it('should prevent ADMIN from modifying OWNER', async () => {
    // Promote member to ADMIN
    await request(app)
      .patch(`/api/v1/organizations/${orgId}/members/${memberUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Organization-Id', orgId)
      .send({ role: 'ADMIN' });

    // ADMIN tries to change OWNER's role
    const res = await request(app)
      .patch(`/api/v1/organizations/${orgId}/members/${ownerUserId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .set('X-Organization-Id', orgId)
      .send({ role: 'MEMBER' })
      .expect(403);

    expect(res.body.error.code).toBe('ROLE_OWNER_PROTECTED');
  });

  it('should prevent demoting the last owner', async () => {
    const res = await request(app)
      .patch(`/api/v1/organizations/${orgId}/members/${ownerUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Organization-Id', orgId)
      .send({ role: 'ADMIN' })
      .expect(400);

    expect(res.body.error.code).toBe('ROLE_LAST_OWNER');
  });
});

// ────────────────────────────────────────────
// Remove Member
// ────────────────────────────────────────────

describe('DELETE /api/v1/organizations/:id/members/:userId', () => {
  beforeEach(async () => {
    await request(app)
      .post(`/api/v1/organizations/${orgId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Organization-Id', orgId)
      .send({ email: 'member@example.com', role: 'MEMBER' });
  });

  it('should remove a member', async () => {
    const res = await request(app)
      .delete(`/api/v1/organizations/${orgId}/members/${memberUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Organization-Id', orgId)
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('should prevent removing the last owner', async () => {
    const res = await request(app)
      .delete(`/api/v1/organizations/${orgId}/members/${ownerUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Organization-Id', orgId)
      .expect(400);

    expect(res.body.error.code).toBe('ROLE_LAST_OWNER');
  });

  it('should prevent ADMIN from removing OWNER', async () => {
    // Promote member to ADMIN
    await request(app)
      .patch(`/api/v1/organizations/${orgId}/members/${memberUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Organization-Id', orgId)
      .send({ role: 'ADMIN' });

    // ADMIN tries to remove OWNER
    const res = await request(app)
      .delete(`/api/v1/organizations/${orgId}/members/${ownerUserId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .set('X-Organization-Id', orgId)
      .expect(403);

    expect(res.body.error.code).toBe('ROLE_OWNER_PROTECTED');
  });
});
