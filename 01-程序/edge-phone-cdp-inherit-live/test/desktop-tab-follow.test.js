'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { WebSocket, WebSocketServer } = require('ws');
const { parseFramePacket } = require('../lib/protocol');

const ROOT = path.resolve(__dirname, '..');
const jpeg = fs.readFileSync(path.join(__dirname, 'fixtures', 'frame.jpg'));
const jpegBase64 = jpeg.toString('base64');
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

async function waitFor(predicate, timeout = 15000, label = '条件') {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch {}
    await sleep(45);
  }
  throw new Error(`等待${label}超时`);
}

async function main() {
  const cdpPort = await freePort();
  const httpPort = await freePort();
  const token = 'desktop-follow-test-token-123456';
  const targets = [
    { targetId: 'page-1', type: 'page', title: 'First tab', url: 'https://tabs.test/one', attached: false },
    { targetId: 'page-2', type: 'page', title: 'Second tab', url: 'https://tabs.test/two', attached: false }
  ];
  const histories = {
    'page-1': {
      currentIndex: 1,
      entries: [
        { id: 101, url: 'https://tabs.test/one/a', title: 'One A', transitionType: 'typed' },
        { id: 102, url: 'https://tabs.test/one', title: 'First tab', transitionType: 'link' }
      ]
    },
    'page-2': {
      currentIndex: 1,
      entries: [
        { id: 201, url: 'https://tabs.test/two/a', title: 'Two A', transitionType: 'typed' },
        { id: 202, url: 'https://tabs.test/two', title: 'Second tab', transitionType: 'link' },
        { id: 203, url: 'https://tabs.test/two/c', title: 'Two C', transitionType: 'link' }
      ]
    }
  };
  let desktopActiveTarget = 'page-1';
  let desktopVisibleTarget = 'page-1';
  let browserSocket = null;
  let attachSerial = 0;
  let frameSerial = 0;
  const sessionTargets = new Map();
  const observed = [];

  const mock = new WebSocketServer({ port: cdpPort, host: '127.0.0.1' });
  mock.on('connection', (socket) => {
    browserSocket = socket;
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      observed.push(message);
      const targetId = message.sessionId ? sessionTargets.get(message.sessionId) : null;
      let result = {};
      switch (message.method) {
        case 'Target.getTargets':
          result = { targetInfos: targets };
          break;
        case 'Target.attachToTarget': {
          const sessionId = `session-${message.params.targetId}-${++attachSerial}`;
          sessionTargets.set(sessionId, message.params.targetId);
          result = { sessionId };
          break;
        }
        case 'Target.detachFromTarget':
          sessionTargets.delete(message.params.sessionId);
          result = {};
          break;
        case 'Runtime.evaluate': {
          const current = targets.find((item) => item.targetId === targetId) || targets[0];
          const focused = targetId === desktopActiveTarget;
          const visible = targetId === desktopVisibleTarget;
          result = {
            result: {
              value: {
                url: current.url,
                title: current.title,
                visibilityState: visible ? 'visible' : 'hidden',
                hidden: !visible,
                focused
              }
            }
          };
          break;
        }
        case 'Page.getNavigationHistory':
          result = histories[targetId] || histories['page-1'];
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
      }
      const response = { id: message.id, result };
      if (message.sessionId) response.sessionId = message.sessionId;
      socket.send(JSON.stringify(response));

      if (message.method === 'Page.startScreencast' && message.sessionId) {
        const sessionId = message.sessionId;
        setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN || !sessionTargets.has(sessionId)) return;
          socket.send(JSON.stringify({
            method: 'Page.screencastFrame',
            sessionId,
            params: {
              data: jpegBase64,
              sessionId: ++frameSerial,
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
        }, 30);
      }
    });
  });
  await new Promise((resolve) => mock.once('listening', resolve));

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(httpPort),
      PHONE_TOKEN: token,
      IDLE_SHARPEN_ENABLED: '0',
      CDP_BROWSER_WS: `ws://127.0.0.1:${cdpPort}`,
      FOLLOW_DESKTOP_TABS: '1',
      DESKTOP_TAB_FOLLOW_STRATEGY: 'runtime',
      ACTIVE_TAB_POLL_MS: '350'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  let phone;
  try {
    await waitFor(async () => {
      try { return (await fetch(`http://127.0.0.1:${httpPort}/health`)).ok; } catch { return false; }
    }, 12000, '控制器启动');

    const texts = [];
    phone = new WebSocket(`ws://127.0.0.1:${httpPort}/control?token=${encodeURIComponent(token)}&clientId=desktop-follow`);
    phone.on('message', (data, isBinary) => {
      if (isBinary) {
        try {
          const parsed = parseFramePacket(Buffer.from(data));
          phone.send(JSON.stringify({
            type: 'frameAck', sequence: parsed.metadata.sequence, epoch: parsed.metadata.epoch,
            renderMs: 7, renderer: 'test', source: parsed.metadata.source || 'screencast', imageWidth: 412, imageHeight: 732
          }));
        } catch {}
      } else {
        try { texts.push(JSON.parse(data.toString())); } catch {}
      }
    });
    await new Promise((resolve, reject) => {
      phone.once('open', resolve);
      phone.once('error', reject);
    });

    const firstState = await waitFor(() => [...texts].reverse().find((item) => item.type === 'pageState' && item.targetId === 'page-1'), 12000, '初始标签页状态');
    assert.strictEqual(firstState.followDesktopTabs, true);
    assert.strictEqual(firstState.history.entries.length, 2);
    assert.strictEqual(firstState.history.entries.find((entry) => entry.current)?.id, 102);
    assert.strictEqual(observed.some((item) => item.method === 'Target.activateTarget'), false, '自动跟随不应抢占电脑标签焦点');

    const currentSession = [...sessionTargets.entries()].find(([, id]) => id === 'page-1')?.[0];
    assert.ok(currentSession, '应存在第一标签页会话');

    // Windows 切换到别的应用：最后一个 Edge 页面仍可 visible，但没有任何
    // Edge 页面 document.hasFocus()。手机必须保留 page-1，不得误切换或重附加。
    desktopActiveTarget = null;
    desktopVisibleTarget = 'page-1';
    const page2StateCountBeforeAppSwitch = texts.filter((item) => item.type === 'pageState' && item.targetId === 'page-2').length;
    browserSocket.send(JSON.stringify({
      method: 'Page.screencastVisibilityChanged',
      sessionId: currentSession,
      params: { visible: false }
    }));
    await sleep(1500);
    const page2StateCountAfterAppSwitch = texts.filter((item) => item.type === 'pageState' && item.targetId === 'page-2').length;
    assert.strictEqual(page2StateCountAfterAppSwitch, page2StateCountBeforeAppSwitch, '切换 Windows 应用不能被误判为 Edge 标签切换');

    const statusRequestId = 'status-after-os-switch';
    phone.send(JSON.stringify({ type: 'status', requestId: statusRequestId }));
    const backgroundStatus = await waitFor(() => texts.find((item) => item.type === 'reply' && item.requestId === statusRequestId), 8000, '后台状态回复');
    assert.strictEqual(backgroundStatus.ok, true);
    assert.strictEqual(backgroundStatus.result.target.id, 'page-1');
    assert.strictEqual(backgroundStatus.result.desktopEdgeFocused, false);
    assert.ok(sessionTargets.has(currentSession), 'Edge 退到其他应用后必须保留当前主调试会话');

    // 真正在 Edge 内切到第二个标签，document.hasFocus() 转移后才跟随。
    desktopActiveTarget = 'page-2';
    desktopVisibleTarget = 'page-2';
    browserSocket.send(JSON.stringify({
      method: 'Page.screencastVisibilityChanged',
      sessionId: currentSession,
      params: { visible: false }
    }));

    const secondState = await waitFor(() => [...texts].reverse().find((item) => item.type === 'pageState' && item.targetId === 'page-2'), 15000, '自动跟随第二标签页');
    assert.strictEqual(secondState.title, 'Second tab');
    assert.strictEqual(secondState.canGoBack, true);
    assert.strictEqual(secondState.canGoForward, true);
    assert.strictEqual(secondState.history.entries.length, 3);
    assert.strictEqual(secondState.history.entries.find((entry) => entry.current)?.id, 202);
    assert.strictEqual(observed.some((item) => item.method === 'Target.activateTarget'), false, '桌面切换后的自动跟随仍不得反向激活标签页');

    const requestId = 'history-jump-203';
    phone.send(JSON.stringify({ type: 'navigateHistoryEntry', requestId, entryId: 203 }));
    const reply = await waitFor(() => texts.find((item) => item.type === 'reply' && item.requestId === requestId), 8000, '历史跳转回复');
    assert.strictEqual(reply.ok, true);
    const historyCommand = observed.find((item) => item.method === 'Page.navigateToHistoryEntry' && item.params.entryId === 203);
    assert.ok(historyCommand, '手机必须能跳转电脑当前标签页的历史条目');
    assert.strictEqual(sessionTargets.get(historyCommand.sessionId), 'page-2');

    console.log('desktop-tab-follow.test.js: OK');
  } catch (error) {
    console.error(output.slice(-6000));
    throw error;
  } finally {
    try { phone?.close(); } catch {}
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      sleep(1800).then(() => child.kill('SIGKILL'))
    ]).catch(() => {});
    await new Promise((resolve) => mock.close(resolve));
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
