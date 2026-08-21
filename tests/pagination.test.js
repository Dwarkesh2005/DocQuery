const {
  parsePaginationParams,
  buildOffsetPagination,
  buildCursorPagination,
  encodeCursor,
  decodeCursor,
} = require('../src/utils/pagination');

describe('Pagination Utility', () => {
  describe('parsePaginationParams', () => {
    it('should use default limit and page when not provided', () => {
      const result = parsePaginationParams({});
      expect(result.limit).toBe(20);
      expect(result.page).toBe(1);
    });

    it('should clamp limit to max 100', () => {
      const result = parsePaginationParams({ limit: '500' });
      expect(result.limit).toBe(100);
    });

    it('should handle cursor when provided', () => {
      const result = parsePaginationParams({ cursor: 'abc123cursor' });
      expect(result.cursor).toBe('abc123cursor');
      expect(result.page).toBeUndefined();
    });
  });

  describe('buildOffsetPagination', () => {
    it('should calculate pages and hasNextPage correctly', () => {
      const meta = buildOffsetPagination(55, 2, 20);
      expect(meta.total).toBe(55);
      expect(meta.page).toBe(2);
      expect(meta.limit).toBe(20);
      expect(meta.totalPages).toBe(3);
      expect(meta.hasNextPage).toBe(true);
      expect(meta.hasPrevPage).toBe(true);
    });

    it('should handle last page correctly', () => {
      const meta = buildOffsetPagination(55, 3, 20);
      expect(meta.hasNextPage).toBe(false);
      expect(meta.hasPrevPage).toBe(true);
    });
  });

  describe('buildCursorPagination & Cursor Encoding', () => {
    it('should encode and decode cursors accurately', () => {
      const original = '123e4567-e89b-12d3-a456-426614174000';
      const encoded = encodeCursor(original);
      expect(encoded).not.toBe(original);
      const decoded = decodeCursor(encoded);
      expect(decoded).toBe(original);
    });

    it('should build cursor pagination metadata with hasNextPage', () => {
      const items = [{ id: '1' }, { id: '2' }, { id: '3' }]; // 3 items for limit 2
      const result = buildCursorPagination(items, 2);
      expect(result.data.length).toBe(2);
      expect(result.pagination.hasNextPage).toBe(true);
      expect(result.pagination.nextCursor).toBeDefined();
    });
  });
});
