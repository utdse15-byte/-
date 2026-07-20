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
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
