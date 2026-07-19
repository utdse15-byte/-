'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { WebSocket, WebSocketServer } = require('ws');

const ROOT = path.resolve(__dirname, '..');
const jpegBase64 = fs.readFileSync(path.join(__dirname, 'fixtures', 'frame.jpg')).toString('base64');
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
  let lastError = null;
  while (Date.now() - started < timeout) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(45);
  }
  throw new Error(`等待${label}超时${lastError ? `：${lastError.message}` : ''}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(2200)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function main() {
  const cdpPort = await freePort();
  const httpPort = await freePort();
  const observed = [];
  let windowBounds = { left: 80, top: 60, width: 1280, height: 900, windowState: 'normal' };
  const cdpServer = new WebSocketServer({ host: '127.0.0.1', port: cdpPort });

  cdpServer.on('connection', (socket) => {
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      observed.push(message);
      let result = {};
      switch (message.method) {
        case 'Target.getTargets':
          result = { targetInfos: [{
            targetId: 'claude-page', type: 'page', title: 'Claude',
            url: 'https://claude.ai/new', attached: false
          }] };
          break;
        case 'Target.attachToTarget':
          result = { sessionId: 'claude-session' };
          break;
        case 'Browser.getWindowForTarget':
          result = { windowId: 71, bounds: { ...windowBounds } };
          break;
        case 'Browser.setWindowBounds':
          windowBounds = { ...windowBounds, ...(message.params?.bounds || {}) };
          result = {};
          break;
        case 'Runtime.evaluate': {
          const expression = String(message.params?.expression || '');
          if (expression.trim() === 'location.href') {
            result = { result: { value: 'https://claude.ai/new' } };
          } else if (expression.includes('userAgentData') && expression.includes('maxTouchPoints')) {
            result = { result: { value: {
              url: 'https://claude.ai/new', title: 'Claude',
              userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36 Edg/140',
              platform: 'Win32',
              userAgentData: { mobile: false, platform: 'Windows', brands: [{ brand: 'Microsoft Edge', version: '140' }] },
              webdriver: false, language: 'zh-CN', maxTouchPoints: 0,
              devicePixelRatio: 1.25, innerWidth: 544, innerHeight: 845,
              outerWidth: 560, outerHeight: 960,
              screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
              pointer: { fine: true, coarse: false, hover: true, anyFine: true, anyCoarse: false },
              focused: true, visibilityState: 'visible'
            } } };
          } else if (expression.includes('document.hasFocus') || expression.includes('visibilityState')) {
            result = { result: { value: {
              url: 'https://claude.ai/new', title: 'Claude', visibilityState: 'visible', focused: true, hidden: false
            } } };
          } else {
            result = { result: { value: true } };
          }
          break;
        }
        case 'Page.getNavigationHistory':
          result = { currentIndex: 0, entries: [{ id: 1, url: 'https://claude.ai/new', title: 'Claude', transitionType: 'typed' }] };
          break;
        case 'Page.getLayoutMetrics':
          result = {
            cssLayoutViewport: { pageX: 0, pageY: 0, clientWidth: 544, clientHeight: 845 },
            cssVisualViewport: { offsetX: 0, offsetY: 0, pageX: 0, pageY: 0, clientWidth: 544, clientHeight: 845, scale: 1 },
            cssContentSize: { x: 0, y: 0, width: 544, height: 1400 }
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

      if (message.method === 'Page.startScreencast') {
        setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify({
            method: 'Page.screencastFrame', sessionId: 'claude-session',
            params: {
              data: jpegBase64, sessionId: 1,
              metadata: {
                offsetTop: 0, pageScaleFactor: 1,
                deviceWidth: 544, deviceHeight: 845,
                scrollOffsetX: 0, scrollOffsetY: 0,
                timestamp: Date.now() / 1000
              }
            }
          }));
        }, 30);
      }
    });
  });
  await new Promise((resolve) => cdpServer.once('listening', resolve));

  const token = 'manual-compatibility-test-token';
  const controller = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(httpPort),
      PHONE_TOKEN: token,
      IDLE_SHARPEN_ENABLED: '0',
      CDP_BROWSER_WS: `ws://127.0.0.1:${cdpPort}`,
      FOLLOW_DESKTOP_TABS: '0',
      MANUAL_COMPATIBILITY_MODE: 'auto',
      MANUAL_COMPATIBILITY_DOMAINS: 'chatgpt.com,chat.openai.com,auth.openai.com,claude.ai,claude.com',
      MANUAL_COMPATIBILITY_WINDOW_WIDTH: '560',
      MANUAL_COMPATIBILITY_WINDOW_HEIGHT: '960'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  controller.stdout.on('data', (chunk) => { output += chunk.toString(); });
  controller.stderr.on('data', (chunk) => { output += chunk.toString(); });

  let phone;
  try {
    await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${httpPort}/health`);
      if (!response.ok) return false;
      const health = await response.json();
      return health.version === '6.7.0';
    }, 12000, '控制器健康检查');

    phone = new WebSocket(`ws://127.0.0.1:${httpPort}/control?token=${encodeURIComponent(token)}&clientId=manual-test`);
    const texts = [];
    phone.on('message', (raw, isBinary) => {
      if (!isBinary) texts.push(JSON.parse(raw.toString()));
    });
    await new Promise((resolve, reject) => {
      phone.once('open', resolve);
      phone.once('error', reject);
    });
    const hello = await waitFor(() => texts.find((item) => item.type === 'hello'), 8000, '手机 hello');
    assert.strictEqual(hello.version, '6.7.0');
    const activeCompatibility = await waitFor(() => texts.find((item) =>
      item.type === 'manualCompatibility' && item.active === true), 12000, '严格人工模式状态');
    assert.strictEqual(activeCompatibility.inputProfile, 'desktop-mouse-wheel');
    assert.strictEqual(activeCompatibility.auditAutomatic, false);
    assert.deepStrictEqual(activeCompatibility.idleCdpDomains, ['Target', 'Page', 'Input']);

    await waitFor(() => observed.some((item) => item.method === 'Emulation.clearDeviceMetricsOverride'), 12000, '清除手机设备仿真');
    assert.ok(observed.some((item) => item.method === 'Emulation.setTouchEmulationEnabled' && item.params?.enabled === false));
    const narrowBounds = observed.find((item) => item.method === 'Browser.setWindowBounds' && item.params?.bounds?.width === 560);
    assert.ok(narrowBounds, '严格人工模式应调整真实 Edge 窗口，而不是伪造 screen/UA');
    assert.strictEqual(narrowBounds.params.bounds.height, 960);
    assert.ok(!observed.some((item) => /setUserAgentOverride|setAutomationOverride/.test(item.method || '')));
    assert.ok(!observed.some((item) => item.method === 'Emulation.setDeviceMetricsOverride'), '严格人工模式初始加载不得套用手机设备指标');
    assert.strictEqual(observed.some((item) => item.method === 'Runtime.enable'), false, '空闲严格人工模式不得启用 Runtime 域');
    assert.strictEqual(observed.some((item) => item.method === 'DOM.enable'), false, '空闲严格人工模式不得启用 DOM 域');
    assert.strictEqual(observed.some((item) => item.method === 'Runtime.evaluate'), false, '用户没有点环境检查前不得执行网页脚本');
    assert.strictEqual(observed.some((item) => item.method === 'Page.setInterceptFileChooserDialog' && item.params?.enabled === true), false,
      '用户没有点上传前不得拦截网页文件选择器');

    const sendRequest = (type, payload = {}, timeout = 10000) => {
      const requestId = `${type}-${Date.now()}-${Math.random()}`;
      phone.send(JSON.stringify({ type, requestId, ...payload }));
      return waitFor(() => texts.find((item) => item.type === 'reply' && item.requestId === requestId), timeout, `${type} 回复`);
    };

    let reply = await sendRequest('manualCompatibilityAudit', { force: true });
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.compatibility.active, true);
    assert.strictEqual(reply.result.audit.webdriver, false);
    assert.strictEqual(reply.result.audit.platform, 'Win32');
    assert.strictEqual(reply.result.audit.maxTouchPoints, 0);
    assert.ok(observed.some((item) => item.method === 'Runtime.evaluate' && String(item.params?.expression || '').includes('userAgentData')),
      '按需环境检查才允许执行一次网页脚本');
    assert.strictEqual(observed.some((item) => item.method === 'Runtime.enable'), false, '一次性环境检查不应长期启用 Runtime 域');

    const mouseBefore = observed.filter((item) => item.method === 'Input.dispatchMouseEvent').length;
    const touchBefore = observed.filter((item) => item.method === 'Input.dispatchTouchEvent' || item.method === 'Input.emulateTouchFromMouseEvent').length;
    reply = await sendRequest('tap', { x: 160, y: 220, inputMode: 'nativeTouch' });
    assert.strictEqual(reply.ok, true);
    await waitFor(() => observed.filter((item) => item.method === 'Input.dispatchMouseEvent').length >= mouseBefore + 2, 5000, '普通鼠标点击');
    const click = observed.filter((item) => item.method === 'Input.dispatchMouseEvent').slice(mouseBefore);
    assert.deepStrictEqual(click.slice(0, 2).map((item) => item.params.type), ['mousePressed', 'mouseReleased']);
    assert.strictEqual(observed.filter((item) => item.method === 'Input.dispatchTouchEvent' || item.method === 'Input.emulateTouchFromMouseEvent').length, touchBefore);

    reply = await sendRequest('wheel', { x: 180, y: 300, deltaX: 0, deltaY: 160, clearSelection: false });
    assert.strictEqual(reply.ok, true);
    assert.ok(observed.some((item) => item.method === 'Input.dispatchMouseEvent' && item.params?.type === 'mouseWheel'));

    reply = await sendRequest('strictNativeTouch', { enabled: true }, 15000);
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.nativeTouchEnabled, true);
    assert.ok(observed.some((item) => item.method === 'Emulation.setTouchEmulationEnabled' && item.params?.enabled === true));
    const nativeTouchBefore = observed.filter((item) => item.method === 'Input.dispatchTouchEvent').length;
    reply = await sendRequest('tap', { x: 170, y: 230, inputMode: 'nativeTouch' });
    assert.strictEqual(reply.ok, true);
    await waitFor(() => observed.filter((item) => item.method === 'Input.dispatchTouchEvent').length >= nativeTouchBefore + 2, 5000, '临时原生触摸点击');
    reply = await sendRequest('strictNativeTouch', { enabled: false }, 15000);
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.nativeTouchEnabled, false);

    const interceptBefore = observed.filter((item) => item.method === 'Page.setInterceptFileChooserDialog' && item.params?.enabled === true).length;
    reply = await sendRequest('requestUpload', {}, 15000);
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.armed, true);
    assert.ok(Number(reply.result.expiresAt) > Date.now());
    await waitFor(() => observed.filter((item) => item.method === 'Page.setInterceptFileChooserDialog' && item.params?.enabled === true).length > interceptBefore,
      5000, '按需启用文件选择拦截');
    assert.strictEqual(observed.some((item) => item.method === 'DOM.enable'), false, '文件上传不得长期启用 DOM 域');

    const metricsBeforePhoneResize = observed.filter((item) => item.method === 'Emulation.setDeviceMetricsOverride').length;
    reply = await sendRequest('viewport', { width: 390, height: 760, dpr: 2.5, mobile: true, revision: 4, force: true });
    assert.strictEqual(reply.ok, true);
    await sleep(180);
    assert.strictEqual(observed.filter((item) => item.method === 'Emulation.setDeviceMetricsOverride').length, metricsBeforePhoneResize,
      'Android 全屏或地址栏变化不应重写严格站点设备指标');

    reply = await sendRequest('manualCompatibility', { mode: 'off' }, 15000);
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.active, false);
    await waitFor(() => observed.some((item) => item.method === 'Emulation.setDeviceMetricsOverride'), 7000, '恢复普通手机仿真');
    const restoreBounds = observed.filter((item) => item.method === 'Browser.setWindowBounds')
      .find((item) => item.params?.bounds?.width === 1280 && item.params?.bounds?.height === 900);
    assert.ok(restoreBounds, '退出模式时应恢复用户原 Edge 窗口尺寸');

    reply = await sendRequest('manualCompatibility', { mode: 'always' }, 15000);
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.active, true);
    assert.strictEqual(reply.result.mode, 'always');

    const forbidden = observed.filter((item) => /setUserAgentOverride|setAutomationOverride/.test(item.method || ''));
    assert.deepStrictEqual(forbidden, []);
    console.log('manual-compatibility.test.js: OK');
  } catch (error) {
    throw new Error(`${error.stack || error.message}\n--- controller output ---\n${output.slice(-10000)}`);
  } finally {
    try { phone?.close(); } catch {}
    await stopChild(controller);
    await new Promise((resolve) => cdpServer.close(resolve));
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
