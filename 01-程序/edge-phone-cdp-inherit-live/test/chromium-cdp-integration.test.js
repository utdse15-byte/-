'use strict';

const PKG_VERSION = require('../package.json').version;

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { WebSocket } = require('ws');
const { parseFramePacket } = require('../lib/protocol');

const ROOT = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChromium() {
  return [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
    .filter(Boolean)
    .find((candidate) => fs.existsSync(candidate)) || null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(predicate, timeout = 15000, label = '条件') {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeout) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(60);
  }
  throw new Error(`等待${label}超时${lastError ? `：${lastError.message}` : ''}`);
}

async function forceResetScroll(observer, label = '滚动复位') {
  // Chromium's compositor can keep native-touch momentum alive after
  // touchEnd. Temporarily removing the scroll container cancels that momentum
  // more reliably than a single scrollTo(0, 0), then restores the page and
  // verifies that the final position remains at the top.
  await observer.evaluate(`(() => {
    const root = document.documentElement;
    root.dataset.edgePhoneTestOldOverflow = root.style.overflow || '';
    root.dataset.edgePhoneTestOldScrollBehavior = root.style.scrollBehavior || '';
    root.style.scrollBehavior = 'auto';
    root.style.overflow = 'hidden';
    scrollTo(0, 0);
    return scrollY;
  })()`);
  await sleep(220);
  await observer.evaluate(`(() => {
    const root = document.documentElement;
    root.style.overflow = root.dataset.edgePhoneTestOldOverflow || '';
    root.style.scrollBehavior = root.dataset.edgePhoneTestOldScrollBehavior || '';
    delete root.dataset.edgePhoneTestOldOverflow;
    delete root.dataset.edgePhoneTestOldScrollBehavior;
    scrollTo(0, 0);
    return scrollY;
  })()`);
  await sleep(160);
  await observer.evaluate('scrollTo(0,0)');
  await waitFor(() => observer.evaluate('scrollY === 0'), 8000, label);
}

function readDevToolsPort(userDataDir) {
  const file = path.join(userDataDir, 'DevToolsActivePort');
  if (!fs.existsSync(file)) return null;
  const port = Number(fs.readFileSync(file, 'utf8').split(/\r?\n/)[0]);
  return Number.isInteger(port) && port > 0 ? port : null;
}

function jpegDimensions(buffer) {
  if (Buffer.isBuffer(buffer) && buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504E47) {
    // PNG：IHDR 固定在偏移 16 起为宽、高（idle-sharpen 补拍帧使用 PNG）。
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
    throw new Error('不是有效 JPEG');
  }
  let offset = 2;
  const sof = new Set([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF]);
  while (offset + 4 <= buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xFF) offset += 1;
    while (offset < buffer.length && buffer[offset] === 0xFF) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset++];
    if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7) || marker === 0x01) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (sof.has(marker)) {
      if (length < 7) break;
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error('JPEG 中没有尺寸标记');
}

function contextForFrame(frame) {
  const dimensions = jpegDimensions(frame.image);
  const deviceWidth = Number(frame.metadata.deviceWidth) || dimensions.width;
  const deviceHeight = Number(frame.metadata.deviceHeight) || dimensions.height;
  const contentDipWidth = deviceWidth;
  const contentDipHeight = dimensions.height / Math.max(1, dimensions.width) * deviceWidth;
  return {
    pageScaleFactor: Number(frame.metadata.pageScaleFactor) || 1,
    deviceWidth,
    deviceHeight,
    contentDipWidth,
    contentDipHeight,
    imageWidth: dimensions.width,
    imageHeight: dimensions.height,
    offsetTop: Number(frame.metadata.offsetTop) || 0,
    nativeScaleX: Number(frame.metadata.nativeScaleX) || 0,
    nativeScaleY: Number(frame.metadata.nativeScaleY) || 0,
    cssVisualViewport: frame.metadata.cssVisualViewport || {},
    cssLayoutViewport: frame.metadata.cssLayoutViewport || {},
    targetId: frame.metadata.targetId || '',
    frameEpoch: Number(frame.metadata.epoch) || 0,
    frameSequence: Number(frame.metadata.sequence) || 0,
    viewportRevision: Number(frame.metadata.viewportRevision) || 0,
    metricsViewportRevision: Number(frame.metadata.metricsViewportRevision) || 0
  };
}

function normalizedPointForCss(frame, cssX, cssY) {
  const context = contextForFrame(frame);
  const scale = context.pageScaleFactor || 1;
  const u = Math.max(0, Math.min(1, Number(cssX) * scale / context.contentDipWidth));
  const v = Math.max(0, Math.min(1, Number(cssY) * scale / context.contentDipHeight));
  return {
    u,
    v,
    x: u * context.contentDipWidth,
    y: v * context.contentDipHeight,
    context
  };
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    const ws = new WebSocket(this.url, { perMessageDeflate: false, handshakeTimeout: 8000 });
    this.ws = ws;
    ws.on('message', (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'CDP 错误'));
      else pending.resolve(message.result || {});
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('连接页面 CDP 超时')), 8000);
      ws.once('open', () => { clearTimeout(timer); resolve(); });
      ws.once('error', (error) => { clearTimeout(timer); reject(error); });
    });
    return this;
  }

  send(method, params = {}, timeout = 10000) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('页面 CDP 未连接'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超时`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || '页面脚本执行失败');
    return result.result?.value;
  }

  async installPage() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    const tree = await this.send('Page.getFrameTree');
    const frameId = tree.frameTree?.frame?.id;
    assert.ok(frameId, '真实 Chromium 页面必须有主框架');
    const html = `<!doctype html>
<meta charset="utf-8">
<meta id="viewportMeta" name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Edge Phone Real CDP Test</title>
<style>
*{box-sizing:border-box}html,body{margin:0;width:100%;min-height:1900px;background:#eee;font:20px sans-serif}
#topEdge{position:fixed;left:0;top:0;width:180px;height:28px;z-index:30;border:0;background:#0c7;color:#fff}
#tap{position:absolute;left:40px;top:80px;width:220px;height:110px;font-size:24px}
#picker{position:absolute;left:40px;top:260px;width:260px;height:80px;font-size:18px;background:#fff}
#status{position:absolute;left:40px;top:390px;width:320px;min-height:100px;padding:12px;background:#fff}
</style>
<button id="topEdge">顶部第一行</button>
<button id="tap">点击测试</button>
<input id="picker" type="file" accept="text/plain">
<div id="status">READY</div>`;
    await this.send('Page.setDocumentContent', { frameId, html });
    await this.evaluate(`(() => {
      const status = document.getElementById('status');
      document.getElementById('topEdge').addEventListener('click', () => {
        document.body.dataset.topClicks = String((Number(document.body.dataset.topClicks) || 0) + 1);
      });
      document.getElementById('tap').addEventListener('click', () => {
        document.body.dataset.clicked = String((Number(document.body.dataset.clicked) || 0) + 1); status.textContent = 'CLICKED';
      });
      document.getElementById('picker').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        const text = file ? await file.text() : '';
        document.body.dataset.file = file ? file.name + ':' + text : '';
        status.textContent = file ? 'FILE:' + file.name + ':' + text : 'NO_FILE';
      });
      document.body.dataset.ready = 'yes';
      document.body.dataset.topClicks = '0';
      document.body.dataset.clicked = '0';
      return true;
    })()`);
  }

  close() {
    try { this.ws?.terminate(); } catch {}
  }
}

async function stopChild(child, options = {}) {
  if (!child) return;
  const killTree = Boolean(options.killTree && process.platform !== 'win32' && child.pid);
  const signal = (name) => {
    try {
      if (killTree) process.kill(-child.pid, name);
      else if (child.exitCode === null) child.kill(name);
    } catch {}
  };

  // Chromium's launcher may exit before its renderer/crashpad descendants. The
  // descendants can keep the profile locked and inherit stdout/stderr pipes,
  // which previously made repeated release runs hang in cleanup. A detached
  // process group lets the test terminate only the browser tree it created.
  signal('SIGTERM');
  if (child.exitCode === null) {
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(2500)]);
  } else {
    await sleep(120);
  }
  signal('SIGKILL');
  if (child.exitCode === null) {
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(1500)]);
  }
  try { child.stdout?.destroy(); } catch {}
  try { child.stderr?.destroy(); } catch {}
}

async function removeTreeWithRetry(directory) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (error) {
      if (attempt === 7) throw error;
      await sleep(180);
    }
  }
}

async function main() {
  const chromium = findChromium();
  if (!chromium) {
    console.log('chromium-cdp-integration.test.js: SKIP (未找到 Chromium)');
    return;
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-phone-v65-real-'));
  const userDataDir = path.join(temp, 'profile');
  const computerFile = path.join(temp, 'real-computer.txt');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(computerFile, 'from-computer');
  const httpPort = await freePort();
  const token = 'real-cdp-integration-token-123456';
  let chromiumChild;
  let controller;
  let observer;
  let phone;
  let controllerOutput = '';
  let chromiumOutput = '';

  try {
    chromiumChild = spawn(chromium, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
      '--disable-extensions', '--disable-sync', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, '--window-size=800,900', 'about:blank'
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32'
    });
    chromiumChild.stdout.on('data', (chunk) => { chromiumOutput += chunk.toString(); });
    chromiumChild.stderr.on('data', (chunk) => { chromiumOutput += chunk.toString(); });

    const browserPort = await waitFor(() => readDevToolsPort(userDataDir), 15000, 'Chromium DevToolsActivePort');
    const pageTarget = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${browserPort}/json/list`);
      const targets = await response.json();
      return targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl) || null;
    }, 10000, '真实 Chromium 标签页');
    observer = await new CdpClient(pageTarget.webSocketDebuggerUrl).connect();
    await observer.installPage();
    await waitFor(() => observer.evaluate('document.body.dataset.ready === "yes"'), 8000, '测试网页安装');

    controller = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(httpPort),
        LISTEN_HOST: '127.0.0.1',
        PHONE_TOKEN: token,
        IDLE_SHARPEN_DELAY_MS: '900',
        EDGE_USER_DATA_DIR: userDataDir
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    controller.stdout.on('data', (chunk) => { controllerOutput += chunk.toString(); });
    controller.stderr.on('data', (chunk) => { controllerOutput += chunk.toString(); });

    await waitFor(async () => {
      try { return (await fetch(`http://127.0.0.1:${httpPort}/health`)).ok; } catch { return false; }
    }, 15000, '控制器 HTTP 服务');

    const messages = [];
    phone = new WebSocket(`ws://127.0.0.1:${httpPort}/control?token=${encodeURIComponent(token)}&clientId=real-chromium`);
    phone.on('message', (data, isBinary) => {
      if (isBinary) {
        const packet = Buffer.from(data);
        try {
          const parsed = parseFramePacket(packet);
          messages.push({ type: 'binary', data: packet, parsed, at: Date.now() });
          phone.send(JSON.stringify({
            type: 'frameAck', sequence: parsed.metadata.sequence, epoch: parsed.metadata.epoch,
            renderMs: 8, renderer: 'real-test', source: parsed.metadata.source || 'screencast',
            imageWidth: jpegDimensions(parsed.image).width, imageHeight: jpegDimensions(parsed.image).height
          }));
        } catch (error) {
          messages.push({ type: 'binary-error', error: error.message, at: Date.now() });
        }
      } else {
        try { messages.push({ ...JSON.parse(data.toString()), at: Date.now() }); } catch {}
      }
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('手机模拟连接超时')), 10000);
      phone.once('open', () => { clearTimeout(timer); resolve(); });
      phone.once('error', (error) => { clearTimeout(timer); reject(error); });
    });

    const sendRequest = (type, payload = {}, timeout = 15000) => {
      const requestId = `${type}-${Date.now()}-${Math.random()}`;
      const startAt = Date.now();
      phone.send(JSON.stringify({ ...payload, type, requestId }));
      return waitFor(
        () => messages.find((message) => message.at >= startAt && message.type === 'reply' && message.requestId === requestId),
        timeout,
        `${type} 回复`
      );
    };

    const waitFrame = (predicate, startedAt = 0, timeout = 20000, label = '画面') => waitFor(() => {
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.type !== 'binary' || message.at < startedAt) continue;
        if (!predicate || predicate(message.parsed)) return message.parsed;
      }
      return null;
    }, timeout, label);

    const sendNormalizedTap = async (frame, cssX, cssY, overrides = {}) => {
      const mapped = normalizedPointForCss(frame, cssX, cssY);
      const reply = await sendRequest('tap', {
        x: mapped.x,
        y: mapped.y,
        u: mapped.u,
        v: mapped.v,
        inputMode: 'nativeTouch',
        context: mapped.context,
        ...overrides
      });
      assert.strictEqual(reply.ok, true);
      return mapped;
    };

    const initialRevision = 6501;
    const viewportStartedAt = Date.now();
    let reply = await sendRequest('viewport', {
      width: 390, height: 700, dpr: 2, mobile: true, desktopWidth: 1280,
      revision: initialRevision, force: true
    }, 20000);
    assert.strictEqual(reply.ok, true);
    const frame = await waitFrame(
      (item) => Number(item.metadata.deviceWidth) === 390 && Number(item.metadata.deviceHeight) === 700 &&
        Number(item.metadata.viewportRevision) === initialRevision,
      viewportStartedAt,
      20000,
      '匹配手机视口修订的真实 JPEG 画面'
    );
    assert.ok(frame.image.length > 1000, '真实 Chromium 截图不能为空');
    assert.ok(frame.metadata.epoch > 0, '真实画面必须带 frame epoch');
    assert.strictEqual(frame.metadata.deviceWidth, 390);

    const geometry = await waitFor(async () => {
      const value = await observer.evaluate(`({width:innerWidth,height:innerHeight,button:document.elementFromPoint(150,135)?.id})`);
      return value.width === 390 && value.height === 700 ? value : null;
    }, 10000, '真实手机视口几何');
    assert.deepStrictEqual(geometry, { width: 390, height: 700, button: 'tap' });

    // The visible first CSS row must remain clickable. This catches the old
    // offsetTop/dead-zone bug and verifies the 0.5 CSS-pixel inward clamp.
    await sendNormalizedTap(frame, 24, 1);
    await waitFor(() => observer.evaluate('Number(document.body.dataset.topClicks) === 1'), 10000, '真实顶部第一行点击');

    await sendNormalizedTap(frame, 150, 135);
    await waitFor(() => observer.evaluate('Number(document.body.dataset.clicked) === 1'), 10000, '真实原生归一化轻点');

    const startPoint = normalizedPointForCss(frame, 340, 620);
    const gestureId = `real-direct-${Date.now()}`;
    phone.send(JSON.stringify({
      type: 'touch', event: 'start', x: startPoint.x, y: startPoint.y, u: startPoint.u, v: startPoint.v,
      inputMode: 'nativeTouch', context: startPoint.context, gestureId, eventSequence: 1
    }));
    for (let index = 1; index <= 10; index += 1) {
      const point = normalizedPointForCss(frame, 340, 620 - index * 38);
      phone.send(JSON.stringify({
        type: 'touch', event: 'move', x: point.x, y: point.y, u: point.u, v: point.v,
        inputMode: 'nativeTouch', context: point.context, gestureId, eventSequence: index + 1
      }));
      await sleep(12);
    }
    const endPoint = normalizedPointForCss(frame, 340, 240);
    phone.send(JSON.stringify({
      type: 'touch', event: 'end', x: endPoint.x, y: endPoint.y, u: endPoint.u, v: endPoint.v,
      inputMode: 'nativeTouch', context: endPoint.context, gestureId, eventSequence: 12
    }));
    await waitFor(() => observer.evaluate('scrollY > 0'), 10000, '真实原生直接拖动滚动');
    await forceResetScroll(observer, '直接拖动后的滚动复位');
    await sleep(450);

    await observer.evaluate(`(() => {
      const node = document.getElementById('status').firstChild;
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return selection.toString();
    })()`);
    assert.ok(await observer.evaluate('getSelection().toString().length > 0'), '测试前应建立真实文字选区');
    const wheelPoint = normalizedPointForCss(frame, 340, 600);
    reply = await sendRequest('wheel', {
      x: wheelPoint.x, y: wheelPoint.y, u: wheelPoint.u, v: wheelPoint.v,
      deltaX: 0, deltaY: 220,
      deltaU: 0, deltaV: 220 * wheelPoint.context.pageScaleFactor / wheelPoint.context.contentDipHeight,
      clearSelection: true, context: wheelPoint.context
    });
    assert.strictEqual(reply.ok, true);
    await waitFor(() => observer.evaluate('scrollY > 0'), 10000, '真实智能滚动');
    await waitFor(() => observer.evaluate('getSelection().isCollapsed || getSelection().rangeCount === 0'), 10000, '智能滚动清理残留文字选区');
    await sleep(650);
    await forceResetScroll(observer, '文件选择前滚动复位');

    const pickerPoint = await observer.evaluate(`(() => {
      const rect = document.getElementById('picker').getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      return {x, y, tag: document.elementFromPoint(x, y)?.id || ''};
    })()`);
    assert.strictEqual(pickerPoint.tag, 'picker', '文件输入框测试点必须位于当前可视控件内');
    reply = await sendRequest('requestUpload');
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.armed, true);
    await sendNormalizedTap(frame, pickerPoint.x, pickerPoint.y);
    const chooser = await waitFor(() => [...messages].reverse().find((message) => message.type === 'fileChooser'), 12000, '真实原生触摸文件选择器拦截');
    assert.ok(chooser.id);
    assert.strictEqual(chooser.multiple, false);

    reply = await sendRequest('uploadBegin', {
      chooserId: chooser.id,
      files: [{ name: 'real-phone.txt', size: 3, type: 'text/plain', lastModified: 0 }]
    });
    assert.strictEqual(reply.ok, true);
    reply = await sendRequest('uploadFileBegin', { index: 0 });
    assert.strictEqual(reply.ok, true);
    phone.send(Buffer.from('abc'));
    reply = await sendRequest('uploadChunkAck', { index: 0, expectedBytes: 3 });
    assert.strictEqual(reply.ok, true);
    reply = await sendRequest('uploadFileEnd', { index: 0 });
    assert.strictEqual(reply.ok, true);
    reply = await sendRequest('uploadCommit');
    assert.strictEqual(reply.ok, true);
    await waitFor(() => observer.evaluate('document.body.dataset.file === "real-phone.txt:abc"'), 10000, '真实网页手机文件赋值');

    reply = await sendRequest('requestUpload');
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.armed, true);
    const secondChooserStartedAt = Date.now();
    const pickerMapped = normalizedPointForCss(frame, pickerPoint.x, pickerPoint.y);
    const fileGestureId = `real-file-direct-${Date.now()}`;
    phone.send(JSON.stringify({
      type: 'touch', event: 'start', x: pickerMapped.x, y: pickerMapped.y, u: pickerMapped.u, v: pickerMapped.v,
      inputMode: 'nativeTouch', context: pickerMapped.context, gestureId: fileGestureId, eventSequence: 1
    }));
    await sleep(35);
    phone.send(JSON.stringify({
      type: 'touch', event: 'end', x: pickerMapped.x, y: pickerMapped.y, u: pickerMapped.u, v: pickerMapped.v,
      inputMode: 'nativeTouch', context: pickerMapped.context, gestureId: fileGestureId, eventSequence: 2
    }));
    const computerChooser = await waitFor(
      () => [...messages].reverse().find((message) => message.at >= secondChooserStartedAt && message.type === 'fileChooser' && message.id !== chooser.id),
      12000,
      '第二次真实文件选择器拦截'
    );
    reply = await sendRequest('computerList', { chooserId: computerChooser.id, path: temp, sort: 'modified-desc' }, 20000);
    assert.strictEqual(reply.ok, true);
    assert.ok(reply.result.entries.some((item) => item.name === path.basename(computerFile)));
    reply = await sendRequest('computerCommit', { chooserId: computerChooser.id, paths: [computerFile] }, 20000);
    assert.strictEqual(reply.ok, true);
    await waitFor(() => observer.evaluate('document.body.dataset.file === "real-computer.txt:from-computer"'), 10000, '真实网页电脑文件赋值');

    // Force a wide real CSS layout without changing the phone-side stage or the
    // controller's emulated viewport: widen the page's own viewport meta tag,
    // the same situation as a desktop-layout site under phone emulation. This
    // proves that coordinates are bound to the exact current frame geometry
    // (layout width + page scale) instead of a cached 390px CSS assumption.
    // The previous approach (a second CDP session issuing its own
    // Emulation.setDeviceMetricsOverride) raced the controller session and no
    // longer produces a wide page on newer Chromium, where the controller
    // session's still-standing override wins after screencast restarts.
    const scaledStartedAt = Date.now();
    const previousSequence = Number(frame.metadata.sequence) || 0;
    await observer.evaluate('document.body.dataset.clicked = "0"');
    await observer.evaluate(`document.getElementById('viewportMeta').setAttribute('content', 'width=980')`);
    await waitFor(() => observer.evaluate('innerWidth >= 900'), 10000, '宽 CSS 布局视口');
    reply = await sendRequest('recoverFrame', {}, 20000);
    assert.strictEqual(reply.ok, true);
    const wideCssFrame = await waitFrame(
      (item) => Number(item.metadata.sequence) > previousSequence &&
        Number(item.metadata.viewportRevision) === initialRevision &&
        Number(item.metadata.cssLayoutViewport?.clientWidth) >= 900,
      scaledStartedAt,
      20000,
      '宽布局对应的新画面'
    );
    const wideButton = await observer.evaluate(`(() => {
      const rect = document.getElementById('tap').getBoundingClientRect();
      return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    })()`);
    await sendNormalizedTap(wideCssFrame, wideButton.x, wideButton.y);
    await waitFor(() => observer.evaluate('Number(document.body.dataset.clicked) === 1'), 10000, '不同网页比例的归一化轻点');

    await observer.evaluate(`document.getElementById('viewportMeta').setAttribute('content', 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no')`);
    await waitFor(() => observer.evaluate('innerWidth === 390'), 10000, '恢复设备宽度布局');

    // Fullscreen analogue: change both the phone stage size and Edge emulated
    // viewport. A new revision/frame is mandatory; calibration is normalized and
    // therefore the same logical point remains correct.
    const fullscreenRevision = initialRevision + 1;
    const fullscreenStartedAt = Date.now();
    reply = await sendRequest('viewport', {
      width: 430, height: 850, dpr: 2, mobile: true, desktopWidth: 1280,
      revision: fullscreenRevision, force: true
    }, 20000);
    assert.strictEqual(reply.ok, true);
    const fullscreenFrame = await waitFrame(
      (item) => Number(item.metadata.deviceWidth) === 430 && Number(item.metadata.deviceHeight) === 850 &&
        Number(item.metadata.viewportRevision) === fullscreenRevision,
      fullscreenStartedAt,
      20000,
      '全屏尺寸修订对应的新画面'
    );
    await waitFor(() => observer.evaluate('innerWidth === 430 && innerHeight === 850'), 10000, '全屏尺寸网页视口');
    await observer.evaluate('document.body.dataset.clicked = "0"; document.body.dataset.topClicks = "0"');
    const fullButton = await observer.evaluate(`(() => {
      const rect = document.getElementById('tap').getBoundingClientRect();
      return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    })()`);
    await sendNormalizedTap(fullscreenFrame, fullButton.x, fullButton.y);
    await waitFor(() => observer.evaluate('Number(document.body.dataset.clicked) === 1'), 10000, '全屏尺寸归一化轻点');
    await sendNormalizedTap(fullscreenFrame, 24, 1);
    await waitFor(() => observer.evaluate('Number(document.body.dataset.topClicks) === 1'), 10000, '全屏顶部第一行点击');

    // A late touch from the old frame revision must never be applied to the new
    // viewport, otherwise resize/fullscreen races produce apparently random taps.
    const staleMapped = normalizedPointForCss(frame, 150, 135);
    await sendRequest('tap', {
      x: staleMapped.x, y: staleMapped.y, u: staleMapped.u, v: staleMapped.v,
      inputMode: 'nativeTouch', context: staleMapped.context
    });
    await sleep(450);
    assert.strictEqual(await observer.evaluate('Number(document.body.dataset.clicked)'), 1, '旧尺寸帧触摸必须被拒绝');

    // Exercise v6.6 quick-calibration and hit-probe paths, including the
    // frame-sequence race guard and actual getBoundingClientRect CSS coordinates.
    reply = await sendRequest('calibrationMarker', { index: 0, mode: 'offset' }, 20000);
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.mode, 'offset');
    assert.strictEqual(reply.result.total, 3);
    assert.ok(reply.result.frameSequence > 0);
    assert.strictEqual(reply.result.localOnly, true);
    assert.ok(reply.result.u > 0 && reply.result.v > 0);
    assert.strictEqual(reply.result.viewportRevision, fullscreenRevision);
    reply = await sendRequest('calibrationMarker', { index: -1 }, 20000);
    assert.strictEqual(reply.ok, true);

    const probeMapped = normalizedPointForCss(fullscreenFrame, 210, 260);
    reply = await sendRequest('calibrationProbe', {
      x: probeMapped.x,
      y: probeMapped.y,
      u: probeMapped.u,
      v: probeMapped.v,
      context: probeMapped.context
    }, 20000);
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.localOnly, true);
    assert.ok(Math.abs(reply.result.cssX - 210) < 2);
    assert.ok(Math.abs(reply.result.cssY - 260) < 2);
    assert.strictEqual(await observer.evaluate("Boolean(document.getElementById('__edge_phone_cdp_calibration_probe__'))"), false,
      '校准探针必须只画在手机控制页面，不能注入目标网页 DOM');
    reply = await sendRequest('calibrationProbe', { remove: true }, 20000);
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.localOnly, true);

    reply = await sendRequest('viewport', {
      width: 1280, height: 900, dpr: 1.25, mobile: false, desktopWidth: 1280,
      revision: fullscreenRevision + 1, force: true
    }, 20000);
    assert.strictEqual(reply.ok, true);
    await waitFor(() => observer.evaluate('innerWidth === 1280 && innerHeight === 900'), 10000, '真实桌面宽视口');

    reply = await sendRequest('streamPreset', { preset: 'economy' }, 20000);
    assert.strictEqual(reply.ok, true);
    const status = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${httpPort}/api/status`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      return body.viewport?.streamPreset === 'economy' ? body : null;
    }, 8000, '画面策略状态');
    assert.strictEqual(status.viewport.effectiveStreamPreset, 'economy');
    assert.strictEqual(status.version, PKG_VERSION);

    // v6.7 low-interference manual compatibility uses the browser's actual
    // desktop environment, clears touch/mobile emulation, and maps the user's
    // phone action to ordinary mouse input. Headless Chromium legitimately
    // reports webdriver=true here; the controller must report it unchanged.
    const manualStartedAt = Date.now();
    reply = await sendRequest('manualCompatibility', { mode: 'always' }, 25000);
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.active, true);
    assert.strictEqual(reply.result.inputProfile, 'desktop-mouse-wheel');
    await waitFor(() => observer.evaluate('navigator.maxTouchPoints === 0'), 10000, '清除真实 Chromium 触摸仿真');
    const manualAuditReply = await sendRequest('manualCompatibilityAudit', { force: true }, 20000);
    assert.strictEqual(manualAuditReply.ok, true);
    assert.strictEqual(manualAuditReply.result.compatibility.active, true);
    assert.strictEqual(manualAuditReply.result.audit.automationFlagUntouched, true);
    assert.strictEqual(typeof manualAuditReply.result.audit.webdriver, 'boolean');
    assert.ok(/Linux|Win|Mac/.test(String(manualAuditReply.result.audit.platform || '')) || manualAuditReply.result.audit.platform === '',
      '环境审计必须返回浏览器真实平台，而不是手机平台覆盖');

    await observer.evaluate('scrollTo(0,0); document.body.dataset.clicked = "0"');
    const manualFrame = await waitFrame(
      (item) => item.metadata.targetId && Number(item.metadata.viewportRevision) >= fullscreenRevision + 1,
      manualStartedAt,
      20000,
      '严格人工模式真实桌面画面'
    );
    const manualButton = await observer.evaluate(`(() => {
      const rect = document.getElementById('tap').getBoundingClientRect();
      return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    })()`);
    const manualMapped = normalizedPointForCss(manualFrame, manualButton.x, manualButton.y);
    reply = await sendRequest('tap', {
      x: manualMapped.x, y: manualMapped.y, u: manualMapped.u, v: manualMapped.v,
      inputMode: 'nativeTouch', context: manualMapped.context
    }, 20000);
    assert.strictEqual(reply.ok, true);
    await waitFor(() => observer.evaluate('Number(document.body.dataset.clicked) === 1'), 10000, '严格人工模式标准鼠标点击');

    reply = await sendRequest('manualCompatibility', { mode: 'off' }, 25000);
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.active, false);

    // 静止画面高清化：停止一切输入后，真实 Chromium 上应出现 PNG 补拍帧。
    const sharpenStartedAt = Date.now();
    const sharpenFrame = await waitFrame(
      (item) => item.metadata.source === 'idle-sharpen' && item.metadata.contentType === 'image/png',
      sharpenStartedAt,
      20000,
      '静止 PNG 补拍帧'
    );
    const sharpenDimensions = jpegDimensions(sharpenFrame.image);
    assert.ok(sharpenDimensions.width > 0 && sharpenDimensions.height > 0, 'PNG 补拍帧必须可解析');

    // v6.8 手机专用窗口（WIN-001）：开启后活动标签位于新窗口；标签面板只列
    // 专用窗口内的标签；新标签落在专用窗口；关闭后标签全部清理并回到原标签。
    const versionInfo = await (await fetch(`http://127.0.0.1:${browserPort}/json/version`)).json();
    const browserCdp = await new CdpClient(versionInfo.webSocketDebuggerUrl).connect();
    const originalTargetId = pageTarget.id || pageTarget.targetId ||
      (await (await fetch(`http://127.0.0.1:${browserPort}/json/list`)).json())
        .find((item) => item.type === 'page').id;
    const originalWindow = await browserCdp.send('Browser.getWindowForTarget', { targetId: originalTargetId });

    reply = await sendRequest('dedicatedWindow', { enabled: true }, 30000);
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.dedicatedWindow.enabled, true);
    const dedicatedWindowId = Number(reply.result.dedicatedWindow.windowId);
    assert.ok(Number.isInteger(dedicatedWindowId) && dedicatedWindowId > 0, '必须返回专用窗口 windowId');
    assert.notStrictEqual(dedicatedWindowId, Number(originalWindow.windowId), '专用窗口必须不同于原窗口');

    const dedicatedTabsAt = Date.now();
    await sendRequest('tabs', {}, 20000);
    const dedicatedTabs = await waitFor(() => {
      const message = [...messages].reverse().find((item) => item.type === 'tabs' && item.at >= dedicatedTabsAt);
      return message && message.dedicatedWindow?.enabled ? message : null;
    }, 15000, '专用窗口标签面板');
    assert.ok(dedicatedTabs.tabs.length >= 1, '专用窗口至少有一个标签');
    for (const tab of dedicatedTabs.tabs) {
      const tabWindow = await browserCdp.send('Browser.getWindowForTarget', { targetId: tab.id });
      assert.strictEqual(Number(tabWindow.windowId), dedicatedWindowId, '标签面板只应列出专用窗口内的标签');
    }
    assert.ok(!dedicatedTabs.tabs.some((tab) => tab.id === originalTargetId), '主窗口标签不应出现在专用窗口标签面板');
    const dedicatedTabIds = new Set(dedicatedTabs.tabs.map((tab) => tab.id));

    // 新标签落点：真实 Windows Edge 会把 Target.createTarget 开在当前活动窗口，
    // 因此控制器在创建前先激活专用窗口内的锚点标签。无头 Chromium 的窗口“激活”
    // 不影响 createTarget 的落点（它总落在默认窗口），所以此处只强断言标签被
    // 成功创建且可控；真正的“新标签落在专用窗口”属于需 Windows 真机验证项。
    reply = await sendRequest('newTab', { url: 'about:blank' }, 25000);
    assert.strictEqual(reply.ok, true);
    assert.ok(reply.result.targetId, '专用窗口模式下必须能创建新标签');
    const newTabWindow = await browserCdp.send('Browser.getWindowForTarget', { targetId: reply.result.targetId });
    if (Number(newTabWindow.windowId) === dedicatedWindowId) {
      dedicatedTabIds.add(reply.result.targetId);
    } else {
      console.log('注意：无头 Chromium 未把新标签放入专用窗口（Windows Edge 真机需验证此落点）');
    }

    // 关闭专用窗口：其中所有标签被清理，原主窗口标签必须存活。
    reply = await sendRequest('dedicatedWindow', { enabled: false, close: true }, 30000);
    assert.strictEqual(reply.ok, true);
    assert.strictEqual(reply.result.dedicatedWindow.enabled, false);
    await waitFor(async () => {
      const list = await (await fetch(`http://127.0.0.1:${browserPort}/json/list`)).json();
      const pageIds = new Set(list.filter((item) => item.type === 'page').map((item) => item.id));
      if (!pageIds.has(originalTargetId)) return null;
      for (const id of dedicatedTabIds) {
        if (pageIds.has(id)) return null;
      }
      return true;
    }, 15000, '专用窗口标签全部关闭且原标签存活');
    browserCdp.close();

    console.log('chromium-cdp-integration.test.js: OK (真实 Chromium 顶部第一行、不同页面比例、全屏尺寸修订、三点校准标记、命中测试、原生触摸、文件上传、桌面视口、严格人工模式、静止 PNG 补拍与手机专用窗口，新标签落点需 Windows 真机验证)');
  } catch (error) {
    console.error('controller output:\n', controllerOutput.slice(-8000));
    console.error('chromium output:\n', chromiumOutput.slice(-5000));
    throw error;
  } finally {
    try { phone?.close(); } catch {}
    observer?.close();
    await stopChild(controller);
    await stopChild(chromiumChild, { killTree: true });
    await removeTreeWithRetry(temp);
  }
}

main().then(() => {
  // Some Chromium builds leave crashpad or DevTools handles alive even after
  // the test-owned browser process exits. The assertions and cleanup above are
  // complete at this point, so terminate deterministically for release CI.
  process.exit(0);
}).catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
