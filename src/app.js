const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { errorHandler } = require('./middleware/error.middleware');

// Route imports
const authRoutes = require('./modules/auth/auth.routes');
const organizationRoutes = require('./modules/organizations/organization.routes');
const memberRoutes = require('./modules/members/member.routes');

// ============================================================
// Express Application
// ============================================================

const app = express();

// ── Security Middleware ──
app.use(helmet());
app.use(cors());

// ── Body Parsing with size limits ──
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ── Health Check (unversioned) ──
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    },
  });
});

// ── API v1 Routes ──
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/organizations', organizationRoutes);
app.use('/api/v1/organizations/:id/members', memberRoutes);

// ── 404 Handler ──
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist',
    },
  });
});

// ── Centralized Error Handler ──
app.use(errorHandler);

module.exports = app;
