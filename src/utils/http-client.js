// ============================================================
// Resilient HTTP Client
// ============================================================
// Wrapper for external API calls with:
//   - Configurable timeouts (AbortController)
//   - Exponential backoff retries on transient errors
//   - Error classification (Transient vs Permanent)
//   - Graceful degradation support
//
// Usage:
//   const { resilientFetch } = require('../utils/http-client');
//   const data = await resilientFetch('https://api.example.com/data', {
//     timeout: 5000,
//     retries: 3,
//   });

const { logger } = require('../config/logger');

// ── Error Classification ──

class ExternalServiceError extends Error {
  constructor(message, statusCode, service, isTransient = false) {
    super(message);
    this.name = 'ExternalServiceError';
    this.statusCode = statusCode;
    this.service = service;
    this.isTransient = isTransient;
  }
}

const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * Determine if an error/status is transient and retryable.
 */
function isTransientError(error) {
  if (error.name === 'AbortError') return true;         // Timeout
  if (error.code === 'ECONNREFUSED') return true;
  if (error.code === 'ECONNRESET') return true;
  if (error.code === 'ETIMEDOUT') return true;
  if (error.code === 'UND_ERR_CONNECT_TIMEOUT') return true;
  if (error.statusCode && TRANSIENT_STATUS_CODES.has(error.statusCode)) return true;
  return false;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter.
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} baseDelay - Base delay in ms (default 500)
 * @param {number} maxDelay - Max delay cap in ms (default 10000)
 * @returns {number}
 */
function getBackoffDelay(attempt, baseDelay = 500, maxDelay = 10000) {
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelay;
  return Math.min(exponential + jitter, maxDelay);
}

/**
 * Make a resilient HTTP request with retries and timeout.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {string}  [options.method='GET']
 * @param {object}  [options.headers]
 * @param {any}     [options.body]
 * @param {number}  [options.timeout=10000]    - Timeout in ms
 * @param {number}  [options.retries=3]        - Max retry attempts
 * @param {number}  [options.baseDelay=500]    - Base backoff delay
 * @param {string}  [options.service='unknown'] - Service name for logging
 * @param {any}     [options.fallback]          - Fallback value on total failure
 * @returns {Promise<any>}
 */
async function resilientFetch(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = 10000,
    retries = 3,
    baseDelay = 500,
    service = 'unknown',
    fallback = undefined,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const fetchOptions = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        signal: controller.signal,
      };

      if (body && method !== 'GET') {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const error = new ExternalServiceError(
          `${service} returned ${response.status}: ${errorBody.slice(0, 200)}`,
          response.status,
          service,
          TRANSIENT_STATUS_CODES.has(response.status),
        );

        if (!TRANSIENT_STATUS_CODES.has(response.status)) {
          // Permanent error — don't retry
          throw error;
        }

        lastError = error;

        if (attempt < retries) {
          const delay = getBackoffDelay(attempt, baseDelay);
          logger.warn({
            service,
            attempt: attempt + 1,
            maxRetries: retries,
            statusCode: response.status,
            delayMs: Math.round(delay),
          }, 'Retrying transient external API error');
          await sleep(delay);
          continue;
        }

        throw error;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await response.json();
      }
      return await response.text();

    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ExternalServiceError && !error.isTransient) {
        throw error;
      }

      lastError = error;

      if (attempt < retries && isTransientError(error)) {
        const delay = getBackoffDelay(attempt, baseDelay);
        logger.warn({
          service,
          attempt: attempt + 1,
          maxRetries: retries,
          errorMessage: error.message,
          delayMs: Math.round(delay),
        }, 'Retrying transient external API error');
        await sleep(delay);
        continue;
      }

      // All retries exhausted
      if (attempt >= retries) break;
      throw error;
    }
  }

  // All retries exhausted — use fallback if provided
  if (fallback !== undefined) {
    logger.error({
      service,
      error: lastError?.message,
    }, 'All retries exhausted, using fallback');
    return fallback;
  }

  throw lastError || new ExternalServiceError(
    `${service} request failed after ${retries} retries`,
    0,
    service,
    false,
  );
}

module.exports = {
  resilientFetch,
  ExternalServiceError,
  isTransientError,
  getBackoffDelay,
};
