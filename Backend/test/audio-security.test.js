const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const EventEmitter = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const http = require('node:http');
const path = require('node:path');

process.env.JWT_SECRET = 'test-only-jwt-signing-key-at-least-32-bytes-long';
process.env.AUDIO_MAX_CONCURRENT_UPLOADS = '4';
process.env.AUDIO_MAX_CONCURRENT_FFMPEG = '2';
process.env.AUDIO_ANALYSIS_TIMEOUT_MS = '1000';

const pool = {
  async query() {
    return { rowCount: 1, rows: [{ id: 'audio-user', email: 'audio@example.test', is_suspended: false }] };
  },
};
const dbPath = require.resolve('../src/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };

let spawnMode = 'normal';
const children = [];
class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.pid = children.length + 1000;
    this.killed = false;
    this.stdin = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    this.stderr = new PassThrough();
  }

  kill(signal) {
    this.killed = true;
    this.killSignal = signal;
    setTimeout(() => this.emit('close', null, signal), 10);
    return true;
  }

  finish(exitCode = 0, stderr = 'mean_volume: -30.0 dB\nmax_volume: -2.0 dB\n') {
    if (stderr) this.stderr.write(stderr);
    this.emit('close', exitCode, null);
  }
}
require('child_process').spawn = () => {
  if (spawnMode === 'throw') throw new Error('internal spawn detail');
  const child = new FakeChild();
  children.push(child);
  if (spawnMode === 'async-error') {
    process.nextTick(() => child.emit('error', new Error('ffmpeg executable unavailable')));
  }
  return child;
};

const jwt = require('jsonwebtoken');
const token = jwt.sign({ sub: 'audio-user' }, process.env.JWT_SECRET);
const express = require('express');
const audioRoutes = require('../src/routes/audio');
const app = express();
app.use('/api/audio', audioRoutes);
const server = app.listen(0, '127.0.0.1');
const audioUrl = () => `http://127.0.0.1:${server.address().port}/api/audio/analyze`;
function submit({ signal, authorization = `Bearer ${token}`, payload = Buffer.from('mock webm') } = {}) {
  const form = new FormData();
  form.append('clip', new Blob([payload]), 'clip.webm');
  return fetch(audioUrl(), {
    method: 'POST', body: form, signal,
    headers: authorization ? { authorization } : {},
  });
}

function startPartialUpload() {
  const boundary = `soundscout-${Math.random().toString(16).slice(2)}`;
  const request = http.request({
    hostname: '127.0.0.1',
    port: server.address().port,
    path: '/api/audio/analyze',
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'transfer-encoding': 'chunked',
    },
  });
  request.on('error', () => {});
  request.write('--' + boundary + '\r\nContent-Disposition: form-data; name="clip"; filename="partial.webm"\r\nContent-Type: audio/webm\r\n\r\n');
  request.write(Buffer.alloc(64 * 1024));
  return request;
}
async function waitForChildren(count) {
  const deadline = Date.now() + 3000;
  while (children.length < count && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.ok(children.length >= count, `expected ${count} spawned FFmpeg children`);
}
async function successfulAnalysis() {
  const base = children.length;
  const responsePromise = submit();
  await waitForChildren(base + 1);
  children[base].finish();
  return responsePromise;
}

before(() => new Promise(resolve => server.once('listening', resolve)));
after(() => new Promise(resolve => server.close(resolve)));

test('audio endpoint requires authentication and returns expected analysis fields', async () => {
  assert.equal((await submit({ authorization: null })).status, 401);
  const response = await successfulAnalysis();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mean_volume_dbfs, -30);
  assert.equal(body.max_volume_dbfs, -2);
  assert.equal(body.suggested_score, 3);
});

test('oversized multipart uploads are rejected before FFmpeg starts', async () => {
  const before = children.length;
  const response = await submit({ payload: Buffer.alloc(15 * 1024 * 1024 + 1) });
  assert.equal(response.status, 413);
  assert.equal(children.length, before);
});

test('aborted multipart uploads release upload capacity', async () => {
  const abandoned = Array.from({ length: 4 }, startPartialUpload);
  await new Promise(resolve => setTimeout(resolve, 50));
  const rejected = await submit();
  assert.equal(rejected.status, 429);

  for (const request of abandoned) request.destroy();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal((await successfulAnalysis()).status, 200);
});

test('FFmpeg capacity rejects excess work without an unbounded queue', async () => {
  const base = children.length;
  const first = submit();
  const second = submit();
  await waitForChildren(base + 2);
  const rejected = await submit();
  assert.equal(rejected.status, 429);
  assert.equal(Number(rejected.headers.get('retry-after')), 1);

  children[base].finish();
  children[base + 1].finish();
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 200);
  assert.equal((await successfulAnalysis()).status, 200);
});

test('invalid audio and spawn failures return generic errors and release capacity', async () => {
  const base = children.length;
  const invalidPromise = submit();
  await waitForChildren(base + 1);
  children[base].finish(1, 'decoder internal details');
  const invalid = await invalidPromise;
  assert.equal(invalid.status, 400);
  assert.doesNotMatch(await invalid.text(), /decoder internal details/);

  spawnMode = 'throw';
  try {
    const failure = await submit();
    assert.equal(failure.status, 503);
    assert.doesNotMatch(await failure.text(), /internal spawn detail/);
  } finally {
    spawnMode = 'normal';
  }
  assert.equal((await successfulAnalysis()).status, 200);
});

test('child-process errors and oversized stderr release analysis capacity', async () => {
  spawnMode = 'async-error';
  try {
    const failed = await submit();
    assert.equal(failed.status, 503);
    assert.doesNotMatch(await failed.text(), /ffmpeg executable unavailable/);
  } finally {
    spawnMode = 'normal';
  }

  const base = children.length;
  const overflow = submit();
  await waitForChildren(base + 1);
  children[base].stderr.write(Buffer.alloc(1024 * 1024 + 1));
  assert.equal((await overflow).status, 400);
  assert.equal(children[base].killSignal, 'SIGKILL');
  assert.equal((await successfulAnalysis()).status, 200);
});

test('analysis timeout and client disconnect kill FFmpeg and release slots', async () => {
  const timeoutBase = children.length;
  const timedOut = submit();
  await waitForChildren(timeoutBase + 1);
  const timeoutResponse = await timedOut;
  assert.equal(timeoutResponse.status, 504);
  assert.equal(children[timeoutBase].killSignal, 'SIGKILL');

  const disconnectBase = children.length;
  const controller = new AbortController();
  const abandoned = submit({ signal: controller.signal });
  await waitForChildren(disconnectBase + 1);
  controller.abort();
  await abandoned.catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(children[disconnectBase].killSignal, 'SIGKILL');
  assert.equal((await successfulAnalysis()).status, 200);
});

test('input-stream errors terminate FFmpeg and free its slot', async () => {
  const fs = require('node:fs');
  const originalCreateReadStream = fs.createReadStream;
  fs.createReadStream = () => {
    const stream = new PassThrough();
    process.nextTick(() => stream.emit('error', new Error('temporary file read failure')));
    return stream;
  };
  try {
    const base = children.length;
    const failed = submit();
    await waitForChildren(base + 1);
    assert.equal((await failed).status, 500);
    assert.equal(children[base].killSignal, 'SIGKILL');
  } finally {
    fs.createReadStream = originalCreateReadStream;
  }
  assert.equal((await successfulAnalysis()).status, 200);
});

test('FFmpeg stdin EPIPE is treated as invalid input rather than an internal error', async () => {
  const base = children.length;
  const response = submit();
  await waitForChildren(base + 1);
  const epipe = Object.assign(new Error('broken pipe'), { code: 'EPIPE' });
  children[base].stdin.emit('error', epipe);
  assert.equal((await response).status, 400);
  assert.equal((await successfulAnalysis()).status, 200);
});
