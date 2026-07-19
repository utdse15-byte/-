'use strict';

// 静止画面高清化（UX-008）：
// 1. 页面静止且无输入超过阈值后，控制器必须用 Page.captureScreenshot(format=png)
//    补拍一张无损画面，并以 source=idle-sharpen、contentType=image/png 发布；
// 2. 补拍帧本身不得再次触发补拍（防止循环）；
// 3. 手指按住期间（touchActive）不得补拍；
// 4. 新的输入活动之后回到实时 JPEG，再次静止时可以再次补拍；
// 5. 全程只允许 Page 域截图，不得为此启用 Runtime/DOM。

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { WebSocket, WebSocketServer } = require('ws');
const { parseFramePacket } = require('../lib/protocol');

const ROOT = path.resolve(__dirname, '..');
const jpegBase64 = fs.readFileSync(path.join(__dirname, 'fixtures', 'frame.jpg')).toString('base64');
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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
      try {
        const result = await predicate();
        if (result) return resolve(result);
      } catch {}
      if (Date.now() - started > timeout) return reject(new Error(`等待${label}超时`));
      setTimeout(tick, interval);
    };
    tick();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const cdpPort = await freePort();
  const httpPort = await freePort();
  const observed = [];
  const mock = new WebSocketServer({ port: cdpPort, host: '127.0.0.1' });

  mock.on('connection', (socket) => {
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      observed.push({ method: message.method, params: message.params || {}, at: Date.now() });
      let result = {};
      switch (message.method) {
        case 'Target.getTargets':
          result = { targetInfos: [{ targetId: 'page-1', type: 'page', title: 'Idle Mock', url: 'https://example.test/', attached: false }] };
          break;
        case 'Target.attachToTarget':
          result = { sessionId: 'session-1' };
          break;
        case 'Runtime.evaluate':
          result = { result: { value: { url: 'https://example.test/', title: 'Idle Mock', visibilityState: 'visible', hidden: false, focused: true } } };
          break;
        case 'Page.getNavigationHistory':
          result = { currentIndex: 0, entries: [{ id: 1, url: 'https://example.test/', title: 'Idle Mock' }] };
          break;
        case 'Page.getLayoutMetrics':
          result = {
            cssLayoutViewport: { pageX: 0, pageY: 0, clientWidth: 412, clientHeight: 732 },
            cssVisualViewport: { offsetX: 0, offsetY: 0, pageX: 0, pageY: 0, clientWidth: 412, clientHeight: 732, scale: 1 },
            cssContentSize: { x: 0, y: 0, width: 412, height: 1500 }
          };
          break;
        case 'Page.captureScreenshot':
          result = { data: message.params?.format === 'png' ? pngBase64 : jpegBase64 };
          break;
        default:
          result = {};
          break;
      }
      const response = { id: message.id, result };
      if (message.sessionId) response.sessionId = message.sessionId;
      socket.send(JSON.stringify(response));

      if (message.method === 'Page.startScreencast') {
        setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify({
            method: 'Page.screencastFrame',
            sessionId: 'session-1',
            params: {
              data: jpegBase64,
              sessionId: 1,
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

  const token = 'idle-sharpen-test-token-123456';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      LISTEN_HOST: '127.0.0.1',
      PORT: String(httpPort),
      PHONE_TOKEN: token,
      CDP_BROWSER_WS: `ws://127.0.0.1:${cdpPort}`,
      IDLE_SHARPEN_ENABLED: '1',
      IDLE_SHARPEN_DELAY_MS: '600'
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
    }, 12000, 60, '控制器健康检查');

    const frames = [];
    phone = new WebSocket(`ws://127.0.0.1:${httpPort}/control?token=${encodeURIComponent(token)}&clientId=idle-sharpen`);
    phone.on('message', (data, isBinary) => {
      if (!isBinary) return;
      try {
        const parsed = parseFramePacket(Buffer.from(data));
        frames.push(parsed);
        phone.send(JSON.stringify({
          type: 'frameAck',
          sequence: parsed.metadata.sequence,
          epoch: parsed.metadata.epoch,
          renderMs: 5,
          renderer: 'idle-sharpen-test',
          source: parsed.metadata.source || 'screencast',
          imageWidth: 412,
          imageHeight: 732
        }));
      } catch {}
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('手机连接超时')), 8000);
      phone.once('open', () => { clearTimeout(timer); resolve(); });
      phone.once('error', (error) => { clearTimeout(timer); reject(error); });
    });

    // 1. 首帧（有损 JPEG）到达并被显示确认。
    const firstFrame = await waitFor(
      () => frames.find((frame) => frame.metadata.source === 'screencast'),
      10000, 50, '首个 screencast 帧'
    );
    assert.strictEqual(firstFrame.metadata.contentType || 'image/jpeg', 'image/jpeg');

    // 2. 静止 600ms 后应出现 PNG 补拍请求与 idle-sharpen 帧。
    const sharpenRequest = await waitFor(
      () => observed.find((item) => item.method === 'Page.captureScreenshot' && item.params.format === 'png'),
      8000, 50, 'PNG 补拍请求'
    );
    assert.ok(sharpenRequest, '静止后必须发出 format=png 的截图请求');
    const sharpenFrame = await waitFor(
      () => frames.find((frame) => frame.metadata.source === 'idle-sharpen'),
      8000, 50, 'idle-sharpen 帧'
    );
    assert.strictEqual(sharpenFrame.metadata.contentType, 'image/png');
    assert.ok(sharpenFrame.image.length > 0);

    // 3. 补拍帧本身不得触发第二次补拍。
    const sharpenCountAfterFirst = observed.filter((item) => item.method === 'Page.captureScreenshot' && item.params.format === 'png').length;
    await sleep(2200);
    const sharpenCountAfterWait = observed.filter((item) => item.method === 'Page.captureScreenshot' && item.params.format === 'png').length;
    assert.strictEqual(sharpenCountAfterWait, sharpenCountAfterFirst, '静止画面只应补拍一次，不得循环补拍');

    // 4. 手指按住期间不得补拍；松手并静止后可以再次补拍。
    const context = {
      targetId: sharpenFrame.metadata.targetId,
      viewportRevision: sharpenFrame.metadata.viewportRevision,
      frameEpoch: sharpenFrame.metadata.epoch,
      deviceWidth: 412,
      deviceHeight: 732,
      contentDipWidth: 412,
      contentDipHeight: 732
    };
    phone.send(JSON.stringify({
      type: 'touch', event: 'start', x: 150, y: 300, inputMode: 'nativeTouch',
      context, gestureId: 'idle-hold-1', eventSequence: 1
    }));
    await waitFor(
      () => observed.find((item) => item.method === 'Input.dispatchTouchEvent' && item.params.type === 'touchStart'),
      8000, 50, '按下注入'
    );
    const sharpenCountDuringHold = observed.filter((item) => item.method === 'Page.captureScreenshot' && item.params.format === 'png').length;
    await sleep(2000);
    const sharpenCountAfterHold = observed.filter((item) => item.method === 'Page.captureScreenshot' && item.params.format === 'png').length;
    assert.strictEqual(sharpenCountAfterHold, sharpenCountDuringHold, '手指按住期间不得补拍');

    phone.send(JSON.stringify({
      type: 'touch', event: 'end', x: 150, y: 300, inputMode: 'nativeTouch',
      context, gestureId: 'idle-hold-1', eventSequence: 2
    }));
    await waitFor(
      () => observed.find((item) => item.method === 'Input.dispatchTouchEvent' && item.params.type === 'touchEnd'),
      8000, 50, '抬手注入'
    );

    // 松手后：输入产生的按需截图（JPEG）先出现，再次静止后出现新的 PNG 补拍。
    await waitFor(
      () => observed.filter((item) => item.method === 'Page.captureScreenshot' && item.params.format === 'png').length > sharpenCountAfterHold,
      10000, 50, '抬手静止后的再次补拍'
    );

    // 5. 补拍不得启用 Runtime/DOM 域。
    assert.ok(!observed.some((item) => item.method === 'Runtime.enable'), '补拍不得启用 Runtime 域');
    assert.ok(!observed.some((item) => item.method === 'DOM.enable'), '补拍不得启用 DOM 域');

    console.log('idle-sharpen.test.js: OK');
  } catch (error) {
    console.error('controller output:\n', output.slice(-4000));
    throw error;
  } finally {
    try { phone?.terminate(); } catch {}
    child.kill('SIGKILL');
    await new Promise((resolve) => setTimeout(resolve, 150));
    mock.close();
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
