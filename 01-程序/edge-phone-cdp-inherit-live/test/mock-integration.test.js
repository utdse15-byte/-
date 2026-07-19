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

function waitFor(predicate, timeout = 10000, interval = 40) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const result = await predicate();
        if (result) return resolve(result);
      } catch {}
      if (Date.now() - started > timeout) return reject(new Error('等待条件超时'));
      setTimeout(tick, interval);
    };
    tick();
  });
}

async function main() {
  const cdpPort = await freePort();
  const httpPort = await freePort();
  const observedMethods = [];
  const observedMessages = [];
  let rejectedOptimizeForSpeed = false;
  let delayNextCapture = false;
  let delayedStreamSessionId = 100;
  let delayNextInputResponse = false;
  let inputResponseHeld = false;
  const mock = new WebSocketServer({ port: cdpPort, host: '127.0.0.1' });
  let mockBrowserSocket = null;

  mock.on('connection', (socket) => {
    mockBrowserSocket = socket;
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      observedMethods.push(message.method);
      observedMessages.push(message);
      let result = {};
      let responseError = null;
      if (message.method === 'Page.captureScreenshot' && message.params?.optimizeForSpeed && !rejectedOptimizeForSpeed) {
        rejectedOptimizeForSpeed = true;
        responseError = { code: -32602, message: 'Invalid parameter optimizeForSpeed' };
      }
      switch (message.method) {
        case 'Target.getTargets':
          result = {
            targetInfos: [{
              targetId: 'page-1',
              type: 'page',
              title: 'Mock Page',
              url: 'https://example.test/',
              attached: false
            }]
          };
          break;
        case 'Target.attachToTarget':
          result = { sessionId: 'session-1' };
          break;
        case 'Runtime.evaluate':
          if (String(message.params?.expression || '').includes('__edge_phone_cdp_calibration_marker__') &&
              String(message.params?.expression || '').includes('return {')) {
            result = { result: { value: {
              ok: true,
              cssX: 156,
              cssY: 280,
              viewportWidth: 975,
              viewportHeight: 1750,
              u: 0.16,
              v: 0.16
            } } };
          } else {
            result = { result: { value: { url: 'https://example.test/', title: 'Mock Page', visibilityState: 'visible', hidden: false, focused: true } } };
          }
          break;
        case 'DOM.resolveNode':
          result = { object: { objectId: 'file-input-object' } };
          break;
        case 'Runtime.callFunctionOn':
          result = { result: { value: { accept: '', multiple: false, directory: false } } };
          break;
        case 'Page.getNavigationHistory':
          result = {
            currentIndex: 1,
            entries: [
              { id: 1, url: 'https://example.test/first', title: 'First', transitionType: 'typed' },
              { id: 2, url: 'https://example.test/', title: 'Mock Page', transitionType: 'link' },
              { id: 3, url: 'https://example.test/next', title: 'Next', transitionType: 'link' }
            ]
          };
          break;
        case 'Page.getLayoutMetrics':
          result = {
            cssLayoutViewport: { pageX: 0, pageY: 0, clientWidth: 975, clientHeight: 1750 },
            cssVisualViewport: { offsetX: 0, offsetY: 0, pageX: 0, pageY: 0, clientWidth: 975, clientHeight: 1750, scale: 0.4 },
            cssContentSize: { x: 0, y: 0, width: 975, height: 2400 }
          };
          break;
        case 'Page.captureScreenshot':
          result = { data: jpegBase64 };
          break;
        default:
          result = {};
          break;
      }
      const response = responseError ? { id: message.id, error: responseError } : { id: message.id, result };
      if (message.sessionId) response.sessionId = message.sessionId;

      // 模拟“截图请求先开始、连续帧先返回、旧截图后返回”。服务端应丢弃
      // 这张被连续帧超越的截图，否则手机会在两个页面状态之间来回闪。
      // 测试触摸队列竞态：让一个不产生用户激活的 move 命令占住队列，
      // 随后把新的 start 排在后面，并在 start 真正发给 Chromium 之前送达
      // fileChooserOpened。服务端必须在收到手机 start 消息时同步登记激活。
      if (message.method === 'Input.emulateTouchFromMouseEvent' && delayNextInputResponse && !responseError) {
        delayNextInputResponse = false;
        inputResponseHeld = true;
        setTimeout(() => {
          inputResponseHeld = false;
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(response));
        }, 420);
        return;
      }

      if (message.method === 'Page.captureScreenshot' && delayNextCapture && !responseError) {
        delayNextCapture = false;
        const streamSessionId = ++delayedStreamSessionId;
        setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify({
            method: 'Page.screencastFrame',
            sessionId: 'session-1',
            params: {
              data: jpegBase64,
              sessionId: streamSessionId,
              metadata: {
                offsetTop: 8,
                pageScaleFactor: 1,
                deviceWidth: 412,
                deviceHeight: 732,
                scrollOffsetX: 0,
                scrollOffsetY: 0,
                timestamp: Date.now() / 1000
              }
            }
          }));
        }, 20);
        setTimeout(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(response));
        }, 140);
        return;
      }

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
                offsetTop: 8,
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
      if (message.method === 'Page.setInterceptFileChooserDialog' && message.params?.enabled === true) {
        setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify({
            method: 'Page.fileChooserOpened',
            sessionId: 'session-1',
            params: {
              frameId: 'frame-1',
              backendNodeId: 42,
              mode: 'selectSingle'
            }
          }));
        }, 80);
      }
    });
  });
  await new Promise((resolve) => mock.once('listening', resolve));

  const token = 'integration-test-token-123456';
  const computerTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-phone-computer-pick-'));
  const computerTempFile = path.join(computerTempDir, '电脑文件测试.txt');
  fs.writeFileSync(computerTempFile, 'computer-file');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(httpPort),
      PHONE_TOKEN: token,
      IDLE_SHARPEN_ENABLED: '0',
      CDP_BROWSER_WS: `ws://127.0.0.1:${cdpPort}`
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  let phone;
  try {
    const health = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${httpPort}/health`);
      if (!response.ok) return false;
      return response.json();
    }, 12000);
    assert.strictEqual(health.service, 'edge-phone-cdp-controller');
    assert.strictEqual(health.version, '6.7.0');

    const statusResponse = await fetch(`http://127.0.0.1:${httpPort}/api/status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(statusResponse.status, 200);

    phone = new WebSocket(`ws://127.0.0.1:${httpPort}/control?token=${encodeURIComponent(token)}&clientId=integration`);
    phone.binaryType = 'nodebuffer';
    const texts = [];
    let framePacket = null;
    phone.on('message', (data, isBinary) => {
      if (isBinary) {
        framePacket = Buffer.from(data);
        try {
          const received = parseFramePacket(framePacket);
          phone.send(JSON.stringify({
            type: 'frameAck',
            sequence: received.metadata.sequence,
            renderMs: 9.5,
            renderer: 'test',
            source: received.metadata.source || 'screencast',
            imageWidth: 412,
            imageHeight: 732,
            epoch: received.metadata.epoch
          }));
        } catch {}
      } else texts.push(JSON.parse(data.toString()));
    });
    await new Promise((resolve, reject) => {
      phone.once('open', resolve);
      phone.once('error', reject);
    });

    await waitFor(() => framePacket && texts.some((item) => item.type === 'hello'), 12000);
    const parsed = parseFramePacket(framePacket);
    assert.ok(parsed.image.length > 100, '应收到 JPEG 画面');
    assert.strictEqual(parsed.metadata.deviceWidth, 412);
    assert.ok(parsed.metadata.epoch > 0, '每帧都必须包含画面代际');
    assert.strictEqual(parsed.metadata.targetId, 'page-1');
    const hello = texts.find((item) => item.type === 'hello');
    assert.deepStrictEqual(hello.limits.streamPresets, ['auto', 'economy', 'realtime', 'balanced', 'clear']);
    assert.strictEqual(hello.limits.followDesktopTabs, true);
    assert.ok(hello.limits.desktopWidth >= 800);
    assert.strictEqual(hello.limits.computerFilePicker, true);
    assert.ok(hello.limits.maxComputerFiles >= 1);
    const pageEnable = observedMessages.find((item) => item.method === 'Page.enable');
    assert.ok(pageEnable, '必须启用 Page 以接收画面和导航事件');
    assert.deepStrictEqual(pageEnable.params || {}, {}, '空闲初始化不得附加文件选择或其他多余 Page.enable 参数');
    assert.ok(rejectedOptimizeForSpeed, '应测试 captureScreenshot 参数兼容回退');

    const requestId = 'ping-1';
    phone.send(JSON.stringify({ type: 'ping', requestId }));
    const pingReply = await waitFor(() => texts.find((item) => item.type === 'reply' && item.requestId === requestId), 5000);
    assert.strictEqual(pingReply.ok, true);

    const sendRequest = (type, payload = {}, timeout = 8000) => {
      const id = `test-${type}-${Date.now()}-${Math.random()}`;
      phone.send(JSON.stringify({ ...payload, type, requestId: id }));
      return waitFor(() => texts.find((item) => item.type === 'reply' && item.requestId === id), timeout);
    };

    const pageState = await waitFor(() => texts.find((item) => item.type === 'pageState' && item.history?.entries?.length === 3), 8000);
    assert.strictEqual(pageState.canGoBack, true);
    assert.strictEqual(pageState.canGoForward, true);
    assert.strictEqual(pageState.history.entries.find((entry) => entry.current)?.id, 2);
    const historyReply = await sendRequest('navigateHistoryEntry', { entryId: 3 });
    assert.strictEqual(historyReply.ok, true);
    assert.ok(observedMessages.some((item) => item.method === 'Page.navigateToHistoryEntry' && item.params.entryId === 3));

    phone.send(JSON.stringify({ type: 'viewport', requestId: 'viewport-1', width: 390, height: 700, dpr: 2, mobile: true, desktopWidth: 1280 }));
    await waitFor(() => texts.find((item) => item.type === 'reply' && item.requestId === 'viewport-1'), 8000);
    assert.ok(observedMethods.includes('Emulation.setDeviceMetricsOverride'));
    assert.ok(observedMethods.includes('Page.startScreencast'));
    assert.ok(observedMethods.includes('Input.emulateTouchFromMouseEvent') === false);

    const desktopReply = await sendRequest('viewport', { width: 1280, height: 900, dpr: 1.25, mobile: false, desktopWidth: 1280 }, 12000);
    assert.strictEqual(desktopReply.ok, true);
    const desktopMetrics = observedMessages.filter((item) => item.method === 'Emulation.setDeviceMetricsOverride').at(-1);
    assert.strictEqual(desktopMetrics.params.width, 1280);
    assert.strictEqual(desktopMetrics.params.height, 900);
    assert.strictEqual(desktopMetrics.params.mobile, false);

    const presetReply = await sendRequest('streamPreset', { preset: 'economy' }, 12000);
    assert.strictEqual(presetReply.ok, true);
    await waitFor(() => observedMessages.some((item) => item.method === 'Page.startScreencast' && item.params.quality === 44 && item.params.everyNthFrame === 2), 5000);

    const inputBefore = observedMessages.filter((item) => item.method === 'Input.emulateTouchFromMouseEvent').length;
    phone.send(JSON.stringify({ type: 'touch', event: 'start', x: 100, y: 120, inputMode: 'devtools' }));
    for (let index = 0; index < 20; index += 1) {
      phone.send(JSON.stringify({ type: 'touch', event: 'move', x: 100 + index, y: 120 + index, inputMode: 'devtools' }));
    }
    phone.send(JSON.stringify({ type: 'touch', event: 'end', x: 125, y: 145, inputMode: 'devtools' }));
    await waitFor(() => observedMessages.filter((item) => item.method === 'Input.emulateTouchFromMouseEvent').length >= inputBefore + 3, 5000);
    const touchMessages = observedMessages.filter((item) => item.method === 'Input.emulateTouchFromMouseEvent').slice(inputBefore);
    assert.strictEqual(touchMessages[0].params.type, 'mousePressed');
    assert.strictEqual(touchMessages.at(-1).params.type, 'mouseReleased');
    assert.ok(touchMessages.some((item) => item.params.type === 'mouseMoved'));
    assert.ok(touchMessages.length < 22, '连续移动点应被合并，避免输入队列积压');

    const nativeBefore = observedMessages.filter((item) => item.method === 'Input.dispatchTouchEvent').length;
    const nativeContext = {
      pageScaleFactor: 0.4,
      offsetTop: 0,
      deviceWidth: 390,
      deviceHeight: 700,
      nativeScaleX: 0.4,
      nativeScaleY: 0.4,
      targetId: 'page-1',
      cssVisualViewport: { offsetX: 0, offsetY: 0, clientWidth: 975, clientHeight: 1750, scale: 0.4 }
    };
    phone.send(JSON.stringify({ type: 'touch', event: 'start', x: 195, y: 200, inputMode: 'nativeTouch', context: nativeContext, gestureId: 'native-1', eventSequence: 1 }));
    phone.send(JSON.stringify({ type: 'touch', event: 'end', x: 195, y: 200, inputMode: 'nativeTouch', context: nativeContext, gestureId: 'native-1', eventSequence: 2 }));
    await waitFor(() => observedMessages.filter((item) => item.method === 'Input.dispatchTouchEvent').length >= nativeBefore + 2, 5000);
    const nativeStart = observedMessages.filter((item) => item.method === 'Input.dispatchTouchEvent').slice(nativeBefore).find((item) => item.params.type === 'touchStart');
    assert.ok(nativeStart, '原生触摸必须发送 touchStart');
    assert.ok(Math.abs(nativeStart.params.touchPoints[0].x - 487.5) < 0.01, `原生 X 坐标应按 CSS 视口修正，实际 ${nativeStart.params.touchPoints[0].x}`);
    assert.ok(Math.abs(nativeStart.params.touchPoints[0].y - 500) < 0.01, `原生 Y 坐标应按 CSS 视口修正，实际 ${nativeStart.params.touchPoints[0].y}`);

    const smartTapBefore = observedMessages.filter((item) => item.method === 'Input.emulateTouchFromMouseEvent').length;
    const smartTapReply = await sendRequest('tap', { x: 88, y: 99, inputMode: 'devtools' });
    assert.strictEqual(smartTapReply.ok, true);
    await waitFor(() => observedMessages.filter((item) => item.method === 'Input.emulateTouchFromMouseEvent').length >= smartTapBefore + 2, 5000);
    const smartTapCommands = observedMessages.filter((item) => item.method === 'Input.emulateTouchFromMouseEvent').slice(-2);
    assert.deepStrictEqual(smartTapCommands.map((item) => item.params.type), ['mousePressed', 'mouseReleased']);
    assert.ok(smartTapCommands.every((item) => item.params.clickCount === 1), '智能轻点必须是短促点击，而不是持续按住');

    const wheelObservedAt = observedMessages.length;
    const wheelReply = await sendRequest('wheel', { x: 100, y: 120, deltaX: 0, deltaY: 180, clearSelection: true });
    assert.strictEqual(wheelReply.ok, true);
    const wheelCommand = observedMessages.filter((item) => item.method === 'Input.dispatchMouseEvent' || item.method === 'Input.emulateTouchFromMouseEvent').at(-1);
    assert.strictEqual(wheelCommand.params.type, 'mouseWheel');
    assert.ok(observedMessages.slice(wheelObservedAt).some((item) => item.method === 'Runtime.evaluate' && /removeAllRanges/.test(item.params.expression || '')),
      '智能滚动应清理残留文字选择，但不对输入框内容做选择清理');

    phone.send(JSON.stringify({
      type: 'frameAck', sequence: parsed.metadata.sequence, renderMs: 14.2,
      renderer: 'image', source: 'screencast', imageWidth: 412, imageHeight: 720, epoch: parsed.metadata.epoch
    }));
    await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${httpPort}/api/status`, { headers: { Authorization: `Bearer ${token}` } });
      const status = await response.json();
      return Number(status.phones?.[0]?.lastFrameAck?.sequence || 0) >= parsed.metadata.sequence;
    }, 5000);

    const frameResponse = await fetch(`http://127.0.0.1:${httpPort}/api/frame.jpg?fresh=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(frameResponse.status, 200);
    assert.strictEqual(frameResponse.headers.get('content-type'), 'image/jpeg');
    assert.ok(frameResponse.headers.get('x-epc-metadata'));

    await sleep(220);
    delayNextCapture = true;
    const staleSnapshotResponse = await fetch(`http://127.0.0.1:${httpPort}/api/frame.jpg?fresh=1&stale-test=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(staleSnapshotResponse.status, 200);
    const staleMetadataHeader = staleSnapshotResponse.headers.get('x-epc-metadata');
    assert.ok(staleMetadataHeader);
    const staleMetadata = JSON.parse(Buffer.from(staleMetadataHeader, 'base64url').toString('utf8'));
    assert.ok(String(staleMetadata.source || '').startsWith('screencast'), '较晚返回的旧截图不能覆盖更新的连续帧');

    const uploadArmReply = await sendRequest('requestUpload');
    assert.strictEqual(uploadArmReply.ok, true);
    assert.strictEqual(uploadArmReply.result.armed, true);
    assert.ok(observedMessages.some((item) => item.method === 'Page.setInterceptFileChooserDialog' && item.params?.enabled === true),
      '文件选择拦截只能在用户主动点上传后按需开启');
    const chooserMessage = await waitFor(() => texts.find((item) => item.type === 'fileChooser'), 8000);
    const chooserCountBeforeDuplicate = texts.filter((item) => item.type === 'fileChooser').length;
    mockBrowserSocket.send(JSON.stringify({
      method: 'Page.fileChooserOpened',
      sessionId: 'session-1',
      params: { frameId: 'frame-1', backendNodeId: 42, mode: 'selectSingle' }
    }));
    await sleep(260);
    assert.strictEqual(texts.filter((item) => item.type === 'fileChooser').length, chooserCountBeforeDuplicate,
      '同一个文件选择器的重复事件不能反复打开上传面板');

    let computerReply = await sendRequest('computerRoots', { chooserId: chooserMessage.id });
    assert.strictEqual(computerReply.ok, true);
    assert.ok(Array.isArray(computerReply.result.roots) && computerReply.result.roots.length > 0);
    computerReply = await sendRequest('computerList', { chooserId: chooserMessage.id, path: computerTempDir });
    assert.strictEqual(computerReply.ok, true);
    assert.ok(computerReply.result.entries.some((item) => item.name === path.basename(computerTempFile) && item.kind === 'file'));
    computerReply = await sendRequest('computerCommit', { chooserId: 'wrong-chooser-id', paths: [computerTempFile] });
    assert.strictEqual(computerReply.ok, false, '错误上传框 ID 不能选择电脑文件');
    computerReply = await sendRequest('computerCommit', { chooserId: chooserMessage.id, paths: [computerTempFile] });
    assert.strictEqual(computerReply.ok, true);
    assert.strictEqual(computerReply.result.count, 1);
    const computerSetCommand = observedMessages.filter((item) => item.method === 'DOM.setFileInputFiles').at(-1);
    assert.strictEqual(path.resolve(computerSetCommand.params.files[0]), path.resolve(computerTempFile));

    const chooserCountAfterCommit = texts.filter((item) => item.type === 'fileChooser').length;
    mockBrowserSocket.send(JSON.stringify({
      method: 'Page.fileChooserOpened',
      sessionId: 'session-1',
      params: { frameId: 'frame-1', backendNodeId: 42, mode: 'selectSingle' }
    }));
    await sleep(320);
    assert.strictEqual(texts.filter((item) => item.type === 'fileChooser').length, chooserCountAfterCommit,
      '完成后的迟到文件选择事件不能重新打开上传面板');

    // 用一个 move 命令占住异步触摸队列，再发送新的 start。文件选择事件在
    // start 真正泵到 Chromium 之前到达，仍应视为用户第二次主动点击，而非
    // 上次事务的迟到重复事件。
    delayNextInputResponse = true;
    phone.send(JSON.stringify({ type: 'touch', event: 'move', x: 12, y: 14, inputMode: 'devtools' }));
    await waitFor(() => inputResponseHeld, 5000);
    const chooserCountBeforeActivationRace = texts.filter((item) => item.type === 'fileChooser').length;
    phone.send(JSON.stringify({ type: 'touch', event: 'start', x: 165, y: 300, inputMode: 'devtools' }));
    mockBrowserSocket.send(JSON.stringify({
      method: 'Page.fileChooserOpened',
      sessionId: 'session-1',
      params: { frameId: 'frame-1', backendNodeId: 42, mode: 'selectSingle' }
    }));
    phone.send(JSON.stringify({ type: 'touch', event: 'end', x: 165, y: 300, inputMode: 'devtools' }));
    const reopenedChooser = await waitFor(() => texts.find((item, index) =>
      index >= chooserCountBeforeActivationRace && item.type === 'fileChooser' && item.id !== chooserMessage.id), 8000);
    assert.ok(reopenedChooser, '新的触摸开始应在异步队列执行前登记，允许再次打开同一上传框');
    const reopenedCancel = await sendRequest('cancelUpload', { chooserId: reopenedChooser.id });
    assert.strictEqual(reopenedCancel.ok, true);
    await waitFor(() => !inputResponseHeld, 5000);

    mockBrowserSocket.send(JSON.stringify({
      method: 'Page.fileChooserOpened',
      sessionId: 'session-1',
      params: { frameId: 'frame-1', backendNodeId: 43, mode: 'selectSingle' }
    }));
    const phoneChooserMessage = await waitFor(() => texts.find((item) =>
      item.type === 'fileChooser' && item.id !== chooserMessage.id && item.id !== reopenedChooser.id), 8000);

    let uploadReply = await sendRequest('uploadBegin', {
      chooserId: 'wrong-chooser-id',
      files: [{ name: 'phone-test.txt', size: 3, type: 'text/plain', lastModified: 0 }]
    });
    assert.strictEqual(uploadReply.ok, false, '错误上传框 ID 必须被拒绝');
    uploadReply = await sendRequest('uploadBegin', {
      chooserId: phoneChooserMessage.id,
      files: [
        { name: 'one.txt', size: 1, type: 'text/plain', lastModified: 0 },
        { name: 'two.txt', size: 1, type: 'text/plain', lastModified: 0 }
      ]
    });
    assert.strictEqual(uploadReply.ok, false, '单文件上传框不能接收多个文件');
    uploadReply = await sendRequest('uploadBegin', {
      chooserId: phoneChooserMessage.id,
      files: [{ name: 'phone-test.txt', size: 3, type: 'text/plain', lastModified: 0 }]
    });
    assert.strictEqual(uploadReply.ok, true);
    uploadReply = await sendRequest('uploadFileBegin', { index: 0 });
    assert.strictEqual(uploadReply.ok, true);
    phone.send(Buffer.from('abc'));
    uploadReply = await sendRequest('uploadChunkAck', { index: 0, expectedBytes: 3 });
    assert.strictEqual(uploadReply.ok, true);
    assert.strictEqual(uploadReply.result.currentBytes, 3);
    uploadReply = await sendRequest('uploadFileEnd', { index: 0 });
    assert.strictEqual(uploadReply.ok, true);
    uploadReply = await sendRequest('uploadCommit');
    assert.strictEqual(uploadReply.ok, true);
    assert.strictEqual(uploadReply.result.count, 1);
    assert.ok(observedMessages.some((item) => item.method === 'DOM.setFileInputFiles'));

    mockBrowserSocket.send(JSON.stringify({
      method: 'Page.fileChooserOpened',
      sessionId: 'session-1',
      params: { frameId: 'frame-1', backendNodeId: 44, mode: 'selectSingle' }
    }));
    const cancelChooser = await waitFor(() => texts.find((item) =>
      item.type === 'fileChooser' && item.id !== chooserMessage.id && item.id !== reopenedChooser.id && item.id !== phoneChooserMessage.id), 8000);
    const cancelReply = await sendRequest('cancelUpload', { chooserId: cancelChooser.id });
    assert.strictEqual(cancelReply.ok, true);
    assert.strictEqual(cancelReply.result.cancelled, true);
    await waitFor(() => texts.find((item) => item.type === 'uploadCancelled' && item.chooserId === cancelChooser.id), 5000);
    const cancelSetCommand = observedMessages.filter((item) => item.method === 'DOM.setFileInputFiles' && item.params.backendNodeId === 44).at(-1);
    assert.deepStrictEqual(cancelSetCommand.params.files, [], '取消必须明确结束网页文件选择事务');
    const chooserCountAfterCancel = texts.filter((item) => item.type === 'fileChooser').length;
    mockBrowserSocket.send(JSON.stringify({
      method: 'Page.fileChooserOpened',
      sessionId: 'session-1',
      params: { frameId: 'frame-1', backendNodeId: 44, mode: 'selectSingle' }
    }));
    await sleep(320);
    assert.strictEqual(texts.filter((item) => item.type === 'fileChooser').length, chooserCountAfterCancel,
      '取消后的迟到事件不能重新打开上传面板');

    // chooser 在按下期间打开时，服务端会主动释放一次。手机随后到达的旧 end
    // 必须被吞掉，不能再补发第二个 mouseReleased，避免下一次上传点击紊乱。
    const releaseSequenceStart = observedMessages.length;
    const knownChooserIds = new Set(texts.filter((item) => item.type === 'fileChooser').map((item) => item.id));
    phone.send(JSON.stringify({ type: 'touch', event: 'start', x: 155, y: 280, inputMode: 'devtools' }));
    await waitFor(() => observedMessages.slice(releaseSequenceStart).some((item) =>
      item.method === 'Input.emulateTouchFromMouseEvent' && item.params.type === 'mousePressed'), 5000);
    mockBrowserSocket.send(JSON.stringify({
      method: 'Page.fileChooserOpened',
      sessionId: 'session-1',
      params: { frameId: 'frame-1', backendNodeId: 45, mode: 'selectSingle' }
    }));
    const releaseChooser = await waitFor(() => texts.find((item) => item.type === 'fileChooser' && !knownChooserIds.has(item.id)), 8000);
    const releaseCountBeforeTrailingEnd = observedMessages.slice(releaseSequenceStart).filter((item) =>
      item.method === 'Input.emulateTouchFromMouseEvent' && item.params.type === 'mouseReleased').length;
    assert.strictEqual(releaseCountBeforeTrailingEnd, 1, '文件选择器打开时应只主动释放一次');
    phone.send(JSON.stringify({ type: 'touch', event: 'end', x: 155, y: 280, inputMode: 'devtools' }));
    await sleep(260);
    const releaseCountAfterTrailingEnd = observedMessages.slice(releaseSequenceStart).filter((item) =>
      item.method === 'Input.emulateTouchFromMouseEvent' && item.params.type === 'mouseReleased').length;
    assert.strictEqual(releaseCountAfterTrailingEnd, 1, '主动释放后的迟到 end 不能再补发第二次 release');
    const releaseChooserCancel = await sendRequest('cancelUpload', { chooserId: releaseChooser.id });
    assert.strictEqual(releaseChooserCancel.ok, true);

    const calibrationReply = await sendRequest('calibrationMarker', { index: 0 }, 12000);
    assert.strictEqual(calibrationReply.ok, true);
    assert.strictEqual(calibrationReply.result.index, 0);
    assert.ok(calibrationReply.result.frameSequence > 0);
    await sendRequest('calibrationMarker', { index: -1 }, 12000);

    const pressBeforeHandoff = observedMessages.filter((item) => item.method === 'Input.emulateTouchFromMouseEvent').length;
    phone.send(JSON.stringify({ type: 'touch', event: 'start', x: 70, y: 90, inputMode: 'devtools' }));
    await waitFor(() => observedMessages.filter((item) => item.method === 'Input.emulateTouchFromMouseEvent').length > pressBeforeHandoff, 5000);
    const phone2 = new WebSocket(`ws://127.0.0.1:${httpPort}/control?token=${encodeURIComponent(token)}&clientId=integration-2`);
    const phone2Texts = [];
    phone2.on('message', (data, isBinary) => { if (!isBinary) phone2Texts.push(JSON.parse(data.toString())); });
    await new Promise((resolve, reject) => { phone2.once('open', resolve); phone2.once('error', reject); });
    const claimId = 'claim-second-phone';
    phone2.send(JSON.stringify({ type: 'claimControl', requestId: claimId }));
    const claimReply = await waitFor(() => phone2Texts.find((item) => item.type === 'reply' && item.requestId === claimId), 5000);
    assert.strictEqual(claimReply.ok, true);
    await waitFor(() => observedMessages.slice(pressBeforeHandoff).some((item) => item.method === 'Input.emulateTouchFromMouseEvent' && item.params.type === 'mouseReleased'), 5000);
    phone2.close();

    console.log('mock-integration.test.js: OK');
  } finally {
    try { phone?.close(); } catch {}
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      sleep(1800).then(() => child.kill('SIGKILL'))
    ]).catch(() => {});
    fs.rmSync(computerTempDir, { recursive: true, force: true });
    await new Promise((resolve) => mock.close(resolve));
    if (child.exitCode && child.exitCode !== 0) {
      console.error(output);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
