'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const { WebSocket, WebSocketServer } = require('ws');
const { parseFramePacket } = require('../lib/protocol');

const ROOT = path.resolve(__dirname, '..');
const jpeg = fs.readFileSync(path.join(__dirname, 'fixtures', 'frame.jpg'));
const jpegBase64 = jpeg.toString('base64');

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let currentStage = 'initial';

function waitFor(predicate, timeout = 15000, interval = 50) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const result = await predicate();
        if (result) return resolve(result);
      } catch {}
      if (Date.now() - started > timeout) return reject(new Error(`等待条件超时：${currentStage}`));
      setTimeout(tick, interval);
    };
    tick();
  });
}

function startMockCdp(port, generation) {
  const server = new WebSocketServer({ port, host: '127.0.0.1' });
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      let result = {};
      switch (message.method) {
        case 'Target.getTargets':
          result = { targetInfos: [{ targetId: `page-${generation}`, type: 'page', title: `Recovery ${generation}`, url: `https://recovery.test/${generation}`, attached: false }] };
          break;
        case 'Target.attachToTarget':
          result = { sessionId: `session-${generation}` };
          break;
        case 'Runtime.evaluate':
          result = { result: { value: { url: `https://recovery.test/${generation}`, title: `Recovery ${generation}`, visibilityState: 'visible', hidden: false, focused: true } } };
          break;
        case 'Page.getNavigationHistory':
          result = { currentIndex: 0, entries: [{ id: generation, url: `https://recovery.test/${generation}`, title: `Recovery ${generation}` }] };
          break;
        case 'Page.getLayoutMetrics':
          result = {
            cssLayoutViewport: { pageX: 0, pageY: 0, clientWidth: 412, clientHeight: 732 },
            cssVisualViewport: { offsetX: 0, offsetY: 0, pageX: 0, pageY: 0, clientWidth: 412, clientHeight: 732, scale: 1 },
            cssContentSize: { x: 0, y: 0, width: 412, height: 1600 }
          };
          break;
        case 'Page.captureScreenshot':
          result = { data: jpegBase64 };
          break;
        default:
          result = {};
          break;
      }
      const reply = { id: message.id, result };
      if (message.sessionId) reply.sessionId = message.sessionId;
      socket.send(JSON.stringify(reply));
      if (message.method === 'Page.startScreencast') {
        setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify({
            method: 'Page.screencastFrame',
            sessionId: `session-${generation}`,
            params: {
              data: jpegBase64,
              sessionId: generation,
              metadata: {
                offsetTop: 0,
                pageScaleFactor: 1,
                deviceWidth: 412,
                deviceHeight: 732,
                scrollOffsetX: 0,
                scrollOffsetY: 0,
                timestamp: Date.now() / 1000
              }
            }
          }));
        }, 40);
      }
    });
  });
  return {
    server,
    sockets,
    listening: new Promise((resolve) => server.once('listening', resolve)),
    async close() {
      for (const socket of sockets) {
        try { socket.terminate(); } catch {}
      }
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

async function main() {
  const cdpPort = await freePort();
  const httpPort = await freePort();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-phone-recovery-'));
  fs.writeFileSync(path.join(userData, 'DevToolsActivePort'), `${cdpPort}\n/devtools/browser/recovery-test\n`, 'utf8');
  const token = 'recovery-test-token-123456';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(httpPort),
      PHONE_TOKEN: token,
      EDGE_USER_DATA_DIR: userData,
      EDGE_MANAGED_SESSION: '0'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  let phone;
  let mock1;
  let mock2;
  try {
    currentStage = '等待控制器 health';
    await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${httpPort}/health`);
      return response.ok;
    });

    phone = new WebSocket(`ws://127.0.0.1:${httpPort}/control?token=${encodeURIComponent(token)}&clientId=recovery-phone`);
    phone.binaryType = 'nodebuffer';
    const texts = [];
    let binaryFrames = 0;
    phone.on('message', (data, isBinary) => {
      if (isBinary) {
        binaryFrames += 1;
        try {
          const parsed = parseFramePacket(Buffer.from(data));
          phone.send(JSON.stringify({
            type: 'frameAck',
            sequence: parsed.metadata.sequence,
            epoch: parsed.metadata.epoch,
            renderMs: 8,
            renderer: 'test',
            source: parsed.metadata.source || 'screencast',
            imageWidth: 412,
            imageHeight: 732
          }));
        } catch {}
      } else texts.push(JSON.parse(data.toString()));
    });
    await new Promise((resolve, reject) => {
      phone.once('open', resolve);
      phone.once('error', reject);
    });

    currentStage = '等待初始失败退避';
    await sleep(2600);
    const unavailableLogsBeforeCdp = (output.match(/Edge CDP 暂时不可用/g) || []).length;
    assert.ok(unavailableLogsBeforeCdp <= 2, `单端点失败不应产生并发重连风暴，实际日志次数=${unavailableLogsBeforeCdp}\n${output}`);

    currentStage = '启动第一代 mock CDP';
    mock1 = startMockCdp(cdpPort, 1);
    await mock1.listening;
    currentStage = '等待第一代 CDP 连接和画面';
    await waitFor(() => binaryFrames > 0 && texts.some((item) => item.type === 'pageState' && item.targetId === 'page-1'), 18000);
    let status = await (await fetch(`http://127.0.0.1:${httpPort}/api/status`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.strictEqual(status.cdpConnected, true);
    assert.strictEqual(status.version, '6.7.0');

    const firstFrameCount = binaryFrames;
    await mock1.close();
    mock1 = null;
    currentStage = '等待 CDP 断开状态';
    await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${httpPort}/api/status`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      return body.cdpConnected === false;
    }, 10000);

    await sleep(700);
    currentStage = '启动第二代 mock CDP';
    mock2 = startMockCdp(cdpPort, 2);
    await mock2.listening;
    currentStage = '等待第二代 CDP 自动恢复';
    await waitFor(() => binaryFrames > firstFrameCount && texts.some((item) => item.type === 'pageState' && item.targetId === 'page-2'), 20000);
    status = await (await fetch(`http://127.0.0.1:${httpPort}/api/status`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.strictEqual(status.cdpConnected, true);
    assert.strictEqual(status.lastConnectError, null);
    assert.ok(status.edgeRuntime && status.edgeRuntime.managedSession === false);

    const closeLogs = (output.match(/Edge CDP 连接关闭/g) || []).length;
    assert.ok(closeLogs <= 2, `一次模拟浏览器退出不应被重复记为大量关闭事件，实际=${closeLogs}`);
    console.log('reconnect-recovery.test.js: OK');
  } finally {
    try { phone?.close(); } catch {}
    try { await mock1?.close(); } catch {}
    try { await mock2?.close(); } catch {}
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      sleep(1800).then(() => child.kill('SIGKILL'))
    ]).catch(() => {});
    fs.rmSync(userData, { recursive: true, force: true });
    if (child.exitCode && child.exitCode !== 0) console.error(output);
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
