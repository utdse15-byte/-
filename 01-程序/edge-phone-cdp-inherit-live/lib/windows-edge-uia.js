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
  text = text.replace(/^view-source:/i, '');
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const port = parsed.port ? `:${parsed.port}` : '';
    const pathname = (parsed.pathname || '/').replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    const search = parsed.search || '';
    return `${host}${port}${pathname === '/' ? '' : pathname}${search}`.toLowerCase();
  } catch {
    return text
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/$/, '')
      .toLowerCase();
  }
}

function chooseTargetFromUia(targets, uiaState = {}, options = {}) {
  // options.allowedTargetIds：专用手机窗口模式下只允许跟随该窗口内的标签。
  // 前台标签不在允许集合内时保持手机当前标签（保守，不猜测）。
  const allowed = options.allowedTargetIds
    ? new Set([...options.allowedTargetIds])
    : null;
  const candidates = (Array.isArray(targets) ? targets : [])
    .filter((target) => target && target.controllable !== false)
    .filter((target) => !allowed || allowed.has(target.id ?? target.targetId));
  if (!candidates.length || !uiaState || uiaState.edgeForeground !== true) return null;

  const address = normalizeAddress(uiaState.address);
  if (address) {
    const exactUrl = candidates.filter((target) => normalizeAddress(target.url) === address);
    if (exactUrl.length === 1) return { target: exactUrl[0], confidence: 'url-exact' };

    // Edge sometimes omits the query string or a trailing path separator in the
    // address-bar accessibility value. Only accept a prefix match when unique.
    const prefixUrl = candidates.filter((target) => {
      const candidate = normalizeAddress(target.url);
      return candidate && (candidate.startsWith(address) || address.startsWith(candidate));
    });
    if (prefixUrl.length === 1) return { target: prefixUrl[0], confidence: 'url-prefix' };
  }

  const title = normalizeTabTitle(uiaState.tabTitle || uiaState.windowTitle);
  if (!title) return null;
  const exactTitle = candidates.filter((target) => normalizeTabTitle(target.title) === title);
  if (exactTitle.length === 1) return { target: exactTitle[0], confidence: 'title-exact' };

  // Fuzzy title matching is intentionally conservative. Duplicate ChatGPT or
  // Claude titles are common; ambiguous matches must leave the phone on the
  // current tab rather than switching the wrong conversation.
  if (title.length >= 6) {
    const partial = candidates.filter((target) => {
      const candidate = normalizeTabTitle(target.title);
      return candidate && (candidate.startsWith(title) || title.startsWith(candidate));
    });
    if (partial.length === 1) return { target: partial[0], confidence: 'title-prefix' };
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
      '-PollMs', String(this.pollMs)
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
      this.publishStatus({ available: false, running: false, reason: 'spawn-error', error: error.message });
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
      if (!this.stopped) {
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
