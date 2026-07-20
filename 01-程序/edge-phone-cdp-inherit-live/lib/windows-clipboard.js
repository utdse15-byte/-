'use strict';

// Windows 剪贴板桥（CLIP-001/CLIP-002）。
//
// 设计边界：
// - 每次读取/写入都必须由用户在手机控制页当次显式触发，本模块不提供轮询、
//   监听或自动同步能力；
// - 完全通过 PowerShell Get-Clipboard / Set-Clipboard 访问 Windows 剪贴板，
//   不向目标网页注入脚本，不使用 CDP Runtime，与严格人工模式的最小 CDP 面无关；
// - 内容不落盘、不写日志（只记录长度）、不做任何解析或抓取；
// - 超过大小限制时明确拒绝，绝不静默截断（半截文本粘贴比失败更危险）。

const { execFile } = require('child_process');

const DEFAULT_MAX_CHARS = 1000000;
const DEFAULT_TIMEOUT_MS = 10000;

function runCommand(command, { input = null, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes, operation = '读取' }) {
  return new Promise((resolve, reject) => {
    const [file, ...args] = command;
    const child = execFile(file, args, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: maxBytes,
      encoding: 'buffer'
    }, (error, stdout, stderr) => {
      if (error) {
        if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
          reject(new Error('电脑剪贴板内容过大，超过控制器允许的上限；请在电脑上分段复制。'));
          return;
        }
        if (error.killed || error.signal === 'SIGTERM') {
          reject(new Error(`${operation}电脑剪贴板超时；请确认 Windows PowerShell 可用后重试。`));
          return;
        }
        const detail = Buffer.isBuffer(stderr) ? stderr.toString('utf8').trim() : '';
        reject(new Error(detail || error.message));
        return;
      }
      resolve(Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout || ''));
    });
    if (input !== null) {
      child.stdin.on('error', () => {});
      child.stdin.end(input, 'utf8');
    } else if (child.stdin) {
      child.stdin.end();
    }
  });
}

class WindowsClipboardBridge {
  constructor(options = {}) {
    this.maxChars = Math.max(1024, Number(options.maxChars) || DEFAULT_MAX_CHARS);
    this.timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
    this.getCommand = Array.isArray(options.getCommand) && options.getCommand.length ? options.getCommand : null;
    this.setCommand = Array.isArray(options.setCommand) && options.setCommand.length ? options.setCommand : null;
    this.platform = options.platform || process.platform;
    this.busyPromise = null;
  }

  available() {
    return this.canRead() || this.canWrite();
  }

  // 能力按方向区分：非 Windows 主机只配置了读取命令时不得宣称可写入
  // （反之亦然），否则另一方向会去调用不存在的 powershell.exe。
  canRead() {
    return this.platform === 'win32' || Boolean(this.getCommand);
  }

  canWrite() {
    return this.platform === 'win32' || Boolean(this.setCommand);
  }

  defaultGetCommand() {
    return [
      'powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $t = Get-Clipboard -Raw; if ($null -ne $t) { [Console]::Out.Write($t) }'
    ];
  }

  defaultSetCommand() {
    return [
      'powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      '[Console]::InputEncoding=[System.Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())'
    ];
  }

  async exclusive(task) {
    while (this.busyPromise) {
      await this.busyPromise.catch(() => {});
    }
    this.busyPromise = task();
    try {
      return await this.busyPromise;
    } finally {
      this.busyPromise = null;
    }
  }

  // 读取电脑剪贴板文本。仅限用户当次显式触发。
  async read() {
    if (!this.canRead()) throw new Error('剪贴板读取仅支持 Windows 电脑端（或已配置替代读取命令时）。');
    const command = this.getCommand || this.defaultGetCommand();
    return this.exclusive(async () => {
      const text = await runCommand(command, {
        timeoutMs: this.timeoutMs,
        maxBytes: this.maxChars * 4 + 65536,
        operation: '读取'
      });
      if (text.length > this.maxChars) {
        throw new Error(`电脑剪贴板内容超过 ${this.maxChars} 字符限制，请在电脑上分段复制。`);
      }
      return { text, chars: text.length };
    });
  }

  // 把手机端文本写入电脑剪贴板。仅限用户当次显式触发。
  async write(text) {
    if (!this.canWrite()) throw new Error('剪贴板写入仅支持 Windows 电脑端（或已配置替代写入命令时）。');
    const value = String(text ?? '');
    if (!value) throw new Error('要写入电脑剪贴板的内容为空。');
    if (value.length > this.maxChars) {
      throw new Error(`内容超过 ${this.maxChars} 字符限制，未写入电脑剪贴板。`);
    }
    const command = this.setCommand || this.defaultSetCommand();
    return this.exclusive(async () => {
      await runCommand(command, {
        input: value,
        timeoutMs: this.timeoutMs,
        maxBytes: 1024 * 1024,
        operation: '写入'
      });
      return { chars: value.length };
    });
  }
}

module.exports = { WindowsClipboardBridge, DEFAULT_MAX_CHARS };
