const request = require('supertest');
const app = require('../src/app');
const { cleanDatabase, disconnectDatabase } = require('./setup');

// ============================================================
// Auth Integration Tests
// ============================================================

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

const validUser = {
  name: 'John Doe',
  email: 'john@example.com',
  password: 'StrongPass123!',
};

// ────────────────────────────────────────────
// Registration
// ────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  it('should register a new user successfully', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(validUser)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toHaveProperty('id');
    expect(res.body.data.user.email).toBe(validUser.email);
    expect(res.body.data.user.name).toBe(validUser.name);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    // Must never expose password hash
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  it('should create default organization on registration', async () => {
    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send(validUser)
      .expect(201);

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registerRes.body.data.accessToken}`)
      .expect(200);

    expect(meRes.body.data.user.organizations).toHaveLength(1);
    expect(meRes.body.data.user.organizations[0].name).toBe("John Doe's Workspace");
    expect(meRes.body.data.user.organizations[0].role).toBe('OWNER');
  });

  it('should reject duplicate email registration', async () => {
    await request(app).post('/api/v1/auth/register').send(validUser);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(validUser)
      .expect(409);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTH_EMAIL_EXISTS');
  });

  it('should reject invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validUser, email: 'not-an-email' })
      .expect(422);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject short password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validUser, password: '123' })
      .expect(422);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should normalize email to lowercase', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validUser, email: 'JOHN@EXAMPLE.COM' })
      .expect(201);

    expect(res.body.data.user.email).toBe('john@example.com');
  });
});

// ────────────────────────────────────────────
// Login
// ────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/v1/auth/register').send(validUser);
  });

  it('should login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: validUser.password })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe(validUser.email);
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('should reject wrong password with generic error', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: 'wrong-password' })
      .expect(401);

    expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('should reject nonexistent user with same generic error', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' })
      .expect(401);

    // Same error code — does not reveal whether email exists
    expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(res.body.error.message).toBe('Invalid email or password');
  });
});

// ────────────────────────────────────────────
// Refresh Token
// ────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  let refreshToken;

  beforeEach(async () => {
    const res = await request(app).post('/api/v1/auth/register').send(validUser);
    refreshToken = res.body.data.refreshToken;
  });

  it('should return a new access token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('should reject invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'invalid-token' })
      .expect(401);

    expect(res.body.error.code).toBe('AUTH_INVALID_REFRESH_TOKEN');
  });
});

// ────────────────────────────────────────────
// Logout
// ────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {
  let accessToken, refreshToken;

  beforeEach(async () => {
    const res = await request(app).post('/api/v1/auth/register').send(validUser);
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('should logout successfully', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('should invalidate refresh token after logout', async () => {
    // Logout
    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    // Try to use the revoked refresh token
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);

    expect(res.body.error.code).toBe('AUTH_REFRESH_TOKEN_REVOKED');
  });
});

// ────────────────────────────────────────────
// Current User
// ────────────────────────────────────────────

describe('GET /api/v1/auth/me', () => {
  let accessToken;

  beforeEach(async () => {
    const res = await request(app).post('/api/v1/auth/register').send(validUser);
    accessToken = res.body.data.accessToken;
  });

  it('should return current user with organizations', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.user.id).toBeDefined();
    expect(res.body.data.user.email).toBe(validUser.email);
    expect(res.body.data.user.organizations).toBeDefined();
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('should reject request without auth token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .expect(401);

    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('should reject invalid auth token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    expect(res.body.success).toBe(false);
  });
});
