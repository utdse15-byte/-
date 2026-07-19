'use strict';

// 剪贴板桥（CLIP-001/CLIP-002）：
// 1. 读取：通过外部命令取回文本（UTF-8 中文完整）；
// 2. 写入：文本经 stdin 原样传给外部命令，不落盘、不截断；
// 3. 超过大小限制必须明确拒绝，不得静默截断；
// 4. WS 协议 clipboardGet / clipboardSet 端到端可用，且为请求-应答式
//    （没有任何轮询或自动同步路径）；
// 5. 非 Windows 且未配置替代命令时明确报错。

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { WebSocket } = require('ws');
const { WindowsClipboardBridge } = require('../lib/windows-clipboard');

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

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-phone-clipboard-'));
  const captureFile = path.join(temp, 'set-capture.txt');
  const sample = '第一行：ChatGPT 回答\nsecond line with emoji ✅\n结尾';

  const getCommand = [process.execPath, '-e', `process.stdout.write(${JSON.stringify(sample)})`];
  const setCommand = [
    process.execPath,
    '-e',
    "let d=Buffer.alloc(0);process.stdin.on('data',(c)=>{d=Buffer.concat([d,c]);});process.stdin.on('end',()=>{require('fs').writeFileSync(process.argv[1],d);});",
    captureFile
  ];

  // 1/2. 单元层：读取与写入。
  const bridge = new WindowsClipboardBridge({ getCommand, setCommand, maxChars: 4096 });
  const readResult = await bridge.read();
  assert.strictEqual(readResult.text, sample);
  assert.strictEqual(readResult.chars, sample.length);

  await bridge.write(sample);
  assert.strictEqual(fs.readFileSync(captureFile, 'utf8'), sample);

  // 3. 超限拒绝，不截断。
  await assert.rejects(() => bridge.write('x'.repeat(5000)), /限制/);
  assert.strictEqual(fs.readFileSync(captureFile, 'utf8'), sample, '超限写入不得触碰剪贴板');
  await assert.rejects(() => bridge.write(''), /为空/);

  // 5. 非 Windows 且无替代命令时明确报错。
  const unavailable = new WindowsClipboardBridge({ platform: 'linux' });
  assert.strictEqual(unavailable.available(), false);
  await assert.rejects(() => unavailable.read(), /Windows/);

  // 4. WS 协议端到端。
  const httpPort = await freePort();
  const token = 'clipboard-test-token-123456';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(httpPort),
      PHONE_TOKEN: token,
      IDLE_SHARPEN_ENABLED: '0',
      CLIPBOARD_GET_COMMAND: JSON.stringify(getCommand),
      CLIPBOARD_SET_COMMAND: JSON.stringify(setCommand),
      CLIPBOARD_MAX_CHARS: '4096'
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

    const messages = [];
    phone = new WebSocket(`ws://127.0.0.1:${httpPort}/control?token=${encodeURIComponent(token)}&clientId=clipboard-test`);
    phone.on('message', (data, isBinary) => {
      if (isBinary) return;
      try { messages.push(JSON.parse(data.toString())); } catch {}
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('手机连接超时')), 8000);
      phone.once('open', () => { clearTimeout(timer); resolve(); });
      phone.once('error', (error) => { clearTimeout(timer); reject(error); });
    });

    const sendRequest = (type, payload = {}) => {
      const requestId = `${type}-${Date.now()}-${Math.random()}`;
      phone.send(JSON.stringify({ ...payload, type, requestId }));
      return waitFor(
        () => messages.find((item) => item.type === 'reply' && item.requestId === requestId),
        10000, 50, `${type} 回复`
      );
    };

    const hello = await waitFor(() => messages.find((item) => item.type === 'hello'), 8000, 50, 'hello');
    assert.strictEqual(hello.limits.clipboardBridge, true, 'hello 必须声明剪贴板桥可用');

    const getReply = await sendRequest('clipboardGet');
    assert.strictEqual(getReply.ok, true);
    assert.strictEqual(getReply.result.text, sample);

    fs.rmSync(captureFile, { force: true });
    const phoneText = '来自手机的长文\nwith 中文 and English';
    const setReply = await sendRequest('clipboardSet', { text: phoneText });
    assert.strictEqual(setReply.ok, true);
    assert.strictEqual(fs.readFileSync(captureFile, 'utf8'), phoneText);

    const oversizeReply = await sendRequest('clipboardSet', { text: 'y'.repeat(5000) });
    assert.strictEqual(oversizeReply.ok, false);
    assert.ok(/限制/.test(oversizeReply.error), '超限必须返回明确错误');

    console.log('windows-clipboard.test.js: OK');
  } catch (error) {
    console.error('controller output:\n', output.slice(-4000));
    throw error;
  } finally {
    try { phone?.terminate(); } catch {}
    child.kill('SIGKILL');
    await new Promise((resolve) => setTimeout(resolve, 150));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
