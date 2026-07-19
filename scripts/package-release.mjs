#!/usr/bin/env node
'use strict';

// 发布打包脚本（REL-004）。
//
// 从仓库的单一事实源生成自成一体的发布 ZIP：
//   - 复制 01-程序/edge-phone-cdp-inherit-live/ 的程序文件；
//   - 把 02-AI交接/ 复制成 ZIP 内的 AI交接/（AI交接-先读.md 放到 ZIP 根）；
//   - 生成内部 文件校验清单-SHA256.txt；
//   - 打包 edge-phone-cdp-inherit-live-v<版本>.zip 并计算其 SHA-256。
//
// 用法：node scripts/package-release.mjs [输出目录，默认 dist/]
// 依赖：Linux/macOS 用 `zip`；Windows 用 PowerShell Compress-Archive（脚本自动选择）。

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = join(REPO_ROOT, '01-程序', 'edge-phone-cdp-inherit-live');
const HANDOFF_DIR = join(REPO_ROOT, '02-AI交接');
const OUT_DIR = resolve(process.argv[2] || join(REPO_ROOT, 'dist'));
const MANIFEST_NAME = '文件校验清单-SHA256.txt';

// 绝不进入发布包的路径（敏感或运行时产物）。相对 APP_DIR，统一用 / 分隔
// （复制过滤器里的 rel 已归一化为 /，不能用平台相关的 join）。
const APP_EXCLUDES = new Set([
  '.git', 'logs', 'diagnostics',
  'data/access-token.txt',
  'data/history-snapshots',
  'test/fixtures/ui-preview.png'
]);

function fail(message) {
  console.error(`打包失败：${message}`);
  process.exit(1);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function listFilesRecursive(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

function main() {
  if (!existsSync(APP_DIR)) fail(`找不到程序目录：${APP_DIR}`);
  if (!existsSync(HANDOFF_DIR)) fail(`找不到交接目录：${HANDOFF_DIR}`);

  const pkg = JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8'));
  const version = String(pkg.version);
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`package.json 版本无效：${version}`);

  const stem = `edge-phone-cdp-inherit-live-v${version}`;
  const staging = mkdtempSync(join(tmpdir(), 'edge-phone-pkg-'));
  const payloadDir = join(staging, stem);
  mkdirSync(payloadDir, { recursive: true });

  // 1) 复制程序目录，排除敏感/运行时文件。node_modules 保留（发布包内置 ws 依赖）。
  cpSync(APP_DIR, payloadDir, {
    recursive: true,
    filter: (src) => {
      // Windows 上 relative() 返回反斜杠路径，必须先归一化成 /，
      // 否则下面所有前缀比较在 Windows 打包时都会静默失效。
      const rel = relative(APP_DIR, src).split(sep).join('/');
      if (!rel) return true;
      if (rel === 'node_modules' || rel.startsWith('node_modules/')) {
        // 保留生产依赖与 node_modules/.package-lock.json（安装器自检的
        // project-integrity.test.js 需要读取它），只剔除 .bin。
        if (rel === 'node_modules/.bin' || rel.startsWith('node_modules/.bin/')) return false;
        return true;
      }
      for (const ex of APP_EXCLUDES) {
        if (rel === ex || rel.startsWith(`${ex}/`)) return false;
      }
      // 日志文件（logs/*.log）——logs 目录已在 APP_EXCLUDES，保留 .gitkeep 需单独处理。
      return true;
    }
  });
  // 保留空的 logs/ 与 data/ 结构（仅 .gitkeep）。
  for (const keep of ['logs', 'data']) {
    const dir = join(payloadDir, keep);
    mkdirSync(dir, { recursive: true });
    const gitkeep = join(dir, '.gitkeep');
    if (!existsSync(gitkeep)) writeFileSync(gitkeep, '');
  }

  // 2) 注入 AI 交接材料：02-AI交接/ → AI交接/；AI交接-先读.md 放到 payload 根。
  const zipHandoffDir = join(payloadDir, 'AI交接');
  mkdirSync(zipHandoffDir, { recursive: true });
  for (const entry of readdirSync(HANDOFF_DIR, { withFileTypes: true })) {
    const src = join(HANDOFF_DIR, entry.name);
    if (entry.name === 'AI交接-先读.md') {
      cpSync(src, join(payloadDir, 'AI交接-先读.md'));
    } else {
      cpSync(src, join(zipHandoffDir, entry.name), { recursive: true });
    }
  }

  // 3) 生成内部 SHA-256 清单（清单文件本身不列入）。
  const files = listFilesRecursive(payloadDir);
  const manifestLines = files.map((file) => {
    const rel = relative(payloadDir, file).split('\\').join('/');
    return `${sha256(readFileSync(file))}  ${rel}`;
  });
  writeFileSync(join(payloadDir, MANIFEST_NAME), `${manifestLines.join('\n')}\n`, 'utf8');

  // 4) 打包 ZIP（跨平台）。
  mkdirSync(OUT_DIR, { recursive: true });
  const zipPath = join(OUT_DIR, `${stem}.zip`);
  rmSync(zipPath, { force: true });
  let result;
  if (process.platform === 'win32') {
    result = spawnSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Compress-Archive -Path '${join(staging, stem)}' -DestinationPath '${zipPath}' -Force`
    ], { stdio: 'inherit' });
  } else {
    result = spawnSync('zip', ['-r', '-q', '-X', zipPath, stem], { cwd: staging, stdio: 'inherit' });
  }
  if (result.status !== 0) {
    rmSync(staging, { recursive: true, force: true });
    fail(`压缩失败（退出码 ${result.status}）。Linux/macOS 需要 zip，Windows 需要 PowerShell。`);
  }

  // 5) 计算 ZIP 的 SHA-256。
  const zipHash = sha256(readFileSync(zipPath));
  const shaPath = `${zipPath}.sha256.txt`;
  writeFileSync(shaPath, `${zipHash}  ${stem}.zip\n`, 'utf8');

  rmSync(staging, { recursive: true, force: true });

  console.log(`版本：${version}`);
  console.log(`内部文件：${files.length + 1} 个（含清单）`);
  console.log(`ZIP：${zipPath}`);
  console.log(`ZIP SHA-256：${zipHash}`);
  console.log(`SHA 文件：${shaPath}`);
}

main();
