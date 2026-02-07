/**
 * Regression guard: ensure event data persists across restarts.
 * Run with: npx ts-node src/__tests__/event.persistence.regression.test.ts
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
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any }> {
  const payload = body ? JSON.stringify(body) : undefined;
  const target = new URL(urlPath, baseUrl);

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };
  if (payload) {
    requestHeaders['Content-Type'] = 'application/json';
    requestHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method,
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        headers: requestHeaders,
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
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer(port: number, adminBypassToken: string): ChildProcessWithoutNullStreams {
  const serverPath = path.join('src', 'server.ts');
  const child = spawn('npx', ['ts-node', serverPath], {
    cwd: path.join(__dirname, '..', '..'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      ADMIN_BYPASS_TOKEN: adminBypassToken,
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

function stopServer(child: ChildProcessWithoutNullStreams): void {
  if (!child.killed) {
    child.kill();
  }
}

async function runTests(): Promise<void> {
  console.log('\n📋 Event Persistence Regression Tests\n');

  const dataFile = path.join(__dirname, '..', '..', 'data.json');
  const backupPath = `${dataFile}.bak-${Date.now()}`;
  const hasExisting = fs.existsSync(dataFile);

  if (hasExisting) {
    fs.copyFileSync(dataFile, backupPath);
  }

  const adminBypassToken = 'TEST_ADMIN_BYPASS';
  const port = await getAvailablePort();
  const baseUrl = `http://localhost:${port}`;

  const runId = Date.now();
  const coverImageUrl = `https://example.com/cover-${runId}.jpg`;
  const schemaImageUrl = `https://example.com/schema-${runId}.jpg`;
  const title = `Persisted Event ${runId}`;
  const description = 'Event created for persistence regression test';
  const date = new Date().toISOString();

  let eventId = '';

  let child = startServer(port, adminBypassToken);
  let childExitCode: number | null = null;
  child.on('exit', (code) => {
    childExitCode = code;
  });

  process.on('exit', () => stopServer(child));
  process.on('SIGINT', () => {
    stopServer(child);
    process.exit(1);
  });

  try {
    await waitForServer(baseUrl);

    await runTest('Create event with images', async () => {
      const res = await requestJson(
        baseUrl,
        'POST',
        '/admin/events',
        {
          title,
          description,
          date,
          coverImageUrl,
          schemaImageUrl,
        },
        { Authorization: `Bearer ${adminBypassToken}` },
      );

      assertEquals(res.status, 201, `Expected 201, got ${res.status}`);
      assert(res.json?.id, 'Response should include event id');
      eventId = res.json.id;
    });

    await runTest('Add tables to event', async () => {
      const tables = [
        {
          id: `tbl-${runId}-1`,
          number: 1,
          seatsTotal: 6,
          seatsAvailable: 6,
          centerX: 30,
          centerY: 70,
          shape: 'round',
        },
        {
          id: `tbl-${runId}-2`,
          number: 2,
          seatsTotal: 8,
          seatsAvailable: 8,
          centerX: 60,
          centerY: 40,
          shape: 'round',
        },
      ];

      const res = await requestJson(
        baseUrl,
        'PUT',
        `/admin/events/${eventId}`,
        {
          title,
          description,
          date,
          coverImageUrl,
          schemaImageUrl,
          tables,
        },
        { Authorization: `Bearer ${adminBypassToken}` },
      );

      assertEquals(res.status, 200, `Expected 200, got ${res.status}`);
    });

    await runTest('Restart backend', async () => {
      stopServer(child);
      await wait(300);
      child = startServer(port, adminBypassToken);
      await waitForServer(baseUrl);
    });

    await runTest('Fetch event after restart and verify persistence', async () => {
      const res = await requestJson(baseUrl, 'GET', `/events/${eventId}`);
      assertEquals(res.status, 200, `Expected 200, got ${res.status}`);

      const event = res.json;
      assert(event, 'Event response should not be empty');
      assertEquals(event.title, title, 'Event title should persist');
      assertEquals(event.description, description, 'Event description should persist');
      assertEquals(event.imageUrl, coverImageUrl, 'coverImageUrl should persist as imageUrl');
      assertEquals(event.schemaImageUrl, schemaImageUrl, 'schemaImageUrl should persist');

      const tables = Array.isArray(event.tables) ? event.tables : [];
      assertEquals(tables.length, 2, 'Tables should be persisted');
      const tableById = new Map<string, any>(tables.map((t: any) => [t.id, t]));
      const first = tableById.get(`tbl-${runId}-1`);
      const second = tableById.get(`tbl-${runId}-2`);

      assert(first, 'First table should exist');
      assertEquals(first.seatsTotal, 6, 'First table seatsTotal');
      assertEquals(first.seatsAvailable, 6, 'First table seatsAvailable');
      assertEquals(first.centerX, 30, 'First table centerX');
      assertEquals(first.centerY, 70, 'First table centerY');

      assert(second, 'Second table should exist');
      assertEquals(second.seatsTotal, 8, 'Second table seatsTotal');
      assertEquals(second.seatsAvailable, 8, 'Second table seatsAvailable');
      assertEquals(second.centerX, 60, 'Second table centerX');
      assertEquals(second.centerY, 40, 'Second table centerY');
    });
  } finally {
    stopServer(child);
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
