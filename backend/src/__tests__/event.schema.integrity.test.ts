/**
 * Schema integrity test for event and table fields.
 * Run with: npx ts-node src/__tests__/event.schema.integrity.test.ts
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  return fn()
    .then(() => {
      results.push({ name, passed: true });
      console.log(`✓ ${name}`);
    })
    .catch((error) => {
      results.push({
        name,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(`✗ ${name}`);
      if (error instanceof Error) {
        console.log(`  Error: ${error.message}`);
      }
    });
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Failed to acquire port'));
        return;
      }
      const port = addr.port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(
  baseUrl: string,
  method: string,
  urlPath: string,
): Promise<{ status: number; json: any }> {
  const target = new URL(urlPath, baseUrl);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method,
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        headers: { Accept: 'application/json' },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed: any = null;
          if (data.length > 0) {
            try {
              parsed = JSON.parse(data);
            } catch (err) {
              return reject(new Error(`Failed to parse JSON response: ${data}`));
            }
          }
          resolve({ status: res.statusCode || 0, json: parsed });
        });
      },
    );

    req.on('error', reject);
    req.end();
  });
}

function startServer(port: number): ChildProcessWithoutNullStreams {
  const serverPath = path.join('src', 'server.ts');
  const child = spawn('npx', ['ts-node', serverPath], {
    cwd: path.join(__dirname, '..', '..'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
    },
    shell: true,
  });

  return child;
}

async function waitForServer(baseUrl: string, attempts = 30): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await requestJson(baseUrl, 'GET', '/events');
      if (res.status === 200) return;
    } catch {
      // ignore
    }
    await wait(250);
  }
  throw new Error('Server did not become ready in time');
}

async function runTests(): Promise<void> {
  console.log('\n📋 Event Schema Integrity Tests\n');

  const dataFile = path.join(__dirname, '..', '..', 'data.json');
  const backupPath = `${dataFile}.bak-${Date.now()}`;
  const hasExisting = fs.existsSync(dataFile);

  if (hasExisting) {
    fs.copyFileSync(dataFile, backupPath);
  }

  const runId = Date.now();
  const coverImageUrl = `https://example.com/cover-${runId}.jpg`;
  const schemaImageUrl = `https://example.com/schema-${runId}.jpg`;

  const dbSeed = {
    events: [
      {
        id: `pub-${runId}`,
        title: 'Schema Integrity Event',
        description: 'Event for schema integrity test',
        date: new Date().toISOString(),
        imageUrl: coverImageUrl,
        schemaImageUrl,
        paymentPhone: '70000000000',
        maxSeatsPerBooking: 4,
        status: 'published',
        tables: [
          {
            id: `tbl-${runId}-1`,
            number: 1,
            seatsTotal: 6,
            seatsAvailable: 6,
            centerX: 20,
            centerY: 80,
            shape: 'round',
          },
        ],
      },
    ],
    bookings: [],
    admins: [],
  };

  fs.writeFileSync(dataFile, JSON.stringify(dbSeed, null, 2), 'utf-8');

  const port = await getAvailablePort();
  const baseUrl = `http://localhost:${port}`;
  const child = startServer(port);

  let childExitCode: number | null = null;
  child.on('exit', (code) => {
    childExitCode = code;
  });

  const stopServer = () => {
    if (!child.killed) {
      child.kill();
    }
  };

  process.on('exit', stopServer);
  process.on('SIGINT', () => {
    stopServer();
    process.exit(1);
  });

  try {
    await waitForServer(baseUrl);

    await runTest('Public event schema includes required fields', async () => {
      const res = await requestJson(baseUrl, 'GET', '/public/events');
      assertEquals(res.status, 200, `Expected 200, got ${res.status}`);

      const events = Array.isArray(res.json) ? res.json : [];
      assert(events.length > 0, 'Expected at least one published event');

      events.forEach((event: any, idx: number) => {
        assert(
          Object.prototype.hasOwnProperty.call(event, 'coverImageUrl'),
          `events[${idx}] missing coverImageUrl`,
        );
        assert(
          Object.prototype.hasOwnProperty.call(event, 'schemaImageUrl'),
          `events[${idx}] missing schemaImageUrl`,
        );
        assert(
          event.coverImageUrl !== null && typeof event.coverImageUrl !== 'undefined',
          `events[${idx}].coverImageUrl is null/undefined`,
        );
        assert(
          event.schemaImageUrl !== null && typeof event.schemaImageUrl !== 'undefined',
          `events[${idx}].schemaImageUrl is null/undefined`,
        );

        const tables = Array.isArray(event.tables) ? event.tables : [];
        assert(tables.length > 0, `events[${idx}] has no tables`);
        tables.forEach((table: any, tidx: number) => {
          assert(
            Object.prototype.hasOwnProperty.call(table, 'seatsTotal'),
            `events[${idx}].tables[${tidx}] missing seatsTotal`,
          );
          assert(
            Object.prototype.hasOwnProperty.call(table, 'seatsAvailable'),
            `events[${idx}].tables[${tidx}] missing seatsAvailable`,
          );
          assert(
            Object.prototype.hasOwnProperty.call(table, 'centerX'),
            `events[${idx}].tables[${tidx}] missing centerX`,
          );
          assert(
            Object.prototype.hasOwnProperty.call(table, 'centerY'),
            `events[${idx}].tables[${tidx}] missing centerY`,
          );
        });
      });
    });
  } finally {
    stopServer();
    await wait(200);
    if (childExitCode && childExitCode !== 0) {
      console.log(`Server exited with code ${childExitCode}`);
    }

    try {
      if (hasExisting && fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, dataFile);
        fs.unlinkSync(backupPath);
      } else if (!hasExisting && fs.existsSync(dataFile)) {
        fs.unlinkSync(dataFile);
      }
    } catch (err) {
      console.warn('Failed to restore data.json after test:', err);
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log('\n' + '='.repeat(50));
  console.log(`Tests: ${passed}/${total} passed`);
  if (failed > 0) {
    console.log(`\n❌ Failed tests:`);
    results.filter((r) => !r.passed).forEach((r) => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
