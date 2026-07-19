'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn, spawnSync } = require('child_process');
const { WebSocket, WebSocketServer } = require('ws');

const ROOT = path.resolve(__dirname, '..');
const jpegBase64 = fs.readFileSync(path.join(__dirname, 'fixtures', 'frame.jpg')).toString('base64');
const chromium = process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(fs.existsSync);

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

function waitFor(predicate, timeout = 12000, interval = 60, label = '条件') {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const value = await predicate();
        if (value) return resolve(value);
      } catch {}
      if (Date.now() - started > timeout) return reject(new Error(`等待${label}超时`));
      setTimeout(tick, interval);
    };
    tick();
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.exceptions = [];
  }

  async connect() {
    this.ws = new WebSocket(this.endpoint);
    this.ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result || {});
      } else if (message.method === 'Runtime.exceptionThrown') {
        this.exceptions.push(message.params?.exceptionDetails?.text || 'Runtime.exceptionThrown');
      }
    });
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`${method} 超时`));
      }, 8000).unref?.();
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || '页面执行异常');
    return result.result?.value;
  }

  close() {
    try { this.ws?.close(); } catch {}
  }
}

async function main() {
  const managedPolicyPaths = [
    '/etc/chromium/policies/managed/000_policy_merge.json',
    '/etc/chromium/policies/managed/policies.json',
    '/etc/opt/chrome/policies/managed/policies.json'
  ];
  const blocksAllUrls = managedPolicyPaths.some((policyPath) => {
    try {
      const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
      return Array.isArray(policy.URLBlocklist) && policy.URLBlocklist.includes('*');
    } catch {
      return false;
    }
  });
  if (blocksAllUrls) {
    console.log('browser-ui.test.js: SKIP (容器 Chromium 策略阻止所有 URL)');
    return;
  }
  if (!chromium || spawnSync(chromium, ['--version'], { stdio: 'ignore' }).status !== 0) {
    console.log('browser-ui.test.js: SKIP (未找到 Chromium)');
    return;
  }

  const cdpPort = await freePort();
  const httpPort = await freePort();
  const chromePort = await freePort();
  const observed = [];
  let edgeSocket = null;

  const mock = new WebSocketServer({ port: cdpPort, host: '127.0.0.1' });
  mock.on('connection', (socket) => {
    edgeSocket = socket;
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      observed.push({ method: message.method, params: message.params || {}, sessionId: message.sessionId });
      let result = {};
      switch (message.method) {
        case 'Target.getTargets':
          result = { targetInfos: [{ targetId: 'page-ui', type: 'page', title: 'UI Mock', url: 'https://ui.example.test/', attached: false }] };
          break;
        case 'Target.attachToTarget':
          result = { sessionId: 'session-ui' };
          break;
        case 'Runtime.evaluate':
          result = { result: { value: { url: 'https://ui.example.test/', title: 'UI Mock' } } };
          break;
        case 'Page.getNavigationHistory':
          result = { currentIndex: 0, entries: [{ id: 1, url: 'https://ui.example.test/', title: 'UI Mock' }] };
          break;
        case 'Page.captureScreenshot':
          result = { data: jpegBase64 };
          break;
        case 'DOM.resolveNode':
          result = { object: { objectId: 'chooser-object' } };
          break;
        case 'Runtime.callFunctionOn':
          result = { result: { value: { accept: '.txt,.pdf', multiple: true, directory: false } } };
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
            method: 'Page.screencastFrame',
            sessionId: 'session-ui',
            params: {
              data: jpegBase64,
              sessionId: 9,
              metadata: {
                offsetTop: 12,
                pageScaleFactor: 1,
                deviceWidth: 412,
                deviceHeight: 732,
                scrollOffsetX: 0,
                scrollOffsetY: 0,
                timestamp: Date.now() / 1000
              }
            }
          }));
        }, 60);
      }
    });
  });
  await new Promise((resolve) => mock.once('listening', resolve));

  const token = 'browser-ui-test-token-123456';
  const controller = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(httpPort), PHONE_TOKEN: token, CDP_BROWSER_WS: `ws://127.0.0.1:${cdpPort}` },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let controllerOutput = '';
  controller.stdout.on('data', (chunk) => { controllerOutput += chunk.toString(); });
  controller.stderr.on('data', (chunk) => { controllerOutput += chunk.toString(); });

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-phone-ui-'));
  const screenshotPath = path.join(ROOT, 'test', 'fixtures', 'ui-preview.png');
  const chrome = spawn(chromium, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=412,915',
    `http://localhost:${httpPort}/?token=${encodeURIComponent(token)}`
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let chromeOutput = '';
  chrome.stdout.on('data', (chunk) => { chromeOutput += chunk.toString(); });
  chrome.stderr.on('data', (chunk) => { chromeOutput += chunk.toString(); });

  let pageCdp;
  try {
    console.log('browser-ui: waiting controller');
    await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${httpPort}/health`);
      return response.ok;
    }, 12000, 60, '控制器健康检查');
    console.log('browser-ui: waiting chromium target');
    const target = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${chromePort}/json/list`);
      const targets = await response.json();
      return targets.find((item) => item.type === 'page' && item.url.includes(`localhost:${httpPort}`));
    }, 15000, 60, 'Chromium 页面目标');

    pageCdp = new CdpClient(target.webSocketDebuggerUrl);
    await pageCdp.connect();
    await pageCdp.send('Runtime.enable');
    await pageCdp.send('Page.enable');
    console.log('browser-ui initial=', await pageCdp.evaluate(`({href: location.href, ready: document.readyState, title: document.title, body: document.body?.innerText?.slice(0,200), html: document.documentElement?.outerHTML?.slice(0,300)})`).catch((error) => ({error:error.message})));

    console.log('browser-ui: waiting app frame');
    let lastUiValue = null;
    let ui;
    try {
      ui = await waitFor(async () => {
      const value = await pageCdp.evaluate(`(() => ({
        ready: document.readyState,
        role: document.getElementById('roleBadge')?.textContent,
        emptyHidden: document.getElementById('emptyState')?.hidden,
        tokenInUrl: new URL(location.href).searchParams.has('token'),
        geometryLoaded: !!window.EdgePhoneGeometry,
        canvasVisibility: getComputedStyle(document.getElementById('screenCanvas')).visibility,
        address: document.getElementById('addressInput')?.value,
        gestureMode: document.getElementById('gestureModeSelect')?.value,
        inputMode: document.getElementById('inputModeSelect')?.value,
        computerSort: document.getElementById('computerSortSelect')?.value,
        hasGlobalHistory: Boolean(document.getElementById('browserHistoryModeButton')),
        calibrationProfile: document.getElementById('calibrationProfileLabel')?.textContent,
        hasQuickCalibration: Boolean(document.getElementById('quickCalibrationButton')),
        hasCalibrationTest: Boolean(document.getElementById('calibrationTestButton')),
        hasFullscreenDock: Boolean(document.getElementById('fullscreenDock')),
        calibrationStep: document.getElementById('calibrationStepSelect')?.value
      }))()`);
      lastUiValue = value;
      return value?.role === '正在控制' && value.emptyHidden ? value : null;
    }, 15000, 60, '手机 UI 首帧');
    } catch (error) {
      console.error('lastUiValue=', lastUiValue);
      console.error('pageExceptions=', pageCdp.exceptions);
      console.error('observed=', observed.map((item) => item.method));
      console.error('controllerOutput=', controllerOutput);
      console.error('chromeOutput=', chromeOutput.slice(-4000));
      throw error;
    }

    assert.strictEqual(ui.ready, 'complete');
    assert.strictEqual(ui.tokenInUrl, false, '令牌应从地址栏清除');
    assert.strictEqual(ui.geometryLoaded, true);
    assert.strictEqual(ui.address, 'https://ui.example.test/');
    assert.strictEqual(ui.gestureMode, 'direct', '通用模式首次默认应使用直接触摸与拖拽');
    assert.strictEqual(ui.inputMode, 'nativeTouch', '通用模式首次默认应使用原生触摸事件');
    assert.strictEqual(ui.computerSort, 'modified-desc');
    assert.strictEqual(ui.hasGlobalHistory, true);
    assert.ok(/普通模式|全屏/.test(ui.calibrationProfile || ''));
    assert.strictEqual(ui.hasQuickCalibration, true);
    assert.strictEqual(ui.hasCalibrationTest, true);
    assert.strictEqual(ui.hasFullscreenDock, true);
    assert.strictEqual(ui.calibrationStep, '0.25');
    assert.strictEqual(pageCdp.exceptions.length, 0, `页面异常: ${pageCdp.exceptions.join('; ')}`);

    const touchBefore = observed.filter((item) => item.method === 'Input.dispatchTouchEvent').length;
    await pageCdp.evaluate(`(() => {
      const stage = document.getElementById('stage');
      const rect = stage.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, pointerId: 17, pointerType: 'touch', isPrimary: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
      stage.dispatchEvent(new PointerEvent('pointerdown', init));
      stage.dispatchEvent(new PointerEvent('pointerup', init));
      return { width: rect.width, height: rect.height };
    })()`);
    await waitFor(() => observed.filter((item) => item.method === 'Input.dispatchTouchEvent').length >= touchBefore + 2, 5000, 60, '触摸注入');
    const touchCommands = observed.filter((item) => item.method === 'Input.dispatchTouchEvent').slice(-2);
    assert.strictEqual(touchCommands[0].params.type, 'touchStart');
    assert.strictEqual(touchCommands[1].params.type, 'touchEnd');
    assert.ok(touchCommands[0].params.touchPoints[0].x >= 0.5 && touchCommands[0].params.touchPoints[0].x <= 411.5);
    assert.ok(touchCommands[0].params.touchPoints[0].y >= 0.5 && touchCommands[0].params.touchPoints[0].y <= 699.5);

    // 单独切换到智能模式，验证上下滑动不会先形成长按选区；默认模式仍是上面验证过的 direct。
    await pageCdp.evaluate(`(() => {
      const select = document.getElementById('gestureModeSelect');
      select.value = 'smart';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    })()`);
    const scrollObservedAt = observed.length;
    await pageCdp.evaluate(`(() => {
      const stage = document.getElementById('stage');
      const rect = stage.getBoundingClientRect();
      const base = { bubbles: true, cancelable: true, pointerId: 18, pointerType: 'touch', isPrimary: true, clientX: rect.left + rect.width / 2 };
      stage.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientY: rect.top + rect.height * 0.72 }));
      stage.dispatchEvent(new PointerEvent('pointermove', { ...base, clientY: rect.top + rect.height * 0.48 }));
      stage.dispatchEvent(new PointerEvent('pointerup', { ...base, clientY: rect.top + rect.height * 0.48 }));
      return true;
    })()`);
    await waitFor(() => observed.slice(scrollObservedAt).some((item) => (item.method === 'Input.dispatchMouseEvent' || item.method === 'Input.emulateTouchFromMouseEvent') && item.params.type === 'mouseWheel'), 5000, 60, '智能滚动注入');
    const scrollInput = observed.slice(scrollObservedAt).filter((item) => item.method === 'Input.dispatchMouseEvent' || item.method === 'Input.emulateTouchFromMouseEvent');
    assert.ok(scrollInput.some((item) => item.params.type === 'mouseWheel'));
    assert.ok(!scrollInput.some((item) => item.params.type === 'mousePressed' || item.params.type === 'mouseReleased'), '智能滑动不能先按住网页，否则会触发长按文字选择');
    assert.ok(observed.slice(scrollObservedAt).some((item) => item.method === 'Runtime.evaluate' && /removeAllRanges/.test(item.params.expression || '')),
      '智能滑动开始时应清理非输入框中的残留文字选区');

    edgeSocket.send(JSON.stringify({
      method: 'Page.fileChooserOpened',
      sessionId: 'session-ui',
      params: { backendNodeId: 77, frameId: 'frame-1', mode: 'selectMultiple' }
    }));
    const uploadUi = await waitFor(async () => {
      const value = await pageCdp.evaluate(`(() => ({
        open: !document.getElementById('uploadOverlay').hidden,
        multiple: document.getElementById('phoneFiles').multiple,
        accept: document.getElementById('phoneFiles').getAttribute('accept'),
        computerVisible: !document.getElementById('computerFilePane').hidden,
        phoneHidden: document.getElementById('phoneFilePane').hidden,
        sourceLabel: document.getElementById('computerSourceButton').textContent,
        gestureMode: document.getElementById('gestureModeSelect').value
      }))()`);
      return value.open ? value : null;
    }, 5000, 60, '上传选择器 UI');
    assert.strictEqual(uploadUi.multiple, true);
    assert.strictEqual(uploadUi.accept, '.txt,.pdf');
    assert.strictEqual(uploadUi.computerVisible, true, '电脑文件应是默认上传来源');
    assert.strictEqual(uploadUi.phoneHidden, true);
    assert.strictEqual(uploadUi.sourceLabel, '电脑文件');
    assert.strictEqual(uploadUi.gestureMode, 'smart');

    const chooserEventCount = observed.filter((item) => item.method === 'DOM.resolveNode').length;
    edgeSocket.send(JSON.stringify({
      method: 'Page.fileChooserOpened',
      sessionId: 'session-ui',
      params: { backendNodeId: 77, frameId: 'frame-1', mode: 'selectMultiple' }
    }));
    await delay(260);
    const duplicateUi = await pageCdp.evaluate(`(() => ({
      open: !document.getElementById('uploadOverlay').hidden,
      computerVisible: !document.getElementById('computerFilePane').hidden
    }))()`);
    assert.strictEqual(duplicateUi.open, true);
    assert.strictEqual(duplicateUi.computerVisible, true);
    assert.strictEqual(observed.filter((item) => item.method === 'DOM.resolveNode').length, chooserEventCount,
      '同一文件选择器重复事件不应重新初始化事务');

    const cancelCommandAt = observed.length;
    await pageCdp.evaluate(`document.querySelector('[data-close="uploadOverlay"]').click()`);
    await waitFor(() => observed.slice(cancelCommandAt).some((item) => item.method === 'DOM.setFileInputFiles' && item.params.backendNodeId === 77 && Array.isArray(item.params.files) && item.params.files.length === 0), 5000, 60, '文件选择取消回传');
    await waitFor(async () => pageCdp.evaluate(`document.getElementById('uploadOverlay').hidden`), 5000, 60, '上传面板关闭');
    edgeSocket.send(JSON.stringify({
      method: 'Page.fileChooserOpened',
      sessionId: 'session-ui',
      params: { backendNodeId: 77, frameId: 'frame-1', mode: 'selectMultiple' }
    }));
    await delay(360);
    assert.strictEqual(await pageCdp.evaluate(`document.getElementById('uploadOverlay').hidden`), true,
      '取消后的迟到重复事件不能让上传面板循环弹出');

    await pageCdp.evaluate(`document.getElementById('settingsButton').click()`);
    const settingsOpen = await pageCdp.evaluate(`!document.getElementById('settingsOverlay').hidden`);
    assert.strictEqual(settingsOpen, true);

    const screenshot = await pageCdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    assert.ok(fs.statSync(screenshotPath).size > 1000);

    console.log('browser-ui.test.js: OK');
  } finally {
    pageCdp?.close();
    controller.kill('SIGTERM');
    chrome.kill('SIGTERM');
    await delay(800);
    try { controller.kill('SIGKILL'); } catch {}
    try { chrome.kill('SIGKILL'); } catch {}
    await new Promise((resolve) => mock.close(resolve));
    fs.rmSync(profileDir, { recursive: true, force: true });
    if (controller.exitCode && controller.exitCode !== 0) console.error(controllerOutput);
    if (chrome.exitCode && chrome.exitCode !== 0 && !/DevTools listening/.test(chromeOutput)) console.error(chromeOutput);
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
