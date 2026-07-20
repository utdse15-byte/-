'use strict';

const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const path = require('path');

function normalizeWhitespace(value) {
  return String(value || '').replace(/[\u200b-\u200f\u202a-\u202e]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeTabTitle(value) {
  return normalizeWhitespace(value)
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s+-\s+Microsoft Edge$/i, '')
    .replace(/\s+–\s+Microsoft Edge$/i, '')
    .toLowerCase();
}

function normalizeAddress(value) {
  let text = normalizeWhitespace(value);
  if (!text) return '';
  // view-source: 是目标身份的一部分（同一 URL 的源代码页与普通页在 CDP 里
  // 是两个不同 target），保留为前缀而不是剥掉——否则两者归一化后相撞。
  let wrapper = '';
  if (/^view-source:/i.test(text)) {
    wrapper = 'view-source:';
    text = text.replace(/^view-source:/i, '');
  }
  // 地址栏可访问性文本常省略协议。"localhost:3000/x" 这类 host:port 会被
  // URL 解析成自定义协议，必须先排除：只有带 "//" 的绝对地址或已知的
  // 不透明协议才按原样解析，其余一律补 https:// 再归一化。
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ||
    /^(about|edge|chrome|devtools|data|javascript|mailto):/i.test(text);
  try {
    const parsed = new URL(hasScheme ? text : `https://${text}`);
    // 不透明协议（about:/edge:/data: 等）保留协议前缀作为身份的一部分，
    // 避免 about:blank 与主机名恰为 "blank" 的 https 页面归一化后相撞。
    // http/https 仍然合并（地址栏经常省略协议，无法区分）。
    const protocol = parsed.protocol.toLowerCase();
    const schemePrefix = protocol === 'http:' || protocol === 'https:' ? '' : protocol;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const port = parsed.port ? `:${parsed.port}` : '';
    const pathname = (parsed.pathname || '/').replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    const search = parsed.search || '';
    // URI 规范只有 scheme 与 host 大小写不敏感：路径/查询保留原大小写，
    // 避免 /Case?T=A 与 /case?t=a 被错误合并。fragment 也保留——hash 路由
    // 的单页应用靠它区分不同页面，丢掉会把不同标签当成同一个。
    const hash = parsed.hash || '';
    return `${wrapper}${schemePrefix}${host}${port}${pathname === '/' ? '' : pathname}${search}${hash}`;
  } catch {
    const stripped = text
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/$/, '');
    // 无法解析时只把主机段（首个 /?# 之前）小写，其余保留大小写。
    const boundary = stripped.search(/[/?#]/);
    const head = boundary === -1 ? stripped : stripped.slice(0, boundary);
    const tail = boundary === -1 ? '' : stripped.slice(boundary);
    return `${wrapper}${head.toLowerCase()}${tail}`;
  }
}

function chooseTargetFromUia(targets, uiaState = {}, options = {}) {
  // options.allowedTargetIds：专用手机窗口模式下只允许跟随该窗口内的标签。
  // 作用域检查必须在"全集匹配"之后：若先把集合外目标删掉再匹配，"前台其实
  // 是主窗口里同 URL 的标签"（本应保持不动）会被错判成专用窗口内的唯一命中
  // ——过滤制造出假唯一。正确顺序：先在全部可控目标里判定前台是谁；判定出
  // 的目标不在允许集合内，或跨集合内外存在歧义时，都保持当前标签不猜测。
  const allowed = options.allowedTargetIds
    ? new Set([...options.allowedTargetIds])
    : null;
  const scoped = (result) => {
    if (!result) return null;
    const id = result.target.id ?? result.target.targetId;
    return !allowed || allowed.has(id) ? result : null;
  };
  const candidates = (Array.isArray(targets) ? targets : [])
    .filter((target) => target && target.controllable !== false);
  if (!candidates.length || !uiaState || uiaState.edgeForeground !== true) return null;

  const address = normalizeAddress(uiaState.address);
  if (address) {
    const exactUrl = candidates.filter((target) => normalizeAddress(target.url) === address);
    if (exactUrl.length === 1) return scoped({ target: exactUrl[0], confidence: 'url-exact' });

    // Edge sometimes omits the query string or a trailing path separator in the
    // address-bar accessibility value. Only accept a prefix match when unique.
    // 地址栏还会随用户逐字输入而变化：单个字符 "c" 也能唯一前缀命中某个
    // 标签，导致打字期间手机被切走。只有看起来像完整地址（足够长且含
    // "." 或 ":"）的值才允许前缀匹配；不确定时保持当前标签。
    const plausibleAddress = address.length >= 6 && /[.:]/.test(address);
    if (plausibleAddress) {
      // 前缀必须终止在路径段/查询/片段边界，避免 /foo 匹配到 /foobar；
      // "#" 让省略了 hash 的地址栏文本仍能唯一命中自己的页面。
      const boundaryPrefix = (longer, shorter) => longer.startsWith(shorter) &&
        (longer.length === shorter.length || ['/', '?', '&', '#'].includes(longer[shorter.length]));
      const prefixUrl = candidates.filter((target) => {
        const candidate = normalizeAddress(target.url);
        return candidate && (boundaryPrefix(candidate, address) || boundaryPrefix(address, candidate));
      });
      if (prefixUrl.length === 1) return scoped({ target: prefixUrl[0], confidence: 'url-prefix' });
    }
  }

  const title = normalizeTabTitle(uiaState.tabTitle || uiaState.windowTitle);
  if (!title) return null;
  const exactTitle = candidates.filter((target) => normalizeTabTitle(target.title) === title);
  if (exactTitle.length === 1) return scoped({ target: exactTitle[0], confidence: 'title-exact' });

  // Fuzzy title matching is intentionally conservative. Duplicate ChatGPT or
  // Claude titles are common; ambiguous matches must leave the phone on the
  // current tab rather than switching the wrong conversation.
  if (title.length >= 6) {
    const partial = candidates.filter((target) => {
      const candidate = normalizeTabTitle(target.title);
      return candidate && (candidate.startsWith(title) || title.startsWith(candidate));
    });
    if (partial.length === 1) return scoped({ target: partial[0], confidence: 'title-prefix' });
  }
  return null;
}

class EdgeUiaMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.scriptPath = path.resolve(options.scriptPath || path.join(__dirname, '..', 'helpers', 'edge-uia-monitor.ps1'));
    this.pollMs = Math.max(250, Math.min(5000, Math.round(Number(options.pollMs) || 650)));
    this.restartMs = Math.max(1500, Math.min(60000, Math.round(Number(options.restartMs) || 5000)));
    this.logger = typeof options.logger === 'function' ? options.logger : () => {};
    this.child = null;
    this.stopped = false;
    this.restartTimer = null;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.latest = null;
    this.status = {
      available: false,
      running: false,
      platform: process.platform,
      reason: process.platform === 'win32' ? 'not-started' : 'windows-only',
      updatedAt: Date.now()
    };
  }

  publishStatus(patch = {}) {
    this.status = { ...this.status, ...patch, updatedAt: Date.now() };
    this.emit('status', { ...this.status });
  }

  start() {
    if (this.stopped) this.stopped = false;
    if (process.platform !== 'win32') {
      this.publishStatus({ available: false, running: false, reason: 'windows-only' });
      return false;
    }
    if (this.child && this.child.exitCode === null) return true;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';

    const child = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', this.scriptPath,
      '-PollMs', String(this.pollMs),
      // 控制器被强制结束（停止脚本 Stop-Process、关窗口）时收不到任何信号，
      // 监视脚本靠轮询父进程存活自行退出，避免留下常驻的隐藏 powershell。
      '-ParentPid', String(process.pid)
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.child = child;
    this.publishStatus({ available: false, running: true, reason: 'starting', pid: child.pid || null });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.consumeStdout(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      this.stderrBuffer = `${this.stderrBuffer}${chunk}`.slice(-8000);
    });
    child.on('error', (error) => {
      this.logger('warn', 'Windows UI Automation 监视器启动失败', { error: error.message });
      if (this.child === child) this.child = null;
      this.publishStatus({ available: false, running: false, reason: 'spawn-error', error: error.message });
      // spawn 失败（如 ENOENT）只触发 'error'/'close'，不会触发 'exit'；
      // 这里也要安排自动重启，否则监视器会一直停在 spawn-error 状态。
      if (!this.stopped && !this.restartTimer) {
        this.restartTimer = setTimeout(() => this.start(), this.restartMs);
        this.restartTimer.unref?.();
      }
    });
    child.on('exit', (code, signal) => {
      if (this.child === child) this.child = null;
      const error = normalizeWhitespace(this.stderrBuffer).slice(-1200);
      this.publishStatus({
        available: false,
        running: false,
        reason: this.stopped ? 'stopped' : 'exited',
        exitCode: code,
        signal: signal || null,
        error: error || null
      });
      if (!this.stopped && !this.restartTimer) {
        this.restartTimer = setTimeout(() => this.start(), this.restartMs);
        this.restartTimer.unref?.();
      }
    });
    return true;
  }

  consumeStdout(chunk) {
    this.stdoutBuffer += String(chunk || '');
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() || '';
    // 正常输出是单行 JSON（远小于 64KB）。异常的超长无换行记录不能无限
    // 累积内存（stderr 已有 8000 字符上限,stdout 同样要有界）。
    if (this.stdoutBuffer.length > 65536) {
      this.logger('warn', '丢弃过长且未换行的 UI Automation 输出', { length: this.stdoutBuffer.length });
      this.stdoutBuffer = '';
    }
    for (const line of lines) {
      const trimmed = line.trim().replace(/^\uFEFF/, '');
      if (!trimmed) continue;
      let state;
      try {
        state = JSON.parse(trimmed);
      } catch {
        this.logger('info', '忽略无法解析的 UI Automation 输出', { line: trimmed.slice(0, 500) });
        continue;
      }
      this.latest = state;
      this.publishStatus({ available: state.available !== false, running: true, reason: state.reason || 'ok', pid: this.child?.pid || null, error: null });
      this.emit('state', state);
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const child = this.child;
    this.child = null;
    if (child && child.exitCode === null) {
      try { child.kill(); } catch {}
    }
    this.publishStatus({ available: false, running: false, reason: 'stopped' });
  }
}

module.exports = {
  EdgeUiaMonitor,
  chooseTargetFromUia,
  normalizeAddress,
  normalizeTabTitle,
  normalizeWhitespace
};
