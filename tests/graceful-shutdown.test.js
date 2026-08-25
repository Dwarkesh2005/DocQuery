const { executeShutdown } = require('../src/utils/shutdown');

describe('Phase 10.2 — Graceful Shutdown Orchestration', () => {
  it('should execute teardown steps in correct sequential order', async () => {
    const mockServer = { close: jest.fn((cb) => cb()) };
    const mockPrisma = { $disconnect: jest.fn().mockResolvedValue() };
    const mockDisconnectRedis = jest.fn().mockResolvedValue();
    const mockCloseWorkers = jest.fn().mockResolvedValue();
    const mockCloseQueues = jest.fn().mockResolvedValue();

    const result = await executeShutdown({
      server: mockServer,
      prisma: mockPrisma,
      disconnectRedis: mockDisconnectRedis,
      closeWorkers: mockCloseWorkers,
      closeQueues: mockCloseQueues,
      signal: 'SIGTERM',
      exitProcess: false,
    });

    expect(result.success).toBe(true);
    expect(result.steps).toEqual([
      'HTTP_SERVER_CLOSED',
      'WORKERS_CLOSED',
      'QUEUES_CLOSED',
      'REDIS_CLOSED',
      'DATABASE_CLOSED',
    ]);

    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(mockCloseWorkers).toHaveBeenCalledTimes(1);
    expect(mockCloseQueues).toHaveBeenCalledTimes(1);
    expect(mockDisconnectRedis).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('should handle teardown errors gracefully without crashing', async () => {
    const mockServer = { close: jest.fn((cb) => cb()) };
    const mockCloseWorkers = jest.fn().mockRejectedValue(new Error('Worker close timeout'));

    const result = await executeShutdown({
      server: mockServer,
      closeWorkers: mockCloseWorkers,
      signal: 'SIGINT',
      exitProcess: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Worker close timeout');
  });
});
