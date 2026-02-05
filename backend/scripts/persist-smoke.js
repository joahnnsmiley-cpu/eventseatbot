const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DATA_FILE = path.join(__dirname, '..', 'data.json');

function readDb() {
  if (!fs.existsSync(DATA_FILE)) return { events: [], bookings: [], admins: [] };
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

function writeDb(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

(function main() {
  console.log('Running persistence smoke test...');

  const dbBefore = readDb();

  const evt = {
    id: 'smoke-test-event',
    title: 'Smoke Test Event',
    description: 'Auto-generated event for persistence smoke test',
    date: new Date().toISOString(),
    schemaImageUrl: 'https://example.com/schema.png',
    imageUrl: 'https://example.com/schema.png',
    paymentPhone: '70000000000',
    maxSeatsPerBooking: 4,
    tables: [
      {
        id: 'tbl-smoke-1',
        number: 1,
        seatsTotal: 6,
        seatsAvailable: 6,
        centerX: 50,
        centerY: 50,
        shape: 'round'
      }
    ]
  };

  // upsert
  const idx = dbBefore.events.findIndex(e => e.id === evt.id);
  if (idx >= 0) dbBefore.events[idx] = evt; else dbBefore.events.push(evt);

  writeDb(dbBefore);

  // simulate storage reload via child process that reads file and prints JSON
  const child = spawnSync(process.execPath, ['-e', `console.log(JSON.stringify(require('./data.json')))`], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });

  if (child.error) {
    console.error('Failed to spawn child process:', child.error);
    process.exit(1);
  }

  if (child.status !== 0) {
    console.error('Child process exited with non-zero status', child.status);
    console.error('stderr:', child.stderr);
    process.exit(1);
  }

  let dbAfter;
  try {
    dbAfter = JSON.parse(child.stdout);
  } catch (err) {
    console.error('Failed to parse child output:', err);
    process.exit(1);
  }

  const foundBefore = dbBefore.events.find(e => e.id === evt.id);
  const foundAfter = dbAfter.events.find(e => e.id === evt.id);

  if (!foundAfter) {
    console.error('Event not found after reload');
    process.exit(1);
  }

  if (!deepEqual(foundBefore, foundAfter)) {
    console.error('Event mismatch after reload');
    console.error('Before:', JSON.stringify(foundBefore, null, 2));
    console.error('After: ', JSON.stringify(foundAfter, null, 2));
    process.exit(1);
  }

  console.log('Persistence smoke test passed');
  process.exit(0);
})();
