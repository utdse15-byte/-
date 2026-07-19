'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { WebSocket } = require('ws');

const ROOT = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(predicate, timeout = 12000, label = '条件') {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch {}
    await sleep(50);
  }
  throw new Error(`等待${label}超时`);
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-phone-history-server-'));
  const profile = path.join(root, 'Default');
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(root, 'Local State'), JSON.stringify({ profile: { last_used: 'Default' } }));
  const db = new DatabaseSync(path.join(profile, 'History'));
  const chromeTime = (ms) => Math.round((ms + 11644473600000) * 1000);
  const now = Date.now();
  db.exec(`
    CREATE TABLE urls(
      id INTEGER PRIMARY KEY, url LONGVARCHAR, title LONGVARCHAR,
      visit_count INTEGER DEFAULT 0 NOT NULL, typed_count INTEGER DEFAULT 0 NOT NULL,
      last_visit_time INTEGER NOT NULL, hidden INTEGER DEFAULT 0 NOT NULL
    );
    CREATE TABLE visits(
      id INTEGER PRIMARY KEY, url INTEGER NOT NULL, visit_time INTEGER NOT NULL,
      from_visit INTEGER, transition INTEGER DEFAULT 0 NOT NULL
    );
  `);
  db.prepare('INSERT INTO urls VALUES(?,?,?,?,?,?,?)').run(1, 'https://history.test/new', 'Newest', 1, 1, chromeTime(now), 0);
  db.prepare('INSERT INTO urls VALUES(?,?,?,?,?,?,?)').run(2, 'https://history.test/old', 'Older', 1, 0, chromeTime(now - 5000), 0);
  db.prepare('INSERT INTO visits VALUES(?,?,?,?,?)').run(1, 1, chromeTime(now), 0, 1);
  db.prepare('INSERT INTO visits VALUES(?,?,?,?,?)').run(2, 2, chromeTime(now - 5000), 0, 1);
  db.close();

  const port = await freePort();
  const token = 'browser-history-integration-token';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      PHONE_TOKEN: token,
      IDLE_SHARPEN_ENABLED: '0',
      EDGE_USER_DATA_DIR: root,
      EDGE_PROFILE_DIRECTORY: 'Default',
      CDP_BROWSER_WS: 'ws://127.0.0.1:1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  let ws;
  try {
    await waitFor(async () => {
      try { return (await fetch(`http://127.0.0.1:${port}/health`)).ok; } catch { return false; }
    }, 12000, '控制器启动');

    ws = new WebSocket(`ws://127.0.0.1:${port}/control?token=${encodeURIComponent(token)}&clientId=history-integration`);
    const messages = [];
    ws.on('message', (raw, binary) => {
      if (binary) return;
      try { messages.push(JSON.parse(raw.toString())); } catch {}
    });
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    ws.send(JSON.stringify({ type: 'browserHistory', requestId: 'history-1', limit: 1, offset: 0, query: '' }));
    const first = await waitFor(() => messages.find((item) => item.type === 'reply' && item.requestId === 'history-1'), 8000, '浏览历史回复');
    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.result.profileDirectory, 'Default');
    assert.strictEqual(first.result.items.length, 1);
    assert.strictEqual(first.result.items[0].title, 'Newest');
    assert.strictEqual(first.result.hasMore, true);

    ws.send(JSON.stringify({ type: 'browserHistory', requestId: 'history-search', limit: 10, query: 'Older' }));
    const searched = await waitFor(() => messages.find((item) => item.type === 'reply' && item.requestId === 'history-search'), 8000, '浏览历史搜索回复');
    assert.strictEqual(searched.ok, true);
    assert.deepStrictEqual(searched.result.items.map((item) => item.title), ['Older']);

    console.log('browser-history-integration.test.js: OK');
  } catch (error) {
    console.error(output.slice(-5000));
    throw error;
  } finally {
    try { ws?.close(); } catch {}
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      sleep(1500).then(() => child.kill('SIGKILL'))
    ]).catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
