// ============================================================
// Pagination Utilities
// ============================================================
// Supports both cursor-based and offset-based pagination.
// Cursor-based is preferred for high-growth datasets.
// Offset-based works well for smaller, simpler collections.

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parse pagination params from request query.
 * @param {object} query — req.query
 * @returns {{ limit: number, page?: number, cursor?: string }}
 */
function parsePaginationParams(query) {
  let limit = parseInt(query.limit, 10);
  if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const result = { limit };

  if (query.cursor) {
    result.cursor = query.cursor;
  } else {
    let page = parseInt(query.page, 10);
    if (isNaN(page) || page < 1) page = 1;
    result.page = page;
  }

  return result;
}

/**
 * Build offset-based pagination metadata.
 * @param {number} total - Total number of records
 * @param {number} page  - Current page (1-indexed)
 * @param {number} limit - Records per page
 * @returns {object}
 */
function buildOffsetPagination(total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

/**
 * Build cursor-based pagination metadata.
 * @param {Array}  items    - Fetched items (may include +1 extra for hasNextPage detection)
 * @param {number} limit    - Requested limit
 * @param {string} cursorField - Field to use as cursor (default: 'id')
 * @returns {{ data: Array, pagination: object }}
 */
function buildCursorPagination(items, limit, cursorField = 'id') {
  const hasNextPage = items.length > limit;
  const data = hasNextPage ? items.slice(0, limit) : items;
  const nextCursor = hasNextPage && data.length > 0
    ? encodeCursor(data[data.length - 1][cursorField])
    : null;

  return {
    data,
    pagination: {
      hasNextPage,
      nextCursor,
      limit,
    },
  };
}

/**
 * Encode a cursor value to base64 for opaque transmission.
 * @param {string} value
 * @returns {string}
 */
function encodeCursor(value) {
  return Buffer.from(String(value)).toString('base64url');
}

/**
 * Decode an opaque base64 cursor back to the original value.
 * @param {string} cursor
 * @returns {string}
 */
function decodeCursor(cursor) {
  try {
    return Buffer.from(cursor, 'base64url').toString('utf-8');
  } catch {
    return null;
  }
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parsePaginationParams,
  buildOffsetPagination,
  buildCursorPagination,
  encodeCursor,
  decodeCursor,
};
