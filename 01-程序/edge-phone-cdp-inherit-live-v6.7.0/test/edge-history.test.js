'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { EdgeHistoryService, chromiumTimeToUnixMs, escapeLike } = require('../lib/edge-history');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-phone-history-test-'));
try {
  const profile = path.join(root, 'Default');
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(root, 'Local State'), JSON.stringify({ profile: { last_used: 'Default' } }));
  const historyPath = path.join(profile, 'History');
  const db = new DatabaseSync(historyPath);
  db.exec(`
    CREATE TABLE urls(
      id INTEGER PRIMARY KEY,
      url LONGVARCHAR,
      title LONGVARCHAR,
      visit_count INTEGER DEFAULT 0 NOT NULL,
      typed_count INTEGER DEFAULT 0 NOT NULL,
      last_visit_time INTEGER NOT NULL,
      hidden INTEGER DEFAULT 0 NOT NULL
    );
    CREATE TABLE visits(
      id INTEGER PRIMARY KEY,
      url INTEGER NOT NULL,
      visit_time INTEGER NOT NULL,
      from_visit INTEGER,
      transition INTEGER DEFAULT 0 NOT NULL
    );
  `);
  const chromeEpochUs = (unixMs) => Math.round((unixMs + 11644473600000) * 1000);
  const now = Date.now();
  const insertUrl = db.prepare('INSERT INTO urls(id,url,title,visit_count,typed_count,last_visit_time,hidden) VALUES(?,?,?,?,?,?,?)');
  const insertVisit = db.prepare('INSERT INTO visits(id,url,visit_time,from_visit,transition) VALUES(?,?,?,?,?)');
  insertUrl.run(1, 'https://example.com/a', '示例 A', 2, 0, chromeEpochUs(now), 0);
  insertUrl.run(2, 'https://example.com/b', '示例 B', 1, 1, chromeEpochUs(now - 2000), 0);
  insertUrl.run(3, 'edge://settings/', '设置', 1, 0, chromeEpochUs(now - 3000), 0);
  insertUrl.run(4, 'https://hidden.example/', '隐藏', 1, 0, chromeEpochUs(now - 4000), 1);
  insertVisit.run(10, 1, chromeEpochUs(now), 0, 1);
  insertVisit.run(11, 2, chromeEpochUs(now - 2000), 0, 1);
  insertVisit.run(12, 1, chromeEpochUs(now - 2500), 0, 1);
  insertVisit.run(13, 3, chromeEpochUs(now - 3000), 0, 1);
  insertVisit.run(14, 4, chromeEpochUs(now - 4000), 0, 1);
  db.close();

  const service = new EdgeHistoryService({ userDataDir: root, maxLimit: 100 });
  const first = service.query({ limit: 2 });
  assert.strictEqual(first.profileDirectory, 'Default');
  assert.strictEqual(first.items.length, 2);
  assert.strictEqual(first.items[0].title, '示例 A');
  assert.strictEqual(first.items[1].title, '示例 B');
  assert.strictEqual(first.hasMore, true);
  assert.ok(Math.abs(first.items[0].visitTimeMs - now) < 2);

  const second = service.query({ limit: 10, offset: first.nextOffset });
  assert.strictEqual(second.items.length, 1, '应保留同一 URL 的另一条访问，同时过滤内部页和隐藏页');
  assert.strictEqual(second.items[0].url, 'https://example.com/a');

  const searched = service.query({ query: '示例 B', limit: 10 });
  assert.deepStrictEqual(searched.items.map((item) => item.url), ['https://example.com/b']);
  assert.strictEqual(escapeLike('a%b_c\\d'), 'a\\%b\\_c\\\\d');
  assert.strictEqual(chromiumTimeToUnixMs(chromeEpochUs(now)), now);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('edge-history.test.js: OK');
