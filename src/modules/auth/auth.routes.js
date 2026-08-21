const { Router } = require('express');
const authController = require('./auth.controller');
const { validate } = require('../../middleware/validate.middleware');
const { authenticate } = require('../../middleware/auth.middleware');
const { registerSchema, loginSchema, refreshSchema } = require('./auth.schema');

const router = Router();

// ============================================================
// Auth Routes — /api/v1/auth
// ============================================================

// Public routes
router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/refresh', validate(refreshSchema), authController.refresh);

// Protected routes
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);

module.exports = router;
