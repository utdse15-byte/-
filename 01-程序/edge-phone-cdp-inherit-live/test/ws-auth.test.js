'use strict';

// WS 认证与 /health 收敛（安全收尾）：
// 1. 令牌通过 Sec-WebSocket-Protocol 子协议携带即可认证（不需放进 URL）；
// 2. 服务端只回选非机密的 epc.v1 应答子协议，令牌不出现在响应头；
// 3. 错误令牌（子协议或 URL）被拒绝；
// 4. ?token= URL 回退仍然可用（兼容旧客户端与其他测试）；
// 5. /health 无令牌可访问，但不再泄露 pid / 连接数 / Edge 进程状态等拓扑信息。

const assert = require('assert');
const net = require('net');
const { spawn } = require('child_process');
const { WebSocket, WebSocketServer } = require('ws');

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function waitFor(predicate, timeout = 10000, interval = 50, label = '条件') {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try { const r = await predicate(); if (r) return resolve(r); } catch {}
      if (Date.now() - started > timeout) return reject(new Error(`等待${label}超时`));
      setTimeout(tick, interval);
    };
    tick();
  });
}

const b64url = (s) => Buffer.from(s, 'utf8').toString('base64url');

function tryConnect(url, protocols) {
  return new Promise((resolve) => {
    const ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);
    let helloSeen = false;
    let selectedProtocol = null;
    const done = (result) => { try { ws.terminate(); } catch {} resolve(result); };
    ws.on('open', () => { selectedProtocol = ws.protocol; });
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'hello') { helloSeen = true; done({ ok: true, hello: msg, protocol: selectedProtocol }); }
      } catch {}
    });
    ws.on('error', () => done({ ok: false }));
    ws.on('close', () => { if (!helloSeen) done({ ok: false }); });
    setTimeout(() => done({ ok: helloSeen }), 6000);
  });
}

async function main() {
  const httpPort = await freePort();
  const cdpPort = await freePort();
  const token = 'ws-auth-test-token-1234567890';

  const cdp = new WebSocketServer({ host: '127.0.0.1', port: cdpPort });
  cdp.on('connection', (sock) => sock.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    const resp = { id: m.id, result: {} };
    if (m.sessionId) resp.sessionId = m.sessionId;
    sock.send(JSON.stringify(resp));
  }));
  await new Promise((r) => cdp.once('listening', r));

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, LISTEN_HOST: '127.0.0.1', PORT: String(httpPort), PHONE_TOKEN: token, IDLE_SHARPEN_ENABLED: '0', CDP_BROWSER_WS: `ws://127.0.0.1:${cdpPort}` },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  child.stdout.on('data', (c) => { out += c.toString(); });
  child.stderr.on('data', (c) => { out += c.toString(); });

  try {
    await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${httpPort}/health`)).ok; } catch { return false; } }, 12000, 60, '控制器健康检查');
    const base = `ws://127.0.0.1:${httpPort}/control`;

    // 1 + 2：子协议携带正确令牌 → 认证成功，且响应只回选 epc.v1。
    const good = await tryConnect(base, ['epc.v1', `epc.token.${b64url(token)}`]);
    assert.strictEqual(good.ok, true, '子协议携带正确令牌应认证成功');
    assert.strictEqual(good.protocol, 'epc.v1', '响应必须只回选 epc.v1，不回显令牌子协议');

    // 3：子协议携带错误令牌 → 拒绝。
    const badProto = await tryConnect(base, ['epc.v1', `epc.token.${b64url('wrong-token')}`]);
    assert.strictEqual(badProto.ok, false, '错误令牌子协议必须被拒绝');

    // 3：错误的 URL 令牌 → 拒绝。
    const badUrl = await tryConnect(`${base}?token=wrong-token`);
    assert.strictEqual(badUrl.ok, false, '错误 URL 令牌必须被拒绝');

    // 4：正确的 URL 令牌回退 → 仍然可用。
    const legacy = await tryConnect(`${base}?token=${encodeURIComponent(token)}`);
    assert.strictEqual(legacy.ok, true, 'URL 令牌回退应继续可用');
    assert.strictEqual(legacy.hello.limits.tokenRotatable, false, 'PHONE_TOKEN 固定时不可轮换');

    // 5：/health 收敛，不泄露拓扑信息。
    const health = await (await fetch(`http://127.0.0.1:${httpPort}/health`)).json();
    assert.strictEqual(health.ok, true);
    assert.strictEqual(typeof health.version, 'string');
    for (const leaked of ['pid', 'connectedPhones', 'edgeProcessRunning', 'edgeManaged', 'edgeRestartCount', 'reconnectDueInMs', 'cdpConnected']) {
      assert.ok(!(leaked in health), `/health 不应泄露 ${leaked}`);
    }

    console.log('ws-auth.test.js: OK');
  } catch (error) {
    console.error('controller output:\n', out.slice(-3000));
    throw error;
  } finally {
    child.kill('SIGKILL');
    await new Promise((r) => setTimeout(r, 120));
    cdp.close();
  }

  await rotationRevocation();
}

// 令牌轮换必须撤销已建立的旧会话（跨生命周期不变量）：
// 只让旧令牌无法"新建连接"是不够的——已认证的旧连接若不被关闭，仍可
// claimControl 并继续注入命令，与"轮换即撤销"的界面承诺不符。
async function rotationRevocation() {
  const httpPort = await freePort();
  const cdpPort = await freePort();
  const fs = require('fs');
  const tokenPath = path.join(ROOT, 'data', 'access-token.txt');
  try { fs.rmSync(tokenPath, { force: true }); } catch {}

  const cdp = new WebSocketServer({ host: '127.0.0.1', port: cdpPort });
  cdp.on('connection', (sock) => sock.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    const resp = { id: m.id, result: {} };
    if (m.sessionId) resp.sessionId = m.sessionId;
    sock.send(JSON.stringify(resp));
  }));
  await new Promise((r) => cdp.once('listening', r));

  // 不设 PHONE_TOKEN：令牌自动生成于 data/access-token.txt，允许在线轮换。
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PHONE_TOKEN: '', LISTEN_HOST: '127.0.0.1', PORT: String(httpPort), IDLE_SHARPEN_ENABLED: '0', CDP_BROWSER_WS: `ws://127.0.0.1:${cdpPort}` },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  child.stdout.on('data', (c) => { out += c.toString(); });
  child.stderr.on('data', (c) => { out += c.toString(); });

  const openClient = (token, clientId) => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${httpPort}/control?token=${encodeURIComponent(token)}&clientId=${clientId}`);
    const client = { ws, closeCode: null, replies: new Map(), nextId: 1 };
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'hello') resolve(client);
        if (msg.type === 'reply' && client.replies.has(msg.requestId)) {
          client.replies.get(msg.requestId)(msg);
          client.replies.delete(msg.requestId);
        }
      } catch {}
    });
    ws.on('close', (code) => { client.closeCode = code; reject(new Error('closed-before-hello')); });
    ws.on('error', () => reject(new Error('connect-error')));
    setTimeout(() => reject(new Error('hello-timeout')), 8000);
  });
  const requestOf = (client, type, payload = {}) => new Promise((resolve, reject) => {
    const requestId = `t-${client.nextId++}`;
    client.replies.set(requestId, resolve);
    client.ws.send(JSON.stringify({ type, requestId, ...payload }));
    setTimeout(() => reject(new Error(`${type} 应答超时`)), 8000);
  });

  try {
    await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${httpPort}/health`)).ok; } catch { return false; } }, 12000, 60, '控制器健康检查');
    const oldToken = await waitFor(() => {
      try { const t = fs.readFileSync(tokenPath, 'utf8').trim(); return t || null; } catch { return null; }
    }, 12000, 60, '自动生成令牌');

    const phoneA = await openClient(oldToken, 'rotation-phone-a');
    const phoneB = await openClient(oldToken, 'rotation-phone-b');

    // A 接管控制并轮换令牌。
    const claimA = await requestOf(phoneA, 'claimControl');
    assert.strictEqual(claimA.ok, true, 'A 应能接管控制');
    const rotated = await requestOf(phoneA, 'rotateToken');
    assert.strictEqual(rotated.ok, true, '轮换应成功');
    const newToken = rotated.result.token;
    assert.ok(newToken && newToken !== oldToken, '应返回新令牌');

    // 不变量 1：B（旧代连接）必须被以 4003 关闭，不能再接管或注入命令。
    await waitFor(() => phoneB.closeCode !== null, 8000, 60, 'B 被撤销关闭');
    assert.strictEqual(phoneB.closeCode, 4003, '旧连接应被 4003 关闭');

    // 不变量 2：发起轮换的 A 保持有效（已拿到新令牌）。
    const pingA = await requestOf(phoneA, 'ping');
    assert.strictEqual(pingA.ok, true, '发起方连接应保持有效');

    // 不变量 3：旧令牌不能再新建连接；新令牌可以。
    const oldReject = await tryConnect(`ws://127.0.0.1:${httpPort}/control?token=${encodeURIComponent(oldToken)}&clientId=rotation-phone-c`);
    assert.strictEqual(oldReject.ok, false, '旧令牌不得再新建连接');
    const newAccept = await tryConnect(`ws://127.0.0.1:${httpPort}/control?token=${encodeURIComponent(newToken)}&clientId=rotation-phone-d`);
    assert.strictEqual(newAccept.ok, true, '新令牌应能新建连接');

    try { phoneA.ws.terminate(); } catch {}
    console.log('ws-auth.test.js: 轮换撤销 OK');
  } catch (error) {
    console.error('controller output:\n', out.slice(-3000));
    throw error;
  } finally {
    child.kill('SIGKILL');
    await new Promise((r) => setTimeout(r, 120));
    cdp.close();
    try { fs.rmSync(tokenPath, { force: true }); } catch {}
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
