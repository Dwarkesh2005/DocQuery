const http = require('http');
const app = require('../src/app');

// ============================================================
// Load & Performance Benchmark Suite
// Phase 10: Production Deployment, SRE & Reliability
// ============================================================
// Measures throughput (RPS), error rates, and latency percentiles (p50, p95, p99).

async function runLoadBenchmark({
  endpoint = '/health/live',
  totalRequests = 200,
  concurrency = 10,
} = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port;
      const latencies = [];
      let successCount = 0;
      let errorCount = 0;
      const startTime = Date.now();

      let active = 0;
      let completed = 0;
      let sent = 0;

      function dispatch() {
        while (active < concurrency && sent < totalRequests) {
          sent++;
          active++;
          const reqStart = process.hrtime.bigint();

          const req = http.get(`http://localhost:${port}${endpoint}`, (res) => {
            res.resume();
            res.on('end', () => {
              const reqEnd = process.hrtime.bigint();
              const durationMs = Number(reqEnd - reqStart) / 1e6;
              latencies.push(durationMs);

              if (res.statusCode >= 200 && res.statusCode < 400) {
                successCount++;
              } else {
                errorCount++;
              }

              active--;
              completed++;

              if (completed === totalRequests) {
                server.close(() => {
                  const totalDurationMs = Date.now() - startTime;
                  latencies.sort((a, b) => a - b);

                  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
                  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
                  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
                  const rps = Number(((totalRequests / totalDurationMs) * 1000).toFixed(2));

                  resolve({
                    endpoint,
                    totalRequests,
                    concurrency,
                    successCount,
                    errorCount,
                    durationMs: totalDurationMs,
                    throughputRps: rps,
                    p50Ms: Number(p50.toFixed(2)),
                    p95Ms: Number(p95.toFixed(2)),
                    p99Ms: Number(p99.toFixed(2)),
                  });
                });
              } else {
                dispatch();
              }
            });
          });

          req.on('error', () => {
            errorCount++;
            active--;
            completed++;
            if (completed === totalRequests) {
              server.close(() => resolve({ error: 'Some requests failed', errorCount }));
            } else {
              dispatch();
            }
          });
        }
      }

      dispatch();
    });
  });
}

if (require.main === module) {
  runLoadBenchmark()
    .then((results) => {
      console.log('⚡ Benchmark Results:', JSON.stringify(results, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Benchmark Error:', err);
      process.exit(1);
    });
}

module.exports = { runLoadBenchmark };
