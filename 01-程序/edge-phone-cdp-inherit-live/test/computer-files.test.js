'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ComputerFileService } = require('../lib/computer-files');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-phone-computer-files-'));
const root = path.join(base, 'allowed');
const nested = path.join(root, 'nested');
const outside = path.join(base, 'outside.txt');
fs.mkdirSync(nested, { recursive: true });
fs.writeFileSync(path.join(root, 'alpha.txt'), 'alpha');
fs.writeFileSync(path.join(nested, 'beta.bin'), Buffer.from([1, 2, 3]));
fs.writeFileSync(outside, 'outside');

try {
  const service = new ComputerFileService({ roots: [root], maxEntries: 100 });
  const roots = service.listRoots();
  assert.strictEqual(roots.length, 1);
  assert.strictEqual(path.resolve(roots[0].path), path.resolve(root));

  const listing = service.listDirectory(root);
  assert.strictEqual(listing.parentPath, null, '受限根目录不能向上越界');
  assert.ok(listing.entries.some((item) => item.kind === 'directory' && item.name === 'nested'));
  assert.ok(listing.entries.some((item) => item.kind === 'file' && item.name === 'alpha.txt' && item.size === 5));

  const nestedListing = service.listDirectory(nested);
  assert.strictEqual(path.resolve(nestedListing.parentPath), path.resolve(root));
  assert.ok(nestedListing.entries.some((item) => item.name === 'beta.bin'));


  const sortDir = path.join(root, 'sort');
  fs.mkdirSync(sortDir, { recursive: true });
  const olderPath = path.join(sortDir, 'older.txt');
  const newerPath = path.join(sortDir, 'newer.txt');
  fs.writeFileSync(olderPath, 'old');
  fs.writeFileSync(newerPath, 'newer');
  const oldTime = new Date(Date.now() - 60000);
  const newTime = new Date(Date.now() - 5000);
  fs.utimesSync(olderPath, oldTime, oldTime);
  fs.utimesSync(newerPath, newTime, newTime);

  const modifiedDesc = service.listDirectory(sortDir);
  assert.strictEqual(modifiedDesc.sort, 'modified-desc');
  assert.deepStrictEqual(modifiedDesc.entries.map((item) => item.name), ['newer.txt', 'older.txt'], '电脑文件默认必须按更改时间从新到旧');
  const modifiedAsc = service.listDirectory(sortDir, { sort: 'modified-asc' });
  assert.deepStrictEqual(modifiedAsc.entries.map((item) => item.name), ['older.txt', 'newer.txt']);
  const nameAsc = service.listDirectory(sortDir, { sort: 'name-asc' });
  assert.deepStrictEqual(nameAsc.entries.map((item) => item.name), ['newer.txt', 'older.txt']);

  const selection = service.validateSelection([path.join(root, 'alpha.txt')], { multiple: false, directory: false, maxFiles: 10 });
  assert.strictEqual(selection.length, 1);
  assert.strictEqual(selection[0].size, 5);
  assert.strictEqual(selection[0].kind, 'file');

  const folder = service.validateSelection([nested], { multiple: false, directory: true, maxFiles: 10 });
  assert.strictEqual(folder[0].kind, 'directory');

  assert.throws(() => service.resolveAllowed(outside), /不在允许浏览/);
  assert.throws(() => service.validateSelection([nested], { directory: false }), /请选择电脑上的文件/);
  assert.throws(() => service.validateSelection([path.join(root, 'alpha.txt'), path.join(nested, 'beta.bin')], { multiple: false }), /只允许选择一个文件/);

  console.log('computer-files.test.js: OK');
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}
