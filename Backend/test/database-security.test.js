const assert = require('node:assert/strict');
const { test } = require('node:test');
const EventEmitter = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function loadDbWithConfig(environment) {
  const originalEnvironment = {};
  for (const key of ['DATABASE_URL', 'DATABASE_SSL', 'DATABASE_SSL_CA']) {
    originalEnvironment[key] = process.env[key];
    if (environment[key] === undefined) delete process.env[key];
    else process.env[key] = environment[key];
  }
  const pgPath = require.resolve('pg');
  const dbPath = require.resolve('../src/db');
  const originalPg = require.cache[pgPath];
  const originalDb = require.cache[dbPath];
  let capturedConfig;
  class FakePool extends EventEmitter {
    constructor(config) {
      super();
      capturedConfig = config;
    }
  }
  require.cache[pgPath] = {
    id: pgPath, filename: pgPath, loaded: true, exports: { Pool: FakePool },
  };
  delete require.cache[dbPath];
  try {
    const pool = require('../src/db');
    return { pool, config: capturedConfig };
  } finally {
    if (originalPg) require.cache[pgPath] = originalPg;
    else delete require.cache[pgPath];
    if (originalDb) require.cache[dbPath] = originalDb;
    else delete require.cache[dbPath];
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('database TLS verifies certificates and ignores URL flags that could weaken verification', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'soundscout-ca-'));
  const caPath = path.join(directory, 'custom-ca.pem');
  fs.writeFileSync(caPath, 'test CA contents');
  try {
    const { config } = loadDbWithConfig({
      DATABASE_URL: 'postgresql://user:pass@db.example.test:5432/app?sslmode=require&sslrootcert=ignored&application_name=soundscout',
      DATABASE_SSL: 'true',
      DATABASE_SSL_CA: caPath,
    });
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.equal(config.ssl.ca, 'test CA contents');
    const parsed = new URL(config.connectionString);
    assert.equal(parsed.searchParams.has('sslmode'), false);
    assert.equal(parsed.searchParams.has('sslrootcert'), false);
    assert.equal(parsed.searchParams.get('application_name'), 'soundscout');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('database TLS is enabled by default and can be explicitly disabled for local development', () => {
  const defaults = loadDbWithConfig({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
  });
  assert.equal(defaults.config.ssl.rejectUnauthorized, true);

  const local = loadDbWithConfig({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/app?sslmode=disable',
    DATABASE_SSL: 'false',
  });
  assert.equal(local.config.ssl, false);
  assert.equal(new URL(local.config.connectionString).searchParams.has('sslmode'), false);
});

test('idle pool failures are handled without exposing connection details', () => {
  const { pool } = loadDbWithConfig({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
  });
  const originalError = console.error;
  const messages = [];
  console.error = message => messages.push(message);
  try {
    assert.doesNotThrow(() => pool.emit('error', new Error('private database detail')));
    assert.equal(messages.length, 1);
    assert.doesNotMatch(messages[0], /private database detail/);
  } finally {
    console.error = originalError;
  }
});
