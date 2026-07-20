'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const net = require('net');
const { spawn, execFile } = require('child_process');
const { WebSocket, WebSocketServer } = require('ws');
const { makeFramePacket } = require('./lib/protocol');
const { ComputerFileService } = require('./lib/computer-files');
const { EdgeHistoryService } = require('./lib/edge-history');
const { EdgeUiaMonitor, chooseTargetFromUia } = require('./lib/windows-edge-uia');
const { WindowsClipboardBridge } = require('./lib/windows-clipboard');
const {
  clampInsideViewport,
  dipDeltaToCss,
  dipToCssPoint,
  normalizeCoordinateContext,
  normalizedDeltaToCss,
  normalizedToCssPoint,
  resolveNativeScales
} = require('./lib/input-coordinates');

const VERSION = '6.8.5';
const SERVICE_ID = 'edge-phone-cdp-controller';
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');
const LOG_DIR = path.join(ROOT_DIR, 'logs');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const TOKEN_PATH = path.join(DATA_DIR, 'access-token.txt');
const UPLOAD_ROOT = path.join(os.tmpdir(), 'edge-phone-cdp-uploads');

function readJsonFile(filePath, fallback = {}) {
  // \u53EA\u6709"\u6587\u4EF6\u4E0D\u5B58\u5728"\u624D\u5141\u8BB8\u56DE\u9000\u5230\u9ED8\u8BA4\u503C\u3002\u64CD\u4F5C\u8005\u63D0\u4F9B\u4E86\u914D\u7F6E\u5374\u56E0\u8BED\u6CD5\u9519\u8BEF\u3001
  // \u6743\u9650\u6216\u534A\u622A\u5199\u5165\u88AB\u9759\u9ED8\u5FFD\u7565\uFF0C\u4F1A\u8BA9\u63A7\u5236\u5668\u5E26\u7740\u9ED8\u8BA4\u7684\u5B89\u5168/\u6587\u4EF6/\u6D41\u8BBE\u7F6E\u542F\u52A8\uFF0C
  // \u6BD4\u6E05\u6670\u5730\u62D2\u7EDD\u542F\u52A8\u5371\u9669\u5F97\u591A\u3002
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    console.error(`\u65E0\u6CD5\u8BFB\u53D6\u914D\u7F6E\u6587\u4EF6 ${filePath}\uFF1A${error.message}`);
    process.exit(1);
  }
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (error) {
    console.error(`\u914D\u7F6E\u6587\u4EF6 ${filePath} \u4E0D\u662F\u6709\u6548\u7684 JSON\uFF1A${error.message}`);
    console.error('\u8BF7\u4FEE\u6B63\u8BE5\u6587\u4EF6\uFF08\u6216\u5220\u9664\u5B83\u4EE5\u4F7F\u7528\u9ED8\u8BA4\u914D\u7F6E\uFF09\u540E\u91CD\u65B0\u542F\u52A8\u63A7\u5236\u5668\u3002');
    process.exit(1);
  }
}

function numberSetting(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function boolSetting(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  // 只接受明确的布尔写法。以前"除 0/false/no/off 外全为真"会把手滑写错的
  // "flase"、"disabled" 之类静默当成开启。
  if (/^(1|true|yes|on)$/.test(text)) return true;
  if (/^(0|false|no|off)$/.test(text)) return false;
  console.warn(`无法识别的布尔配置值：“${String(value)}”，已使用默认值 ${fallback}。请写 true/false。`);
  return fallback;
}

function stringListSetting(value, fallback = []) {
  const source = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',') : fallback);
  return [...new Set((source || [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean))];
}

function hostnameFromUrl(value) {
  try { return new URL(String(value || '')).hostname.toLowerCase(); } catch { return ''; }
}

function hostnameMatchesDomains(hostname, domains) {
  const host = String(hostname || '').toLowerCase();
  return Boolean(host && (domains || []).some((domain) => host === domain || host.endsWith(`.${domain}`)));
}

const fileConfig = readJsonFile(CONFIG_PATH, {});
const HTTP_PORT = Math.round(numberSetting(process.env.PORT || fileConfig.controllerPort, 8765, 1, 65535));
const LISTEN_HOST = String(process.env.LISTEN_HOST || fileConfig.listenHost || '0.0.0.0').trim() || '0.0.0.0';
const EDGE_USER_DATA_DIR = process.env.EDGE_USER_DATA_DIR || path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data');
const FIXED_CDP_BROWSER_WS = process.env.CDP_BROWSER_WS || '';
const EDGE_EXECUTABLE = String(process.env.EDGE_EXECUTABLE || fileConfig.edgePath || '').trim();
const EDGE_PROFILE_DIRECTORY = String(process.env.EDGE_PROFILE_DIRECTORY || fileConfig.profileDirectory || '').trim();
const EDGE_PROXY_SERVER = String(process.env.EDGE_PROXY_SERVER || fileConfig.proxyServer || '').trim();
const EDGE_HOST_RESOLVER_RULES = String(process.env.EDGE_HOST_RESOLVER_RULES || fileConfig.hostResolverRules || '').trim();
const EDGE_INITIAL_URL = String(process.env.EDGE_INITIAL_URL ?? fileConfig.initialUrl ?? 'about:blank').trim();
const EDGE_OPEN_REMOTE_DEBUGGING_PAGE = boolSetting(
  process.env.EDGE_OPEN_REMOTE_DEBUGGING_PAGE ?? fileConfig.openRemoteDebuggingPage,
  true
);
const EDGE_MANAGED_SESSION = boolSetting(process.env.EDGE_MANAGED_SESSION, false);
const EDGE_AUTO_RESTART = EDGE_MANAGED_SESSION && boolSetting(
  process.env.EDGE_AUTO_RESTART ?? fileConfig.autoRestartEdge,
  true
);
const EDGE_RESTART_COOLDOWN_MS = Math.round(numberSetting(
  process.env.EDGE_RESTART_COOLDOWN_SECONDS ?? fileConfig.edgeRestartCooldownSeconds,
  8,
  3,
  120
) * 1000);
const EDGE_DEBUG_PROMPT_COOLDOWN_MS = Math.round(numberSetting(
  process.env.EDGE_DEBUG_PROMPT_COOLDOWN_SECONDS ?? fileConfig.edgeDebugPromptCooldownSeconds,
  30,
  10,
  600
) * 1000);
const EDGE_WRAPPER_LAUNCH_AT_MS = Math.max(0, Number(process.env.EDGE_WRAPPER_LAUNCH_AT_MS) || 0);
const SCREENCAST_QUALITY = Math.round(numberSetting(process.env.SCREENCAST_QUALITY || fileConfig.screencastQuality, 72, 30, 95));
const SCREENCAST_MAX_DIMENSION = Math.round(numberSetting(process.env.SCREENCAST_MAX_DIMENSION || fileConfig.screencastMaxDimension, 2560, 640, 4096));
const SNAPSHOT_FALLBACK_FPS = numberSetting(process.env.SNAPSHOT_FALLBACK_FPS || fileConfig.snapshotFallbackFps, 3, 0.5, 10);
// 静止画面高清化：页面持续无新帧、无输入时补拍一张无损 PNG，一有操作立即回到实时 JPEG。
// 纯画面编码层的基础设施自动化（规范 2.3 允许范围），不触碰目标页面。
const IDLE_SHARPEN_ENABLED = boolSetting(process.env.IDLE_SHARPEN_ENABLED ?? fileConfig.idleSharpenEnabled, true);
const IDLE_SHARPEN_DELAY_MS = Math.round(numberSetting(process.env.IDLE_SHARPEN_DELAY_MS ?? fileConfig.idleSharpenDelayMs, 900, 500, 15000));
const MAX_UPLOAD_BYTES = Math.round(numberSetting(process.env.MAX_UPLOAD_BYTES, numberSetting(fileConfig.maxUploadMB, 512, 1, 4096) * 1024 * 1024, 1024 * 1024, 4 * 1024 * 1024 * 1024));
const MAX_UPLOAD_FILES = Math.round(numberSetting(process.env.MAX_UPLOAD_FILES || fileConfig.maxUploadFiles, 64, 1, 500));
const MAX_COMPUTER_FILES = Math.round(numberSetting(process.env.MAX_COMPUTER_FILES || fileConfig.maxComputerFiles, 256, 1, 2000));
const COMPUTER_FILE_MAX_ENTRIES = Math.round(numberSetting(process.env.COMPUTER_FILE_MAX_ENTRIES || fileConfig.computerFileMaxEntries, 1000, 50, 5000));
const COMPUTER_FILE_SHOW_HIDDEN = boolSetting(process.env.COMPUTER_FILE_SHOW_HIDDEN ?? fileConfig.computerFileShowHidden, false);
const COMPUTER_FILE_SORT = String(process.env.COMPUTER_FILE_SORT || fileConfig.computerFileSort || 'modified-desc').trim() || 'modified-desc';
const BROWSER_HISTORY_MAX_ENTRIES = Math.round(numberSetting(process.env.BROWSER_HISTORY_MAX_ENTRIES || fileConfig.browserHistoryMaxEntries, 300, 20, 500));
const UPLOAD_ACK_BYTES = Math.round(numberSetting(
  process.env.UPLOAD_ACK_BYTES,
  numberSetting(fileConfig.uploadAckMB, 1, 0.25, 8) * 1024 * 1024,
  256 * 1024,
  8 * 1024 * 1024
));
const UPLOAD_RETENTION_MS = Math.round(numberSetting(process.env.UPLOAD_RETENTION_MINUTES || fileConfig.uploadRetentionMinutes, 60, 5, 1440) * 60 * 1000);
const AUTO_SWITCH_NEW_TABS = boolSetting(process.env.AUTO_SWITCH_NEW_TABS ?? fileConfig.autoSwitchNewTabs, false);
const DEFAULT_DESKTOP_WIDTH = Math.round(numberSetting(process.env.DESKTOP_WIDTH || fileConfig.desktopWidth, 1280, 800, 2560));
const DEFAULT_STREAM_PRESET = ['auto', 'economy', 'realtime', 'balanced', 'clear'].includes(String(process.env.STREAM_PRESET || fileConfig.streamPreset || 'auto'))
  ? String(process.env.STREAM_PRESET || fileConfig.streamPreset || 'auto')
  : 'auto';
const FOLLOW_DESKTOP_TABS_DEFAULT = boolSetting(
  process.env.FOLLOW_DESKTOP_TABS ?? fileConfig.followDesktopTabs,
  false
);
const DESKTOP_TAB_FOLLOW_STRATEGY = ['uia', 'runtime', 'manual'].includes(String(
  process.env.DESKTOP_TAB_FOLLOW_STRATEGY ?? fileConfig.desktopTabFollowStrategy ?? 'uia'
).toLowerCase())
  ? String(process.env.DESKTOP_TAB_FOLLOW_STRATEGY ?? fileConfig.desktopTabFollowStrategy ?? 'uia').toLowerCase()
  : 'uia';
const UIA_POLL_MS = Math.round(numberSetting(
  process.env.UIA_POLL_MS ?? fileConfig.uiaPollMs,
  850,
  250,
  5000
));
const UIA_RESTART_MS = Math.round(numberSetting(
  process.env.UIA_RESTART_SECONDS ?? fileConfig.uiaRestartSeconds,
  5,
  2,
  60
) * 1000);
const STRICT_RUNTIME_TAB_FALLBACK = boolSetting(
  process.env.STRICT_RUNTIME_TAB_FALLBACK ?? fileConfig.strictRuntimeTabFallback,
  false
);
const ACTIVE_TAB_POLL_MS = Math.round(numberSetting(
  process.env.ACTIVE_TAB_POLL_MS ?? fileConfig.activeTabPollMs,
  5000,
  350,
  15000
));

const configuredManualMode = String(
  process.env.MANUAL_COMPATIBILITY_MODE ??
  process.env.SITE_INTERACTION_MODE ??
  fileConfig.manualCompatibilityMode ??
  fileConfig.siteInteractionMode ??
  'auto'
).toLowerCase();
const MANUAL_COMPATIBILITY_MODE = ['auto', 'always', 'off'].includes(configuredManualMode)
  ? configuredManualMode
  : 'auto';
const MANUAL_COMPATIBILITY_DOMAINS = stringListSetting(
  process.env.MANUAL_COMPATIBILITY_DOMAINS ??
  process.env.STRICT_MANUAL_DOMAINS ??
  fileConfig.manualCompatibilityDomains ??
  fileConfig.strictManualDomains,
  ['chatgpt.com', 'chat.openai.com', 'auth.openai.com', 'claude.ai', 'claude.com']
);
const MANUAL_COMPATIBILITY_WINDOW_WIDTH = Math.round(numberSetting(
  process.env.MANUAL_COMPATIBILITY_WINDOW_WIDTH ??
  process.env.STRICT_WINDOW_WIDTH ??
  fileConfig.manualCompatibilityWindowWidth ??
  fileConfig.strictWindowWidth,
  560,
  420,
  1000
));
const MANUAL_COMPATIBILITY_WINDOW_HEIGHT = Math.round(numberSetting(
  process.env.MANUAL_COMPATIBILITY_WINDOW_HEIGHT ??
  process.env.STRICT_WINDOW_HEIGHT ??
  fileConfig.manualCompatibilityWindowHeight ??
  fileConfig.strictWindowHeight,
  960,
  620,
  1400
));
const MANUAL_COMPATIBILITY_RESTORE_WINDOW = boolSetting(
  process.env.MANUAL_COMPATIBILITY_RESTORE_WINDOW ??
  process.env.STRICT_RESTORE_WINDOW ??
  fileConfig.manualCompatibilityRestoreWindow ??
  fileConfig.strictRestoreWindow,
  true
);
const MANUAL_COMPATIBILITY_TAB_POLL_MS = Math.round(numberSetting(
  process.env.MANUAL_COMPATIBILITY_TAB_POLL_MS ?? fileConfig.manualCompatibilityTabPollMs,
  5000,
  1200,
  15000
));
const MANUAL_COMPATIBILITY_AUDIT_TTL_MS = Math.round(numberSetting(
  process.env.MANUAL_COMPATIBILITY_AUDIT_MINUTES ??
  process.env.STRICT_AUDIT_MINUTES ??
  fileConfig.manualCompatibilityAuditMinutes ??
  fileConfig.strictAuditMinutes,
  10,
  1,
  120
) * 60 * 1000);
const STRICT_NATIVE_TOUCH_DEFAULT = boolSetting(
  process.env.STRICT_NATIVE_TOUCH_DEFAULT ?? fileConfig.strictNativeTouchDefault,
  false
);
// 手机专用窗口（WIN-001）：可选模式。开启后控制器在同一 Edge 配置下新开一个
// 独立窄窗口专供手机操作，不改动用户主窗口；关闭专用窗口即完全退出，无需恢复。
const PHONE_DEDICATED_WINDOW_DEFAULT = boolSetting(
  process.env.PHONE_DEDICATED_WINDOW ?? fileConfig.phoneDedicatedWindowDefault,
  false
);
const FILE_CHOOSER_TRANSIENT_MS = Math.round(numberSetting(
  process.env.FILE_CHOOSER_TRANSIENT_MS ?? fileConfig.fileChooserTransientMs,
  2600,
  800,
  10000
));
const FILE_CHOOSER_TOOLBAR_ARM_MS = Math.round(numberSetting(
  process.env.FILE_CHOOSER_TOOLBAR_ARM_MS ??
  fileConfig.fileChooserToolbarArmMs ??
  (Number(fileConfig.fileChooserArmSeconds) * 1000 || undefined),
  90000,
  3000,
  180000
));
const FRAME_ACK_TIMEOUT_MS = Math.round(numberSetting(
  process.env.FRAME_ACK_TIMEOUT_MS ?? fileConfig.frameAckTimeoutMs,
  700,
  250,
  3000
));
const UPLOAD_FREE_SPACE_RESERVE_BYTES = Math.round(numberSetting(
  process.env.UPLOAD_FREE_SPACE_RESERVE_BYTES,
  numberSetting(fileConfig.uploadFreeSpaceReserveMB, 64, 16, 4096) * 1024 * 1024,
  16 * 1024 * 1024,
  4 * 1024 * 1024 * 1024
));
const computerFiles = new ComputerFileService({
  roots: Array.isArray(fileConfig.computerFileRoots) ? fileConfig.computerFileRoots : [],
  showHidden: COMPUTER_FILE_SHOW_HIDDEN,
  maxEntries: COMPUTER_FILE_MAX_ENTRIES,
  defaultSort: COMPUTER_FILE_SORT
});
// 剪贴板桥（CLIP-001/CLIP-002）：只在用户当次显式点击时读写 Windows 剪贴板，
// 通过 PowerShell 实现，不触碰目标页面，不轮询，不落盘，不记录内容。
const CLIPBOARD_BRIDGE_ENABLED = boolSetting(process.env.CLIPBOARD_BRIDGE_ENABLED ?? fileConfig.clipboardBridgeEnabled, true);
const CLIPBOARD_MAX_CHARS = Math.round(numberSetting(process.env.CLIPBOARD_MAX_CHARS ?? fileConfig.clipboardMaxChars, 1000000, 1024, 4000000));
function commandListFromEnv(value) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return Array.isArray(parsed) && parsed.length ? parsed.map(String) : null;
  } catch {
    return null;
  }
}
const clipboardBridge = new WindowsClipboardBridge({
  maxChars: CLIPBOARD_MAX_CHARS,
  // 测试钩子：仅用于在非 Windows 构建环境中以替代命令验证协议与边界。
  getCommand: commandListFromEnv(process.env.CLIPBOARD_GET_COMMAND),
  setCommand: commandListFromEnv(process.env.CLIPBOARD_SET_COMMAND)
});
const edgeHistory = new EdgeHistoryService({
  userDataDir: EDGE_USER_DATA_DIR,
  profileDirectory: EDGE_PROFILE_DIRECTORY,
  maxLimit: BROWSER_HISTORY_MAX_ENTRIES,
  snapshotRoot: path.join(DATA_DIR, 'history-snapshots'),
  // 查询是同步的,会阻塞整个事件循环（帧泵/触摸都停）。Edge 正持锁时不值得
  // 等满默认 2.5 秒——300ms 内拿不到就走快照副本路径。
  busyTimeoutMs: 300
});

const STREAM_PRESETS = Object.freeze({
  economy: { quality: 44, maxDpr: 0.9, everyNthFrame: 2 },
  realtime: { quality: 56, maxDpr: 1.05, everyNthFrame: 1 },
  balanced: { quality: Math.min(SCREENCAST_QUALITY, 72), maxDpr: 1.35, everyNthFrame: 1 },
  // 清晰档 2.5× 与手机端 canvas 的像素密度上限一致：局域网下端到端像素
  // 对齐，连续帧不再经历"低分辨率采集→手机放大"的糊化。
  clear: { quality: Math.max(SCREENCAST_QUALITY, 82), maxDpr: 2.5, everyNthFrame: 1 }
});

fs.mkdirSync(DATA_DIR, { recursive: true });
function resolveAccessToken() {
  const configured = String(process.env.PHONE_TOKEN || fileConfig.accessToken || '').trim();
  if (configured) {
    if (configured.length < 16) throw new Error('accessToken/PHONE_TOKEN 至少需要 16 个字符');
    return configured;
  }
  try {
    const persisted = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
    if (persisted.length >= 16) return persisted;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`无法读取访问令牌文件 ${TOKEN_PATH}：${error.message}`);
      console.error('请修复该文件的读取权限（或删除它以重新生成）后再启动。');
      process.exit(1);
    }
  }
  const generated = crypto.randomBytes(18).toString('base64url');
  try {
    fs.writeFileSync(TOKEN_PATH, `${generated}\r\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return generated;
  } catch (error) {
    if (error.code === 'EEXIST') {
      // 并发启动时另一个进程先写入了令牌：采用胜者的值，绝不覆盖。
      // 覆盖会造成三方分裂——两个进程各持一个令牌、文件里是其中之一，
      // 重启后手机与电脑的令牌随机不一致。
      try {
        const winner = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
        if (winner.length >= 16) return winner;
      } catch {}
      console.error(`访问令牌文件 ${TOKEN_PATH} 已存在但内容无效；请删除该文件后重新启动。`);
      process.exit(1);
    }
    // 令牌无法持久化时不能带着"重启即失效"的内存令牌继续跑：
    // 那会让手机在下次重启后全部配对失败且无从解释。
    console.error(`无法把访问令牌写入 ${TOKEN_PATH}：${error.message}`);
    console.error('请修复 data 目录的写入权限后再启动（或用 PHONE_TOKEN/配置固定令牌）。');
    process.exit(1);
  }
}
let ACCESS_TOKEN = resolveAccessToken();
// 由 PHONE_TOKEN / config.accessToken 明确固定的令牌不允许在线轮换；
// 只有自动生成并存放在 data/access-token.txt 的令牌可以轮换。
const ACCESS_TOKEN_PINNED = Boolean(String(process.env.PHONE_TOKEN || fileConfig.accessToken || '').trim());
function rotateAccessToken() {
  if (ACCESS_TOKEN_PINNED) throw new Error('访问令牌由配置或环境变量固定，无法在线轮换；请在配置中修改。');
  const generated = crypto.randomBytes(18).toString('base64url');
  // 先写临时文件再原子改名：中途崩溃/磁盘满不会把令牌文件留成空或半截，
  // 也不会出现磁盘与内存不一致。
  const tempPath = `${TOKEN_PATH}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${generated}\r\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tempPath, TOKEN_PATH);
  ACCESS_TOKEN = generated;
  return generated;
}

fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const LOG_PATH = path.join(LOG_DIR, 'controller.log');
try {
  const stat = fs.statSync(LOG_PATH);
  if (stat.size > 5 * 1024 * 1024) {
    fs.renameSync(LOG_PATH, path.join(LOG_DIR, `controller-${Date.now()}.log`));
  }
} catch {}
try {
  const rotated = fs.readdirSync(LOG_DIR)
    .filter((name) => /^controller-\d+\.log$/.test(name))
    .map((name) => ({ name, mtimeMs: fs.statSync(path.join(LOG_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const item of rotated.slice(5)) fs.rmSync(path.join(LOG_DIR, item.name), { force: true });
} catch {}
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
// 磁盘满/杀毒锁文件时流会报错：没有监听器的话会打到 uncaughtException。
// 只提示一次,之后文件日志静默停用（内存 recentLogs 与控制台照常工作）。
let logStreamFailed = false;
logStream.on('error', (error) => {
  if (!logStreamFailed) {
    logStreamFailed = true;
    console.warn(`日志文件写入失败，文件日志已停用：${error.message}`);
  }
});
const recentLogs = [];

function log(level, message, details = undefined) {
  const entry = {
    time: new Date().toISOString(),
    level,
    message: String(message),
    ...(details === undefined ? {} : { details })
  };
  recentLogs.push(entry);
  if (recentLogs.length > 300) recentLogs.shift();
  const line = JSON.stringify(entry);
  try { logStream.write(`${line}\n`); } catch {}
  const display = `[${entry.time.slice(11, 19)}] ${level.toUpperCase()} ${entry.message}`;
  if (level === 'error') console.error(display);
  else if (level === 'warn') console.warn(display);
  else console.log(display);
}

function cleanupOldUploads() {
  let names = [];
  try { names = fs.readdirSync(UPLOAD_ROOT); } catch { return; }
  for (const name of names) {
    const entry = path.join(UPLOAD_ROOT, name);
    try {
      const stat = fs.statSync(entry);
      if (Date.now() - stat.mtimeMs > UPLOAD_RETENTION_MS) {
        fs.rmSync(entry, { recursive: true, force: true });
      }
    } catch {}
  }
}
cleanupOldUploads();

function scheduleUploadCleanup(dir, delay = UPLOAD_RETENTION_MS) {
  const timer = setTimeout(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }, delay);
  timer.unref?.();
}

function safeUploadName(name) {
  let cleaned = path.basename(String(name || 'file'))
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 180);
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(cleaned)) cleaned = `_${cleaned}`;
  return cleaned || 'file';
}

function safeUploadRelativePath(name, preserveFolders = false) {
  const raw = String(name || 'file').replace(/\\/g, '/');
  const sourceParts = preserveFolders ? raw.split('/') : [path.basename(raw)];
  const parts = sourceParts
    .filter((part) => part && part !== '.' && part !== '..')
    .slice(0, 32)
    .map((part) => safeUploadName(part));
  return parts.length ? path.join(...parts) : 'file';
}

function waitForStreamDrain(stream) {
  return new Promise((resolve, reject) => {
    const onError = (error) => { cleanup(); reject(error); };
    const onDrain = () => { cleanup(); resolve(); };
    // destroy()（无错误参数）只会触发 'close'：不监听它的话，等待背压的
    // 上传处理链会永远悬挂并连同缓冲区一起泄漏。
    const onClose = () => { cleanup(); reject(new Error('上传文件流已关闭')); };
    const cleanup = () => {
      stream.off('error', onError);
      stream.off('drain', onDrain);
      stream.off('close', onClose);
    };
    stream.once('error', onError);
    stream.once('drain', onDrain);
    stream.once('close', onClose);
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hasFiniteOptionalNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function clampInt(value, min, max, fallback = min) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? clamp(number, min, max) : fallback;
}

function normalizeUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return 'about:blank';
  const schemeMatch = value.match(/^([a-zA-Z][a-zA-Z\d+.-]*):/);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme === 'http' || scheme === 'https' || scheme === 'file') return value;
    if (scheme === 'about' && /^about:(blank|srcdoc)$/i.test(value)) return value;
    throw new Error(`不允许从手机地址栏打开 ${scheme}: 协议`);
  }
  if (/\s/.test(value) || !value.includes('.')) {
    return `https://www.bing.com/search?q=${encodeURIComponent(value)}`;
  }
  return `https://${value}`;
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function sendJson(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function readBrowserWebSocketInfo() {
  if (FIXED_CDP_BROWSER_WS) {
    let port = null;
    try { port = Number(new URL(FIXED_CDP_BROWSER_WS).port) || null; } catch {}
    return {
      endpoint: FIXED_CDP_BROWSER_WS,
      port,
      browserPath: '',
      activePortPath: null,
      mtimeMs: 0,
      fixed: true
    };
  }
  if (!EDGE_USER_DATA_DIR) throw new Error('未提供 Edge 用户数据目录');
  const activePortPath = path.join(EDGE_USER_DATA_DIR, 'DevToolsActivePort');
  let stat;
  let raw;
  try {
    stat = fs.statSync(activePortPath);
    raw = fs.readFileSync(activePortPath, 'utf8');
  } catch (error) {
    const wrapped = new Error(`等待 Edge 生成 DevToolsActivePort：${activePortPath}`);
    wrapped.code = error.code || 'ENOENT';
    wrapped.cause = error;
    throw wrapped;
  }
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    const error = new Error(`DevToolsActivePort 内容不完整：${activePortPath}`);
    error.code = 'EACTIVEPORT';
    throw error;
  }
  const port = Number(lines[0]);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    const error = new Error('DevToolsActivePort 端口无效');
    error.code = 'EACTIVEPORT';
    throw error;
  }
  const browserPath = lines[1];
  const endpoint = /^wss?:\/\//i.test(browserPath)
    ? browserPath
    : `ws://127.0.0.1:${port}${browserPath.startsWith('/') ? '' : '/'}${browserPath}`;
  return {
    endpoint,
    port,
    browserPath,
    activePortPath,
    mtimeMs: stat.mtimeMs,
    fixed: false
  };
}

function tcpPortListening(port, host = '127.0.0.1', timeout = 700) {
  if (!Number.isInteger(Number(port)) || Number(port) <= 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: Number(port) });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve(value);
    };
    socket.setTimeout(timeout, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

function taskListHasEdge() {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile('tasklist.exe', ['/FI', 'IMAGENAME eq msedge.exe', '/FO', 'CSV', '/NH'], {
      windowsHide: true,
      timeout: 5000,
      encoding: 'utf8'
    }, (error, stdout = '') => {
      if (error && !stdout) {
        resolve(null);
        return;
      }
      resolve(/(^|[\r\n])\s*"?msedge\.exe"?\s*,/i.test(stdout) || /\bmsedge\.exe\b/i.test(stdout));
    });
  });
}

const edgeRuntime = {
  lastProcessCheckAt: 0,
  cachedProcessRunning: null,
  lastLaunchAt: EDGE_WRAPPER_LAUNCH_AT_MS,
  launchCount: 0,
  lastInspectOpenAt: 0,
  lastAction: 'none',
  lastActionReason: '',
  lastFailure: '',
  async processRunning(force = false) {
    const now = Date.now();
    if (!force && now - this.lastProcessCheckAt < 1500) return this.cachedProcessRunning;
    this.lastProcessCheckAt = now;
    this.cachedProcessRunning = await taskListHasEdge();
    return this.cachedProcessRunning;
  },
  activePortPath() {
    return EDGE_USER_DATA_DIR ? path.join(EDGE_USER_DATA_DIR, 'DevToolsActivePort') : '';
  },
  clearStaleActivePort() {
    if (FIXED_CDP_BROWSER_WS) return;
    const activePortPath = this.activePortPath();
    if (!activePortPath) return;
    try { fs.rmSync(activePortPath, { force: true }); } catch {}
  },
  launchArguments(inspectOnly = false) {
    const args = [];
    if (EDGE_PROFILE_DIRECTORY) args.push(`--profile-directory=${EDGE_PROFILE_DIRECTORY}`);
    if (!inspectOnly) {
      if (EDGE_PROXY_SERVER) args.push(`--proxy-server=${EDGE_PROXY_SERVER}`);
      if (EDGE_HOST_RESOLVER_RULES) args.push(`--host-resolver-rules=${EDGE_HOST_RESOLVER_RULES}`);
      args.push(
        '--dns-prefetch-disable',
        '--disable-quic',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--no-first-run',
        '--no-default-browser-check',
        '--new-window'
      );
    }
    if (EDGE_OPEN_REMOTE_DEBUGGING_PAGE || inspectOnly) args.push('edge://inspect/#remote-debugging');
    if (!inspectOnly && EDGE_INITIAL_URL) args.push(EDGE_INITIAL_URL);
    return args;
  },
  async launch(reason = 'edge-missing') {
    if (!EDGE_AUTO_RESTART || !EDGE_EXECUTABLE || process.platform !== 'win32') return false;
    const now = Date.now();
    if (now - this.lastLaunchAt < EDGE_RESTART_COOLDOWN_MS) return false;
    this.lastLaunchAt = now;
    this.lastAction = 'launch';
    this.lastActionReason = reason;
    this.clearStaleActivePort();
    try {
      const child = spawn(EDGE_EXECUTABLE, this.launchArguments(false), {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
      child.unref();
      this.launchCount += 1;
      this.cachedProcessRunning = true;
      this.lastProcessCheckAt = now;
      log('warn', '检测到 Edge 已退出，正在自动重新启动', {
        reason,
        executable: EDGE_EXECUTABLE,
        profileDirectory: EDGE_PROFILE_DIRECTORY || null,
        launchCount: this.launchCount
      });
      return true;
    } catch (error) {
      this.lastFailure = error.message;
      log('error', '自动重新启动 Edge 失败', { error: error.message });
      return false;
    }
  },
  async openInspect(reason = 'debug-port-missing') {
    if (!EDGE_MANAGED_SESSION || !EDGE_EXECUTABLE || process.platform !== 'win32') return false;
    const now = Date.now();
    if (now - this.lastInspectOpenAt < EDGE_DEBUG_PROMPT_COOLDOWN_MS) return false;
    this.lastInspectOpenAt = now;
    this.lastAction = 'open-inspect';
    this.lastActionReason = reason;
    try {
      const child = spawn(EDGE_EXECUTABLE, this.launchArguments(true), {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
      child.unref();
      log('warn', 'Edge 正在运行但调试端口不可用，已重新打开远程调试设置页', { reason });
      return true;
    } catch (error) {
      this.lastFailure = error.message;
      log('warn', '无法打开 Edge 远程调试设置页', { error: error.message });
      return false;
    }
  },
  status() {
    return {
      managedSession: EDGE_MANAGED_SESSION,
      autoRestart: EDGE_AUTO_RESTART,
      executableConfigured: Boolean(EDGE_EXECUTABLE),
      processRunning: this.cachedProcessRunning,
      lastProcessCheckAgeMs: this.lastProcessCheckAt ? Date.now() - this.lastProcessCheckAt : null,
      lastLaunchAgeMs: this.lastLaunchAt ? Date.now() - this.lastLaunchAt : null,
      launchCount: this.launchCount,
      lastInspectOpenAgeMs: this.lastInspectOpenAt ? Date.now() - this.lastInspectOpenAt : null,
      lastAction: this.lastAction,
      lastActionReason: this.lastActionReason,
      lastFailure: this.lastFailure || null
    };
  }
};

class SerialQueue {
  constructor() {
    this.tail = Promise.resolve();
  }

  run(task) {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => {});
    return result;
  }
}

class ClientHub {
  constructor() {
    this.clients = new Map();
    this.byClientId = new Map();
    this.controllerClientId = null;
    this.releaseTimer = null;
  }

  add(ws, info) {
    const existing = this.byClientId.get(info.clientId);
    if (existing && existing !== ws) {
      try { existing.close(4001, '同一设备的新连接已替换旧连接'); } catch {}
      this.remove(existing, false);
    }

    const state = {
      ws,
      clientId: info.clientId,
      replacedExisting: Boolean(existing),
      remoteAddress: info.remoteAddress,
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
      pendingFrame: null,
      sendingFrame: false,
      awaitingFrameAck: false,
      sentFrameSequence: 0,
      sentFrameAt: 0,
      frameAckTimer: null,
      frameRetryTimer: null,
      droppedFrames: 0,
      frameAckTimeouts: 0,
      uploadState: null,
      lastFrameAck: null,
      lastFrameProblemAt: 0
    };
    this.clients.set(ws, state);
    this.byClientId.set(info.clientId, ws);

    if (!this.controllerClientId || this.controllerClientId === info.clientId) {
      this.controllerClientId = info.clientId;
      // 只有当控制者本人回来（或空缺被填补）时才取消晋升计时；其他设备
      // 连入时保留计时器，否则控制权会一直挂在已离线的 clientId 上。
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
    this.publishRoles();
    return state;
  }

  remove(ws, allowPromotion = true) {
    const state = this.clients.get(ws);
    if (!state) return;
    clearTimeout(state.frameRetryTimer);
    clearTimeout(state.frameAckTimer);
    this.clients.delete(ws);
    if (this.byClientId.get(state.clientId) === ws) this.byClientId.delete(state.clientId);

    if (allowPromotion && this.controllerClientId === state.clientId && !this.byClientId.has(state.clientId)) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = setTimeout(() => {
        if (this.byClientId.has(state.clientId)) return;
        const next = this.clients.values().next().value;
        this.controllerClientId = next?.clientId || null;
        this.publishRoles();
      }, 1800);
      this.releaseTimer.unref?.();
    }
  }

  getState(ws) {
    return this.clients.get(ws);
  }

  isController(ws) {
    const state = this.clients.get(ws);
    return Boolean(state && state.clientId === this.controllerClientId);
  }

  claim(ws) {
    const state = this.clients.get(ws);
    if (!state) return { changed: false, previousClientId: this.controllerClientId };
    const previousClientId = this.controllerClientId;
    this.controllerClientId = state.clientId;
    clearTimeout(this.releaseTimer);
    this.publishRoles();
    return { changed: previousClientId !== state.clientId, previousClientId };
  }

  controllerState() {
    const ws = this.controllerClientId ? this.byClientId.get(this.controllerClientId) : null;
    return ws ? this.clients.get(ws) || null : null;
  }

  framePressure() {
    const state = this.controllerState();
    if (!state) return { bufferedBytes: 0, renderMs: 0, awaitingAckMs: 0, droppedFrames: 0, ackTimeouts: 0 };
    const now = Date.now();
    const ackAge = state.lastFrameAck?.receivedAt ? now - state.lastFrameAck.receivedAt : Infinity;
    return {
      bufferedBytes: Number(state.ws.bufferedAmount) || 0,
      renderMs: ackAge < 10000 ? Number(state.lastFrameAck?.renderMs) || 0 : 0,
      awaitingAckMs: state.awaitingFrameAck && state.sentFrameAt ? now - state.sentFrameAt : 0,
      droppedFrames: state.droppedFrames || 0,
      ackTimeouts: state.frameAckTimeouts || 0
    };
  }

  publishRoles() {
    for (const state of this.clients.values()) {
      sendJson(state.ws, {
        type: 'role',
        role: state.clientId === this.controllerClientId ? 'controller' : 'viewer',
        controllerClientId: this.controllerClientId
      });
    }
  }

  broadcastJson(payload) {
    for (const state of this.clients.values()) sendJson(state.ws, payload);
  }

  broadcastJsonExcept(exceptWs, payload) {
    for (const state of this.clients.values()) {
      if (state.ws !== exceptWs) sendJson(state.ws, payload);
    }
  }

  queueFrame(frame, onlyWs = null) {
    const states = onlyWs ? [this.clients.get(onlyWs)].filter(Boolean) : [...this.clients.values()];
    for (const state of states) {
      if (state.pendingFrame && Number(state.pendingFrame.sequence) !== Number(frame.sequence)) state.droppedFrames += 1;
      state.pendingFrame = frame;
      this.pumpFrame(state);
    }
  }

  pumpFrame(state) {
    if (!state || state.sendingFrame || state.awaitingFrameAck || !state.pendingFrame || state.ws.readyState !== WebSocket.OPEN) return;
    if (state.ws.bufferedAmount > 768 * 1024) {
      clearTimeout(state.frameRetryTimer);
      state.frameRetryTimer = setTimeout(() => this.pumpFrame(state), 35);
      state.frameRetryTimer.unref?.();
      return;
    }

    const frame = state.pendingFrame;
    state.pendingFrame = null;
    state.sendingFrame = true;
    state.awaitingFrameAck = true;
    state.sentFrameSequence = Number(frame.sequence) || 0;
    state.sentFrameAt = Date.now();
    clearTimeout(state.frameAckTimer);
    state.frameAckTimer = setTimeout(() => {
      if (!state.awaitingFrameAck || state.sentFrameSequence !== (Number(frame.sequence) || 0)) return;
      state.awaitingFrameAck = false;
      state.frameAckTimeouts += 1;
      this.pumpFrame(state);
    }, FRAME_ACK_TIMEOUT_MS);
    state.frameAckTimer.unref?.();

    state.ws.send(frame.packet, { binary: true }, (error) => {
      state.sendingFrame = false;
      if (error) {
        clearTimeout(state.frameAckTimer);
        state.awaitingFrameAck = false;
        log('warn', '向手机发送画面失败', { clientId: state.clientId, error: error.message });
        // 失败期间可能已有新帧排队；这里必须再泵一次，否则该帧要等到
        // 后续帧或外部事件出现才会被送出。
        if (state.pendingFrame && state.ws.readyState === WebSocket.OPEN) {
          clearTimeout(state.frameRetryTimer);
          state.frameRetryTimer = setTimeout(() => this.pumpFrame(state), 120);
          state.frameRetryTimer.unref?.();
        }
        return;
      }
      // 下一帧由手机完成解码和绘制后的 frameAck 释放。这样网络或手机变慢时，
      // 只保留最新画面，不会在手机端排出越来越长的旧帧队列。
    });
  }

  ackFrame(state, message = {}) {
    if (!state) return;
    const sequence = clampInt(message.sequence, 0, Number.MAX_SAFE_INTEGER, 0);
    state.lastFrameAck = {
      sequence,
      renderMs: clamp(Number(message.renderMs) || 0, 0, 60000),
      renderer: String(message.renderer || '').slice(0, 24),
      source: String(message.source || '').slice(0, 64),
      imageWidth: clampInt(message.imageWidth, 0, 16384, 0),
      imageHeight: clampInt(message.imageHeight, 0, 16384, 0),
      epoch: clampInt(message.epoch, 0, Number.MAX_SAFE_INTEGER, 0),
      receivedAt: Date.now()
    };
    if (state.awaitingFrameAck && sequence >= state.sentFrameSequence) {
      clearTimeout(state.frameAckTimer);
      state.awaitingFrameAck = false;
      state.sentFrameAt = 0;
      this.pumpFrame(state);
    }
  }

  status() {
    const now = Date.now();
    return [...this.clients.values()].map((state) => ({
      clientId: state.clientId,
      role: this.controllerClientId === state.clientId ? 'controller' : 'viewer',
      address: state.remoteAddress,
      connectedForMs: now - state.connectedAt,
      lastSeenAgeMs: now - state.lastSeenAt,
      websocketBufferedBytes: state.ws.bufferedAmount || 0,
      awaitingFrameAck: state.awaitingFrameAck,
      awaitingFrameAckMs: state.awaitingFrameAck && state.sentFrameAt ? now - state.sentFrameAt : 0,
      pendingFrameSequence: state.pendingFrame?.sequence || null,
      droppedFrames: state.droppedFrames || 0,
      frameAckTimeouts: state.frameAckTimeouts || 0,
      lastFrameAck: state.lastFrameAck,
      upload: state.uploadState ? {
        fileIndex: state.uploadState.currentIndex,
        currentBytes: state.uploadState.currentBytes,
        totalBytes: state.uploadState.totalBytes,
        declaredTotal: state.uploadState.declaredTotal
      } : null
    }));
  }

  get size() {
    return this.clients.size;
  }
}

const hub = new ClientHub();

class CdpController {
  constructor() {
    this.ws = null;
    this.endpoint = '';
    this.transportPromise = null;
    this.connectPromise = null;
    this.connectPromiseTargetId = null;
    this.pending = new Map();
    this.nextId = 1;
    this.sessionId = null;
    this.target = null;
    this.lifecycleQueue = new SerialQueue();
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.reconnectDueAt = 0;
    this.connectingSocket = null;
    this.lastConnectError = null;
    this.lastConnectErrorAt = 0;
    this.lastConnectErrorLogAt = 0;
    this.lastConnectNotice = '';
    this.lastConnectNoticeAt = 0;
    this.lastEndpointInfo = null;
    this.tabsTimer = null;
    this.frameRecoveryPromise = null;
    this.snapshotPromise = null;
    this.screencastRunning = false;
    this.screencastViewportRevision = 0;
    this.screencastSupported = true;
    this.frameMode = 'waiting';
    this.lastScreencastFrameAt = 0;
    this.lastScreencastSequence = 0;
    this.lastScreencastTimestamp = 0;
    this.lastAnyFrameAt = 0;
    this.lastFrameSequence = 0;
    this.lastFrameStatsBroadcastAt = 0;
    this.lastFrameMetadata = null;
    this.latestFrame = null;
    this.frameEpoch = 1;
    this.layoutMetrics = null;
    this.layoutMetricsAt = 0;
    this.layoutMetricsTargetId = null;
    this.layoutMetricsViewportRevision = 0;
    this.layoutMetricsPromise = null;
    this.layoutRefreshTimer = null;
    this.lastSnapshotAt = 0;
    this.lastSnapshotSuccessAt = 0;
    this.lastIdleSharpenFailAt = 0;
    this.consecutiveSnapshotFailures = 0;
    this.lastRecoveryActionAt = 0;
    this.lastScreencastStartAt = 0;
    this.lastAdaptiveSwitchAt = 0;
    this.adaptiveCandidate = null;
    this.adaptiveCandidateSince = 0;
    this.clearProbeBlockedUntil = 0;
    this.viewportFallbackTimer = null;
    this.lastVisualDemandAt = 0;
    this.lastVisualDemandSequence = 0;
    this.visualDemandTimer = null;
    this.fileChooserSupported = true;
    this.fileChooserInterceptionEnabled = false;
    this.fileChooserArmTimer = null;
    this.fileChooserArmUntil = 0;
    this.fileChooserArmReason = '';
    this.runtimeDomainEnabled = false;
    this.domDomainEnabled = false;
    this.pendingFileChooser = null;
    this.lastResolvedFileChooser = null;
    this.fileChooserBroadcastAt = 0;
    this.userActivationSerial = 0;
    this.lastUserActivationAt = 0;
    this.touchActive = false;
    this.activeTouchMode = null;
    this.activeGestureId = null;
    this.activeTouchStartedAt = 0;
    this.activeTouchStartPoint = null;
    this.lastTouchPoint = { x: 0, y: 0, u: null, v: null, context: null };
    this.touchQueue = [];
    this.touchPumpRunning = false;
    this.followDesktopTabs = FOLLOW_DESKTOP_TABS_DEFAULT;
    this.desktopTabFollowStrategy = DESKTOP_TAB_FOLLOW_STRATEGY;
    this.desktopTabProbePromise = null;
    this.desktopTabProbeTimer = null;
    this.lastDesktopTabProbeAt = 0;
    this.uiaState = null;
    this.uiaFollowPromise = null;
    this.uiaUnavailableNoticeAt = 0;
    this.uiaMonitor = new EdgeUiaMonitor({
      scriptPath: path.join(ROOT_DIR, 'helpers', 'edge-uia-monitor.ps1'),
      pollMs: UIA_POLL_MS,
      restartMs: UIA_RESTART_MS,
      logger: (level, message, data) => log(level, message, data)
    });
    this.uiaMonitor.on('state', (state) => {
      this.handleUiaState(state).catch((error) => {
        log('info', 'Windows UI Automation 标签跟随处理失败', { error: error.message });
      });
    });
    this.uiaMonitor.on('status', (status) => {
      hub.broadcastJson({ type: 'desktopTabFollowStatus', strategy: this.desktopTabFollowStrategy, status });
    });
    if (this.followDesktopTabs && this.desktopTabFollowStrategy === 'uia') this.uiaMonitor.start();
    this.lastCurrentVisibilityCheckAt = 0;
    this.lastCrossWindowProbeAt = 0;
    // Windows UI Automation is the default foreground-tab signal. The legacy
    // Runtime/document.hasFocus() probe remains an explicit fallback only and
    // is disabled in strict manual mode unless the operator opts in.
    this.desktopEdgeFocused = null;
    this.desktopEdgeFocusAt = 0;
    this.screencastVisible = true;
    this.targetLastActiveAt = new Map();
    this.lastConnectionActivatedTarget = false;
    // Strict manual mode is a low-interference, human-operated profile
    // intended for ChatGPT and Claude. It deliberately does NOT spoof the
    // user agent, navigator.webdriver, request headers, or browser fingerprint.
    // Instead it keeps a real desktop Edge environment, resizes the real window,
    // and maps phone gestures to ordinary mouse/wheel/keyboard input.
    this.manualCompatibilityOverride = null;
    this.manualCompatibilityActive = false;
    this.manualCompatibilityDomain = '';
    this.manualCompatibilityReason = 'off';
    this.manualCompatibilitySavedWindows = new Map();
    this.manualCompatibilityWindowId = null;
    this.manualCompatibilityAudit = null;
    this.manualCompatibilityAuditAt = 0;
    this.manualCompatibilityApplyPromise = null;
    this.manualCompatibilityRefreshTimer = null;
    this.strictNativeTouchEnabled = STRICT_NATIVE_TOUCH_DEFAULT;
    this.dedicatedWindowEnabled = PHONE_DEDICATED_WINDOW_DEFAULT;
    this.dedicatedWindowId = null;
    this.targetWindowIds = new Map();
    this.viewport = {
      width: 412,
      height: 732,
      dpr: 2,
      mobile: true,
      quality: SCREENCAST_QUALITY,
      desktopWidth: DEFAULT_DESKTOP_WIDTH,
      streamPreset: DEFAULT_STREAM_PRESET,
      effectiveStreamPreset: DEFAULT_STREAM_PRESET === 'auto' ? 'realtime' : DEFAULT_STREAM_PRESET,
      revision: 0
    };

    this.watchdog = setInterval(() => this.watchdogTick().catch((error) => {
      log('warn', '画面看门狗异常', { error: error.message });
    }), 1000);
    this.watchdog.unref?.();
  }

  transportIsOpen() {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  isOpen() {
    return this.transportIsOpen() && Boolean(this.sessionId);
  }

  notifyConnectionState(level, message, key = message, minimumInterval = 3000) {
    const now = Date.now();
    if (this.lastConnectNotice === key && now - this.lastConnectNoticeAt < minimumInterval) return;
    this.lastConnectNotice = key;
    this.lastConnectNoticeAt = now;
    hub.broadcastJson({ type: 'status', level, message });
  }

  async handleTransportFailure(error, endpointInfo = null) {
    const now = Date.now();
    const message = error?.message || String(error);
    const code = error?.code || error?.cause?.code || '';
    this.lastConnectError = { message, code: String(code || ''), at: now };
    this.lastConnectErrorAt = now;
    this.lastEndpointInfo = endpointInfo || this.lastEndpointInfo;

    const logKey = `${code}:${message}`;
    if (this._lastLoggedConnectError !== logKey || now - this.lastConnectErrorLogAt > 12000) {
      this._lastLoggedConnectError = logKey;
      this.lastConnectErrorLogAt = now;
      log('warn', 'Edge CDP 暂时不可用', {
        error: message,
        code: code || null,
        endpoint: endpointInfo?.endpoint || this.endpoint || null
      });
    }

    if (FIXED_CDP_BROWSER_WS || !EDGE_MANAGED_SESSION) {
      this.notifyConnectionState('warn', `暂时无法连接 Edge：${message}；控制器会继续自动重试。`, `fixed:${logKey}`, 6000);
      return;
    }

    const running = await edgeRuntime.processRunning(true);
    if (running === false) {
      if (edgeRuntime.lastLaunchAt && now - edgeRuntime.lastLaunchAt < 9000) {
        this.notifyConnectionState(
          'info',
          'Edge 进程正在启动，控制器会等待新的动态调试端口。',
          'edge-process-starting',
          5000
        );
        return;
      }
      const launched = await edgeRuntime.launch('cdp-endpoint-unavailable');
      if (launched) {
        this.notifyConnectionState(
          'warn',
          '检测到 Edge 已退出，正在按原配置、原登录状态和代理参数自动重启；当前手机画面会保留。',
          'edge-auto-restart',
          5000
        );
      } else {
        this.notifyConnectionState(
          'error',
          EDGE_AUTO_RESTART
            ? 'Edge 当前未运行，自动重启正在等待冷却或启动失败。可先双击“启动.cmd”恢复。'
            : 'Edge 当前未运行。请重新双击“启动.cmd”。',
          'edge-not-running',
          6000
        );
      }
      return;
    }

    if (running === true) {
      const recentLaunch = edgeRuntime.lastLaunchAt && now - edgeRuntime.lastLaunchAt < 9000;
      if (recentLaunch) {
        this.notifyConnectionState(
          'info',
          'Edge 正在启动并生成动态调试端口，控制器会自动接回。',
          'edge-starting',
          5000
        );
        return;
      }
      await edgeRuntime.openInspect('cdp-endpoint-unavailable');
      this.notifyConnectionState(
        'warn',
        'Edge 仍在运行，但远程调试端口没有监听。已重新打开 edge://inspect；请将“Allow remote debugging for this browser instance”取消勾选后再勾选一次。',
        'debug-port-not-listening',
        10000
      );
      return;
    }

    this.notifyConnectionState('warn', `无法确认 Edge 运行状态：${message}；控制器会继续自动重试。`, `edge-state-unknown:${logKey}`, 8000);
  }

  async ensureTransport() {
    if (this.transportIsOpen()) return;
    if (this.transportPromise) return this.transportPromise;

    this.transportPromise = (async () => {
      let endpointInfo = null;
      let socket = null;
      let opened = false;
      try {
        endpointInfo = readBrowserWebSocketInfo();
        this.lastEndpointInfo = endpointInfo;

        if (
          !endpointInfo.fixed &&
          edgeRuntime.lastLaunchAt &&
          endpointInfo.mtimeMs + 1200 < edgeRuntime.lastLaunchAt
        ) {
          const staleError = new Error('DevToolsActivePort 属于上一次已退出的 Edge，正在等待新实例生成端口');
          staleError.code = 'ESTALEACTIVEPORT';
          throw staleError;
        }

        socket = new WebSocket(endpointInfo.endpoint, {
          perMessageDeflate: false,
          handshakeTimeout: 8000,
          maxPayload: 64 * 1024 * 1024
        });
        this.connectingSocket = socket;

        await new Promise((resolve, reject) => {
          let settled = false;
          const finish = (error = null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            socket.off('open', onOpen);
            socket.off('error', onError);
            socket.off('close', onClose);
            if (error) reject(error);
            else resolve();
          };
          const onOpen = () => {
            opened = true;
            finish();
          };
          const onError = (connectionError) => finish(connectionError);
          const onClose = (code, reason) => {
            const closeError = new Error(`Edge 浏览器 CDP 在握手前关闭（${code}${reason?.length ? `：${reason.toString()}` : ''}）`);
            closeError.code = 'ECDPCLOSED';
            finish(closeError);
          };
          const timer = setTimeout(() => {
            const timeoutError = new Error('连接 Edge 浏览器 CDP 超时');
            timeoutError.code = 'ETIMEDOUT';
            finish(timeoutError);
          }, 10000);
          socket.once('open', onOpen);
          socket.once('error', onError);
          socket.once('close', onClose);
        });

        if (this.connectingSocket !== socket) {
          const superseded = new Error('Edge CDP 连接尝试已被新的连接替换');
          superseded.code = 'ESUPERSEDED';
          throw superseded;
        }

        const oldSocket = this.ws;
        this.ws = socket;
        this.connectingSocket = null;
        this.endpoint = endpointInfo.endpoint;
        socket.on('message', (data) => this.onMessage(socket, data));
        socket.on('close', (code, reason) => this.onTransportClose(socket, code, reason));
        socket.on('error', (socketError) => {
          if (socket !== this.ws) return;
          const key = `${socketError.code || ''}:${socketError.message}`;
          if (this._lastSocketError !== key || Date.now() - this._lastSocketErrorAt > 12000) {
            this._lastSocketError = key;
            this._lastSocketErrorAt = Date.now();
            log('warn', '已建立的 Edge CDP WebSocket 出错', { error: socketError.message, code: socketError.code || null });
          }
        });

        if (oldSocket && oldSocket !== socket) {
          try { oldSocket.removeAllListeners(); } catch {}
          try { oldSocket.close(); } catch {}
        }

        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this.reconnectDueAt = 0;
        this.reconnectAttempt = 0;
        const recovered = Boolean(this.lastConnectError);
        this.lastConnectError = null;
        edgeRuntime.cachedProcessRunning = true;
        edgeRuntime.lastProcessCheckAt = Date.now();

        await this.sendBrowser('Target.getTargets', {}, { timeout: 8000 });
        await this.sendBrowser('Target.setDiscoverTargets', { discover: true }).catch(() => {});
        log('info', recovered ? '已重新连接 Edge 浏览器级 CDP' : '已连接 Edge 浏览器级 CDP', {
          endpoint: endpointInfo.endpoint
        });
        if (recovered) this.notifyConnectionState('ok', '已重新连接 Windows Edge。', 'edge-reconnected', 1000);
      } catch (error) {
        if (this.connectingSocket === socket) this.connectingSocket = null;
        if (socket && socket === this.ws) {
          try { socket.removeAllListeners(); } catch {}
          this.ws = null;
          this.endpoint = '';
          this.sessionId = null;
          this.screencastRunning = false;
          this.frameMode = 'disconnected';
          clearTimeout(this.fileChooserArmTimer);
          this.fileChooserArmTimer = null;
          this.fileChooserArmUntil = 0;
          this.fileChooserArmReason = '';
          this.fileChooserInterceptionEnabled = false;
          this.runtimeDomainEnabled = false;
          this.domDomainEnabled = false;
          try { socket.terminate(); } catch {}
        } else if (socket) {
          try { socket.removeAllListeners(); } catch {}
          try { socket.terminate(); } catch {}
        }
        await this.handleTransportFailure(error, endpointInfo);
        throw error;
      }
    })().finally(() => {
      this.transportPromise = null;
    });

    return this.transportPromise;
  }

  onTransportClose(socket, code, reason) {
    if (socket !== this.ws) return;
    this.invalidateFileChooser('cdp-disconnected');
    this.ws = null;
    this.endpoint = '';
    this.sessionId = null;
    this.screencastRunning = false;
    this.frameMode = 'disconnected';
    clearTimeout(this.fileChooserArmTimer);
    this.fileChooserArmTimer = null;
    this.fileChooserArmUntil = 0;
    this.fileChooserArmReason = '';
    this.fileChooserInterceptionEnabled = false;
    this.runtimeDomainEnabled = false;
    this.domDomainEnabled = false;
    this.touchQueue.length = 0;
    this.touchActive = false;
    this.activeTouchMode = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Edge CDP 连接已关闭'));
    }
    this.pending.clear();
    this.notifyConnectionState('warn', 'Edge 调试连接断开，正在检查 Edge 并自动恢复；当前画面会保留。', 'edge-transport-closed', 4000);
    log('warn', 'Edge CDP 连接关闭', { code, reason: reason?.toString() || '' });
    const closeError = new Error(`Edge CDP 连接关闭（${code}）`);
    closeError.code = code === 1006 ? 'ECONNRESET' : 'ECDPCLOSED';
    this.handleTransportFailure(closeError, this.lastEndpointInfo).catch(() => {});
    this.scheduleReconnect(1000);
  }

  scheduleReconnect(delayOverride = null) {
    if (this.isOpen() || this.reconnectTimer) return;
    const delay = delayOverride === null
      ? Math.min(12000, 900 * (2 ** Math.min(this.reconnectAttempt++, 4)))
      : Math.max(150, Number(delayOverride) || 150);
    this.reconnectDueAt = Date.now() + delay;
    const timer = setTimeout(() => {
      if (this.reconnectTimer !== timer) return;
      this.reconnectTimer = null;
      this.reconnectDueAt = 0;
      this.ensureConnected(this.target?.id).catch(() => {});
    }, delay);
    this.reconnectTimer = timer;
    timer.unref?.();
  }

  sendRaw(method, params = {}, sessionId = undefined, options = {}) {
    if (!this.transportIsOpen()) return Promise.reject(new Error('尚未连接 Edge'));
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    if (options.noWait) {
      try {
        this.ws.send(JSON.stringify(payload));
        return Promise.resolve({});
      } catch (error) {
        return Promise.reject(error);
      }
    }

    return new Promise((resolve, reject) => {
      const timeout = clampInt(options.timeout, 1000, 60000, 12000);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超时`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer, method });
      this.ws.send(JSON.stringify(payload), (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  sendBrowser(method, params = {}, options = {}) {
    return this.sendRaw(method, params, undefined, options);
  }

  send(method, params = {}, options = {}) {
    if (!this.sessionId) return Promise.reject(new Error('尚未附加到 Edge 标签页'));
    return this.sendRaw(method, params, this.sessionId, options);
  }

  onMessage(socket, raw) {
    if (socket !== this.ws) return;
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }

    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || `${pending.method} 失败`));
      else pending.resolve(message.result || {});
      return;
    }

    if (!message.sessionId) {
      this.handleBrowserEvent(message).catch((error) => {
        log('warn', '处理浏览器 CDP 事件失败', { method: message.method, error: error.message });
      });
      return;
    }

    if (message.sessionId !== this.sessionId) return;
    this.handlePageEvent(message).catch((error) => {
      log('warn', '处理页面 CDP 事件失败', { method: message.method, error: error.message });
    });
  }

  async handleBrowserEvent(message) {
    const { method, params = {} } = message;
    if (method === 'Target.targetCreated' || method === 'Target.targetInfoChanged' || method === 'Target.targetDestroyed') {
      if (method === 'Target.targetInfoChanged' && params.targetInfo?.targetId === this.target?.id) {
        this.target = {
          ...this.target,
          title: params.targetInfo.title || this.target.title || '',
          url: params.targetInfo.url || this.target.url || ''
        };
        this.publishState().catch(() => {});
        this.scheduleManualCompatibilityRefresh(40, 'target-info-changed');
      }
      this.scheduleTabsPublish();
    }

    if (method === 'Target.targetCreated' && AUTO_SWITCH_NEW_TABS) {
      const info = params.targetInfo;
      if (info?.type === 'page' && info.openerId && info.openerId === this.target?.id) {
        setTimeout(() => {
          if (this.followDesktopTabs) this.scheduleDesktopTabProbe(20, 'new-tab');
          else this.ensureConnected(info.targetId, { activate: true, reason: 'new-tab' }).then(() => this.recoverFrames(true)).catch(() => {});
        }, 350).unref?.();
      }
    }

    if (method === 'Target.targetDestroyed' && params.targetId) {
      this.targetWindowIds.delete(params.targetId);
    }

    if (method === 'Target.targetDestroyed' && params.targetId === this.target?.id) {
      await this.releaseActiveInput('标签页关闭').catch(() => {});
      this.invalidateFileChooser('target-destroyed');
      this.sessionId = null;
      this.screencastRunning = false;
      setTimeout(() => this.ensureConnected().catch(() => {}), 300).unref?.();
    }

    if (method === 'Target.detachedFromTarget' && params.sessionId === this.sessionId) {
      await this.releaseActiveInput('标签页调试会话断开').catch(() => {});
      this.invalidateFileChooser('target-detached');
      this.sessionId = null;
      this.screencastRunning = false;
      setTimeout(() => this.ensureConnected(this.target?.id).catch(() => {}), 300).unref?.();
    }

    if (method === 'Target.targetCrashed' && params.targetId === this.target?.id) {
      hub.broadcastJson({ type: 'status', level: 'error', message: '当前 Edge 标签页渲染进程崩溃，请刷新或切换标签页。' });
    }
  }

  async handlePageEvent(message) {
    const { method, params = {} } = message;

    if (method === 'Page.screencastFrame') {
      this.send('Page.screencastFrameAck', { sessionId: params.sessionId }, { noWait: true }).catch(() => {});
      if (!this.screencastRunning) return;
      this.lastScreencastFrameAt = Date.now();
      this.frameMode = 'screencast';
      const metadata = this.normalizeFrameMetadata({
        ...(params.metadata || {}),
        viewportRevision: this.screencastViewportRevision
      }, 'screencast');
      if (!this.layoutMetrics || this.layoutMetricsTargetId !== this.target?.id || Date.now() - this.layoutMetricsAt > 1800) {
        this.scheduleLayoutMetricsRefresh(40);
      }
      this.lastScreencastSequence = this.publishFrame(Buffer.from(params.data, 'base64'), metadata);
      this.lastScreencastTimestamp = Number(metadata.timestamp) || 0;
      return;
    }

    if (method === 'Page.screencastVisibilityChanged') {
      this.screencastVisible = Boolean(params.visible);
      if (!params.visible) {
        if (this.followDesktopTabs) {
          // Edge 整个应用退到后台时，页面仍可能报告 visibility=visible，
          // 但不会有 document.hasFocus()。此时只保留当前标签和最后一帧，
          // 不激活 Edge、不重新附加，也不把切换 Windows 应用误判为切换标签。
          this.desktopEdgeFocused = false;
          this.desktopEdgeFocusAt = Date.now();
          this.scheduleDesktopTabProbe(80, 'screencast-hidden');
          this.scheduleVisualRefresh('edge-background', 180);
        } else {
          hub.broadcastJson({ type: 'status', level: 'warn', message: 'Edge 标签页暂时不可见，正在重新激活画面。' });
          await this.sendBrowser('Target.activateTarget', { targetId: this.target?.id }).catch(() => {});
          await this.send('Page.bringToFront').catch(() => {});
          this.scheduleVisualRefresh('visibility', 120);
        }
      } else {
        this.desktopEdgeFocused = true;
        this.desktopEdgeFocusAt = Date.now();
        this.noteTargetActive(this.target?.id, 'visible');
        this.scheduleVisualRefresh('visibility-restored', 80);
      }
      return;
    }

    if (method === 'Page.fileChooserOpened') {
      await this.handleFileChooserOpened(params);
      return;
    }

    if (method === 'Page.javascriptDialogOpening') {
      hub.broadcastJson({
        type: 'dialog',
        dialogType: params.type,
        message: params.message || '网页弹窗',
        defaultPrompt: params.defaultPrompt || ''
      });
      return;
    }

    if (method === 'Page.frameRequestedNavigation' && params.frameId && params.url) {
      // A user clicking a normal link may leave or enter a compatibility domain.
      // Switch the environment before the destination document commits when the
      // requested URL is already known. This reduces transient phone/desktop
      // metric changes without intercepting, delaying, or rewriting the request.
      const desired = this.resolveManualCompatibility(params.url);
      if (desired.active !== this.manualCompatibilityActive ||
          desired.hostname !== this.manualCompatibilityDomain ||
          desired.reason !== this.manualCompatibilityReason) {
        await this.refreshManualCompatibility('frame-requested-navigation', true, params.url).catch((error) => {
          log('info', '导航前严格人工模式切换失败；将在页面提交后重试', {
            url: String(params.url || '').slice(0, 500),
            error: error.message
          });
        });
      }
      return;
    }

    if (method === 'Page.frameNavigated' || method === 'Page.navigatedWithinDocument') {
      if (method === 'Page.frameNavigated' && !params.frame?.parentId) {
        this.bumpFrameEpoch('navigation');
        if (params.frame?.url && this.target) this.target = { ...this.target, url: params.frame.url };
        this.layoutMetrics = null;
        this.layoutMetricsAt = 0;
        this.layoutMetricsTargetId = null;
        this.layoutMetricsViewportRevision = 0;
        this.scheduleManualCompatibilityRefresh(40, 'main-frame-navigation');
      } else if (method === 'Page.navigatedWithinDocument') {
        this.scheduleManualCompatibilityRefresh(60, 'same-document-navigation');
      }
      this.invalidateFileChooser('navigation');
      setTimeout(() => this.publishState().catch(() => {}), 80).unref?.();
      this.scheduleLayoutMetricsRefresh(80);
      this.scheduleVisualRefresh('navigation', 180);
      this.scheduleTabsPublish(180);
      return;
    }

    if (method === 'Page.loadEventFired' || method === 'Page.frameStoppedLoading' || method === 'Page.frameResized') {
      this.scheduleLayoutMetricsRefresh(method === 'Page.frameResized' ? 40 : 100);
      this.scheduleVisualRefresh(method, 100);
      if (method === 'Page.loadEventFired') {
        this.publishState().catch(() => {});
        this.scheduleManualCompatibilityRefresh(80, 'page-load');
      }
    }
  }

  bumpFrameEpoch(reason = 'transition') {
    this.frameEpoch += 1;
    hub.broadcastJson({ type: 'frameEpoch', epoch: this.frameEpoch, reason, targetId: this.target?.id || null });
    return this.frameEpoch;
  }

  normalizeViewportMetric(metric = {}, includeScale = false) {
    const normalized = {
      offsetX: Number(metric.offsetX) || 0,
      offsetY: Number(metric.offsetY) || 0,
      pageX: Number(metric.pageX) || 0,
      pageY: Number(metric.pageY) || 0,
      clientWidth: Math.max(0, Number(metric.clientWidth) || 0),
      clientHeight: Math.max(0, Number(metric.clientHeight) || 0)
    };
    if (includeScale) normalized.scale = Number(metric.scale) > 0 ? Number(metric.scale) : 0;
    return normalized;
  }

  async refreshLayoutMetrics(force = false) {
    if (!this.isOpen()) return this.layoutMetrics;
    const now = Date.now();
    if (!force && this.layoutMetrics && this.layoutMetricsTargetId === this.target?.id && now - this.layoutMetricsAt < 900) {
      return this.layoutMetrics;
    }
    if (this.layoutMetricsPromise) return this.layoutMetricsPromise;
    const targetId = this.target?.id || null;
    const viewportRevision = Math.max(0, Number(this.viewport.revision) || 0);
    this.layoutMetricsPromise = (async () => {
      try {
        const result = await this.send('Page.getLayoutMetrics', {}, { timeout: 6000 });
        if (targetId !== this.target?.id || viewportRevision !== Math.max(0, Number(this.viewport.revision) || 0)) {
          return this.layoutMetrics;
        }
        this.layoutMetrics = {
          cssLayoutViewport: this.normalizeViewportMetric(result.cssLayoutViewport || result.layoutViewport || {}),
          cssVisualViewport: this.normalizeViewportMetric(result.cssVisualViewport || result.visualViewport || {}, true),
          cssContentSize: {
            x: Number(result.cssContentSize?.x) || 0,
            y: Number(result.cssContentSize?.y) || 0,
            width: Math.max(0, Number(result.cssContentSize?.width) || 0),
            height: Math.max(0, Number(result.cssContentSize?.height) || 0)
          }
        };
        this.layoutMetricsAt = Date.now();
        this.layoutMetricsTargetId = targetId;
        this.layoutMetricsViewportRevision = viewportRevision;
        return this.layoutMetrics;
      } catch (error) {
        if (force) log('info', '暂时无法读取页面布局指标，将使用画面元数据换算触摸坐标', { error: error.message });
        return this.layoutMetrics;
      }
    })().finally(() => {
      this.layoutMetricsPromise = null;
    });
    return this.layoutMetricsPromise;
  }

  scheduleLayoutMetricsRefresh(delay = 80) {
    clearTimeout(this.layoutRefreshTimer);
    this.layoutRefreshTimer = setTimeout(() => {
      this.refreshLayoutMetrics(true).catch(() => {});
    }, delay);
    this.layoutRefreshTimer.unref?.();
  }

  normalizeFrameMetadata(metadata = {}, source = 'screencast') {
    const normalized = {
      offsetTop: Number.isFinite(Number(metadata.offsetTop)) ? Number(metadata.offsetTop) : 0,
      pageScaleFactor: Number(metadata.pageScaleFactor) || 1,
      deviceWidth: Number(metadata.deviceWidth) || this.viewport.width,
      deviceHeight: Number(metadata.deviceHeight) || this.viewport.height,
      scrollOffsetX: Number(metadata.scrollOffsetX) || 0,
      scrollOffsetY: Number(metadata.scrollOffsetY) || 0,
      timestamp: Number(metadata.timestamp) || Date.now() / 1000,
      source,
      viewportRevision: Math.max(0, Number(metadata.viewportRevision) || Number(this.viewport.revision) || 0),
      metricsViewportRevision: Math.max(0, Number(this.layoutMetricsViewportRevision) || 0)
    };
    const metrics = this.layoutMetricsTargetId === this.target?.id ? this.layoutMetrics : null;
    if (metrics?.cssVisualViewport) normalized.cssVisualViewport = { ...metrics.cssVisualViewport };
    if (metrics?.cssLayoutViewport) normalized.cssLayoutViewport = { ...metrics.cssLayoutViewport };
    const scales = resolveNativeScales(normalized);
    normalized.nativeScaleX = scales.scaleX;
    normalized.nativeScaleY = scales.scaleY;
    normalized.coordinateScaleSource = scales.source;
    return normalized;
  }

  publishFrame(buffer, metadata, contentType = 'image/jpeg') {
    const sequence = ++this.lastFrameSequence;
    const fullMetadata = {
      ...metadata,
      contentType,
      sequence,
      serverTime: Date.now(),
      targetId: this.target?.id || null,
      epoch: this.frameEpoch
    };
    const frame = {
      sequence,
      buffer,
      metadata: fullMetadata,
      packet: makeFramePacket(buffer, fullMetadata),
      contentType
    };
    this.latestFrame = frame;
    this.lastFrameMetadata = fullMetadata;
    this.lastAnyFrameAt = Date.now();
    hub.queueFrame(frame);
    const now = Date.now();
    if (now - this.lastFrameStatsBroadcastAt >= 400 || fullMetadata.source !== 'screencast') {
      this.lastFrameStatsBroadcastAt = now;
      hub.broadcastJson({
        type: 'frameStats',
        sequence,
        source: fullMetadata.source,
        frameMode: this.frameMode,
        serverTime: fullMetadata.serverTime,
        epoch: fullMetadata.epoch,
        targetId: fullMetadata.targetId
      });
    }
    return sequence;
  }

  async listTargets() {
    await this.ensureTransport();
    const result = await this.sendBrowser('Target.getTargets');
    return (result.targetInfos || [])
      .filter((target) => target.type === 'page')
      .map((target) => ({
        id: target.targetId,
        targetId: target.targetId,
        type: target.type,
        title: target.title || '',
        url: target.url || '',
        openerId: target.openerId || null,
        attached: Boolean(target.attached),
        controllable: /^(https?|file|about|data|blob|chrome-error):/i.test(target.url || '')
      }));
  }

  noteTargetActive(targetId, reason = 'active') {
    if (!targetId) return;
    this.targetLastActiveAt.set(targetId, Date.now());
    if (this.targetLastActiveAt.size > 120) {
      const sorted = [...this.targetLastActiveAt.entries()].sort((a, b) => b[1] - a[1]);
      this.targetLastActiveAt = new Map(sorted.slice(0, 80));
    }
    this.lastDesktopActiveReason = reason;
  }

  async inspectTargetVisibility(target) {
    if (!target?.id || !target.controllable) return { target, visible: false, focused: false, unavailable: true };
    const expression = `(() => ({
      visibilityState: document.visibilityState || '',
      hidden: Boolean(document.hidden),
      focused: Boolean(document.hasFocus && document.hasFocus()),
      url: location.href,
      title: document.title
    }))()`;
    let temporarySessionId = null;
    try {
      let result;
      if (target.id === this.target?.id && this.sessionId) {
        result = await this.send('Runtime.evaluate', { expression, returnByValue: true }, { timeout: 3500 });
      } else {
        const attached = await this.sendBrowser('Target.attachToTarget', { targetId: target.id, flatten: true }, { timeout: 5000 });
        temporarySessionId = attached.sessionId || null;
        if (!temporarySessionId) throw new Error('没有临时标签页会话');
        result = await this.sendRaw('Runtime.evaluate', { expression, returnByValue: true }, temporarySessionId, { timeout: 3500 });
      }
      const value = result.result?.value || {};
      return {
        target: {
          ...target,
          url: value.url || target.url || '',
          title: value.title || target.title || ''
        },
        visible: value.visibilityState === 'visible' || value.hidden === false,
        focused: Boolean(value.focused),
        visibilityState: String(value.visibilityState || '')
      };
    } catch (error) {
      return { target, visible: false, focused: false, unavailable: true, error: error.message };
    } finally {
      if (temporarySessionId) {
        await this.sendBrowser('Target.detachFromTarget', { sessionId: temporarySessionId }, { timeout: 3000 }).catch(() => {});
      }
    }
  }

  async findForegroundTarget(targets, options = {}) {
    const controllable = (targets || []).filter((item) => item.controllable);
    if (!controllable.length) return null;
    const preferredId = options.preferredId || this.target?.id || null;
    const ordered = [...controllable].sort((a, b) => {
      if (a.id === preferredId) return -1;
      if (b.id === preferredId) return 1;
      return (this.targetLastActiveAt.get(b.id) || 0) - (this.targetLastActiveAt.get(a.id) || 0);
    });
    const observations = [];
    // 标签页数量通常不多；分小批并发检查，避免逐个附加造成明显等待。
    for (let index = 0; index < ordered.length; index += 4) {
      const batch = await Promise.all(ordered.slice(index, index + 4).map((target) => this.inspectTargetVisibility(target)));
      observations.push(...batch);
      const focused = observations.find((item) => item.focused);
      if (focused) return focused.target;
    }
    if (options.requireFocused) return null;
    const visible = observations.find((item) => item.visible);
    if (visible) return visible.target;
    return controllable.find((item) => item.id === preferredId) || this.chooseTarget(controllable, null);
  }

  desktopTabFollowPayload() {
    return {
      enabled: this.followDesktopTabs,
      strategy: this.desktopTabFollowStrategy,
      uia: {
        ...this.uiaMonitor.status,
        edgeForeground: this.uiaState?.edgeForeground === true,
        tabTitle: String(this.uiaState?.tabTitle || ''),
        addressAvailable: Boolean(this.uiaState?.address)
      },
      runtimeFallbackAllowed: !this.manualCompatibilityActive || STRICT_RUNTIME_TAB_FALLBACK
    };
  }

  async handleUiaState(state = {}) {
    this.uiaState = state;
    if (!this.followDesktopTabs || this.desktopTabFollowStrategy !== 'uia') return false;
    if (state.edgeForeground !== true) {
      this.desktopEdgeFocused = false;
      this.desktopEdgeFocusAt = Date.now();
      return false;
    }
    this.desktopEdgeFocused = true;
    this.desktopEdgeFocusAt = Date.now();
    if (!this.transportIsOpen()) return false;
    if (this.uiaFollowPromise) return this.uiaFollowPromise;

    const promise = (async () => {
      const targets = await this.listTargets();
      // 专用窗口模式：只跟随专用窗口内的标签；主窗口的活动不改变手机画面。
      const allowedTargetIds = await this.dedicatedTargetIdSet(targets);
      const matched = chooseTargetFromUia(targets, state, allowedTargetIds ? { allowedTargetIds } : {});
      if (!matched?.target) {
        const now = Date.now();
        if (now - this.uiaUnavailableNoticeAt > 20000 && state.tabTitle) {
          this.uiaUnavailableNoticeAt = now;
          log('info', 'UI Automation 已识别 Edge 前台标签，但无法唯一匹配 CDP 标签；保持手机当前标签', {
            tabTitle: String(state.tabTitle || '').slice(0, 180),
            hasAddress: Boolean(state.address),
            targetCount: targets.length
          });
        }
        return false;
      }
      const foreground = matched.target;
      this.noteTargetActive(foreground.id, `uia-${matched.confidence}`);
      if (foreground.id === this.target?.id) return false;
      await this.ensureConnected(foreground.id, { activate: false, reason: 'desktop-follow-uia' });
      hub.broadcastJson({
        type: 'status',
        level: 'ok',
        message: `手机已跟随电脑 Edge 标签：${foreground.title || foreground.url || '未命名标签页'}`
      });
      return true;
    })().finally(() => {
      if (this.uiaFollowPromise === promise) this.uiaFollowPromise = null;
    });
    this.uiaFollowPromise = promise;
    return promise;
  }

  scheduleDesktopTabProbe(delay = 80, reason = 'scheduled') {
    if (!this.followDesktopTabs) return;
    if (this.desktopTabFollowStrategy === 'uia') {
      this.uiaMonitor.start();
      if (this.uiaState) {
        clearTimeout(this.desktopTabProbeTimer);
        this.desktopTabProbeTimer = setTimeout(() => {
          this.desktopTabProbeTimer = null;
          this.handleUiaState(this.uiaState).catch(() => {});
        }, Math.max(20, Number(delay) || 20));
        this.desktopTabProbeTimer.unref?.();
      }
      return;
    }
    if (this.desktopTabFollowStrategy === 'manual') return;
    if (this.manualCompatibilityActive && !STRICT_RUNTIME_TAB_FALLBACK) return;
    clearTimeout(this.desktopTabProbeTimer);
    this.desktopTabProbeTimer = setTimeout(() => {
      this.desktopTabProbeTimer = null;
      this.probeDesktopActiveTab(true, reason).catch((error) => {
        log('info', '暂时无法识别电脑当前标签页', { reason, error: error.message });
      });
    }, Math.max(20, Number(delay) || 20));
    this.desktopTabProbeTimer.unref?.();
  }

  async probeDesktopActiveTab(force = false, reason = 'poll') {
    if (!this.followDesktopTabs || !this.transportIsOpen()) return false;
    if (this.desktopTabFollowStrategy === 'uia') {
      this.lastDesktopTabProbeAt = Date.now();
      this.uiaMonitor.start();
      return this.uiaState ? this.handleUiaState(this.uiaState) : false;
    }
    if (this.desktopTabFollowStrategy !== 'runtime') return false;
    if (this.manualCompatibilityActive && !STRICT_RUNTIME_TAB_FALLBACK) return false;
    if (this.desktopTabProbePromise) return this.desktopTabProbePromise;
    const now = Date.now();
    if (!force && now - this.lastDesktopTabProbeAt < Math.max(250, this.activeTabPollInterval() * 0.65)) return false;
    this.lastDesktopTabProbeAt = now;
    this.desktopTabProbePromise = (async () => {
      if (this.target && this.sessionId) {
        const current = await this.inspectTargetVisibility({ ...this.target, controllable: true });
        this.lastCurrentVisibilityCheckAt = Date.now();
        if (current.focused) {
          this.desktopEdgeFocused = true;
          this.desktopEdgeFocusAt = Date.now();
          this.noteTargetActive(this.target.id, 'desktop-focused');
          return false;
        }
      }

      const targets = await this.listTargets();
      const foreground = await this.findForegroundTarget(targets, {
        preferredId: this.target?.id || null,
        requireFocused: true
      });
      if (!foreground) {
        this.desktopEdgeFocused = false;
        this.desktopEdgeFocusAt = Date.now();
        return false;
      }

      this.desktopEdgeFocused = true;
      this.desktopEdgeFocusAt = Date.now();
      if (foreground.id === this.target?.id) {
        this.noteTargetActive(foreground.id, 'desktop-focused');
        return false;
      }

      this.noteTargetActive(foreground.id, reason);
      await this.ensureConnected(foreground.id, { activate: false, reason: 'desktop-follow-runtime' });
      hub.broadcastJson({
        type: 'status',
        level: 'ok',
        message: `手机已跟随电脑切换到标签页：${foreground.title || foreground.url || '未命名标签页'}`
      });
      return true;
    })().finally(() => {
      this.desktopTabProbePromise = null;
    });
    return this.desktopTabProbePromise;
  }

  async setFollowDesktopTabs(enabled) {
    this.followDesktopTabs = Boolean(enabled);
    clearTimeout(this.desktopTabProbeTimer);
    this.desktopTabProbeTimer = null;
    if (this.desktopTabFollowStrategy === 'uia') {
      if (this.followDesktopTabs) this.uiaMonitor.start();
      else this.uiaMonitor.stop();
    }
    hub.broadcastJson({
      type: 'desktopTabFollow',
      enabled: this.followDesktopTabs,
      strategy: this.desktopTabFollowStrategy,
      status: this.desktopTabFollowPayload()
    });
    this.publishCapabilities();
    if (this.followDesktopTabs) this.scheduleDesktopTabProbe(20, 'setting-enabled');
    return this.desktopTabFollowPayload();
  }

  activeTabPollInterval() {
    if (this.desktopTabFollowStrategy === 'uia') return UIA_POLL_MS;
    return this.manualCompatibilityActive ? MANUAL_COMPATIBILITY_TAB_POLL_MS : ACTIVE_TAB_POLL_MS;
  }

  effectiveManualCompatibilityMode() {
    return this.manualCompatibilityOverride || MANUAL_COMPATIBILITY_MODE;
  }

  resolveManualCompatibility(url = this.target?.url || '') {
    const mode = this.effectiveManualCompatibilityMode();
    const hostname = hostnameFromUrl(url);
    const domainMatched = hostnameMatchesDomains(hostname, MANUAL_COMPATIBILITY_DOMAINS);
    const active = mode === 'always' || (mode === 'auto' && domainMatched);
    let reason = 'disabled';
    if (active && mode === 'always') reason = 'always';
    else if (active && domainMatched) reason = 'domain';
    else if (mode === 'off') reason = 'off';
    else if (!hostname) reason = 'no-host';
    else reason = 'domain-not-matched';
    return { active, mode, hostname, domainMatched, reason };
  }

  manualCompatibilityPayload() {
    const strictInputProfile = this.strictNativeTouchEnabled
      ? 'desktop-native-touch'
      : 'desktop-mouse-wheel';
    return {
      type: 'manualCompatibility',
      label: '严格人工模式',
      configuredMode: MANUAL_COMPATIBILITY_MODE,
      mode: this.effectiveManualCompatibilityMode(),
      active: this.manualCompatibilityActive,
      domain: this.manualCompatibilityDomain,
      reason: this.manualCompatibilityReason,
      domains: [...MANUAL_COMPATIBILITY_DOMAINS],
      windowWidth: MANUAL_COMPATIBILITY_WINDOW_WIDTH,
      windowHeight: MANUAL_COMPATIBILITY_WINDOW_HEIGHT,
      restoreWindow: MANUAL_COMPATIBILITY_RESTORE_WINDOW,
      tabPollMs: this.activeTabPollInterval(),
      profileName: this.manualCompatibilityActive ? 'strict-manual' : 'general-touch',
      inputProfile: this.manualCompatibilityActive ? strictInputProfile : 'touch-emulation',
      nativeTouchEnabled: Boolean(this.manualCompatibilityActive && this.strictNativeTouchEnabled),
      auditAutomatic: false,
      idleCdpDomains: ['Target', 'Page', 'Input'],
      runtimeDomainEnabled: this.runtimeDomainEnabled,
      domDomainEnabled: this.domDomainEnabled,
      fileChooserInterceptionEnabled: this.fileChooserInterceptionEnabled,
      fileChooserArmedUntil: this.fileChooserArmUntil || 0,
      desktopTabFollow: this.desktopTabFollowPayload(),
      audit: this.manualCompatibilityAudit
    };
  }

  publishManualCompatibility(onlyWs = null) {
    const payload = this.manualCompatibilityPayload();
    if (onlyWs) sendJson(onlyWs, payload);
    else hub.broadcastJson(payload);
    return payload;
  }

  scheduleManualCompatibilityRefresh(delay = 80, reason = 'scheduled') {
    clearTimeout(this.manualCompatibilityRefreshTimer);
    this.manualCompatibilityRefreshTimer = setTimeout(() => {
      this.manualCompatibilityRefreshTimer = null;
      this.refreshManualCompatibility(reason).catch((error) => {
        log('warn', '严格人工模式刷新失败', { reason, error: error.message });
      });
    }, Math.max(20, Number(delay) || 20));
    this.manualCompatibilityRefreshTimer.unref?.();
  }

  async readPageEnvironment(force = false) {
    if (!this.isOpen()) return this.manualCompatibilityAudit;
    const now = Date.now();
    if (!force && this.manualCompatibilityAudit && now - this.manualCompatibilityAuditAt < MANUAL_COMPATIBILITY_AUDIT_TTL_MS) {
      return this.manualCompatibilityAudit;
    }
    const expression = `(() => {
      const media = (query) => { try { return matchMedia(query).matches; } catch { return false; } };
      const uaData = navigator.userAgentData ? {
        mobile: Boolean(navigator.userAgentData.mobile),
        platform: String(navigator.userAgentData.platform || ''),
        brands: Array.isArray(navigator.userAgentData.brands)
          ? navigator.userAgentData.brands.slice(0, 8).map((item) => ({brand:String(item.brand || ''), version:String(item.version || '')}))
          : []
      } : null;
      return {
        url: location.href,
        title: document.title,
        userAgent: navigator.userAgent,
        platform: navigator.platform || '',
        userAgentData: uaData,
        webdriver: navigator.webdriver === true,
        language: navigator.language || '',
        maxTouchPoints: Number(navigator.maxTouchPoints) || 0,
        devicePixelRatio: Number(devicePixelRatio) || 1,
        innerWidth: Number(innerWidth) || 0,
        innerHeight: Number(innerHeight) || 0,
        outerWidth: Number(outerWidth) || 0,
        outerHeight: Number(outerHeight) || 0,
        screen: {
          width: Number(screen.width) || 0,
          height: Number(screen.height) || 0,
          availWidth: Number(screen.availWidth) || 0,
          availHeight: Number(screen.availHeight) || 0,
          colorDepth: Number(screen.colorDepth) || 0,
          pixelDepth: Number(screen.pixelDepth) || 0
        },
        pointer: {
          fine: media('(pointer:fine)'),
          coarse: media('(pointer:coarse)'),
          hover: media('(hover:hover)'),
          anyFine: media('(any-pointer:fine)'),
          anyCoarse: media('(any-pointer:coarse)')
        },
        focused: Boolean(document.hasFocus && document.hasFocus()),
        visibilityState: document.visibilityState || ''
      };
    })()`;
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true
    }, { timeout: 6000 }).catch((error) => {
      log('info', '读取网页环境信息失败', { error: error.message });
      return null;
    });
    const value = result?.result?.value;
    if (!value) return this.manualCompatibilityAudit;
    this.manualCompatibilityAudit = {
      ...value,
      checkedAt: Date.now(),
      modeActive: this.manualCompatibilityActive,
      automationFlagUntouched: true,
      note: '控制器不会修改 User-Agent、navigator.webdriver、平台或请求标头。'
    };
    this.manualCompatibilityAuditAt = Date.now();
    return this.manualCompatibilityAudit;
  }

  async currentBrowserWindow() {
    if (!this.target?.id || !this.transportIsOpen()) return null;
    try {
      return await this.sendBrowser('Browser.getWindowForTarget', { targetId: this.target.id }, { timeout: 6000 });
    } catch (error) {
      try {
        return await this.sendBrowser('Browser.getWindowForTarget', {}, { timeout: 6000 });
      } catch {
        log('info', '当前 Edge 不支持读取标签页窗口尺寸', { error: error.message });
        return null;
      }
    }
  }

  async restoreManualCompatibilityWindow(windowId, saved = null) {
    const snapshot = saved || this.manualCompatibilitySavedWindows.get(windowId);
    if (!snapshot || !this.transportIsOpen()) return false;
    const bounds = snapshot.bounds || {};
    try {
      const normalBounds = {
        left: Number.isFinite(bounds.left) ? Math.round(bounds.left) : undefined,
        top: Number.isFinite(bounds.top) ? Math.round(bounds.top) : undefined,
        width: Number.isFinite(bounds.width) ? Math.max(200, Math.round(bounds.width)) : undefined,
        height: Number.isFinite(bounds.height) ? Math.max(200, Math.round(bounds.height)) : undefined,
        windowState: 'normal'
      };
      for (const key of Object.keys(normalBounds)) {
        if (normalBounds[key] === undefined) delete normalBounds[key];
      }
      await this.sendBrowser('Browser.setWindowBounds', { windowId, bounds: normalBounds }, { timeout: 7000 }).catch(() => {});
      const originalState = ['normal', 'minimized', 'maximized', 'fullscreen'].includes(bounds.windowState)
        ? bounds.windowState
        : 'normal';
      if (originalState !== 'normal') {
        await this.sendBrowser('Browser.setWindowBounds', {
          windowId,
          bounds: { windowState: originalState }
        }, { timeout: 7000 }).catch(() => {});
      }
      this.manualCompatibilitySavedWindows.delete(windowId);
      if (this.manualCompatibilityWindowId === windowId) this.manualCompatibilityWindowId = null;
      return true;
    } catch (error) {
      log('warn', '恢复 Edge 原窗口尺寸失败', { windowId, error: error.message });
      return false;
    }
  }

  async restoreAllManualCompatibilityWindows() {
    if (!MANUAL_COMPATIBILITY_RESTORE_WINDOW) {
      this.manualCompatibilitySavedWindows.clear();
      this.manualCompatibilityWindowId = null;
      return;
    }
    for (const [windowId, saved] of [...this.manualCompatibilitySavedWindows.entries()]) {
      await this.restoreManualCompatibilityWindow(windowId, saved).catch(() => {});
    }
  }

  async ensureManualCompatibilityWindow() {
    if (!this.manualCompatibilityActive || !this.isOpen()) return null;
    const info = await this.currentBrowserWindow();
    const windowId = Number(info?.windowId);
    if (!Number.isInteger(windowId)) return null;

    if (this.manualCompatibilityWindowId && this.manualCompatibilityWindowId !== windowId) {
      await this.restoreManualCompatibilityWindow(this.manualCompatibilityWindowId).catch(() => {});
    }
    // 手机专用窗口由控制器创建，尺寸本来就是严格模式窄窗口；不保存、不恢复，
    // 也就不存在“恢复失败”问题（WIN-001 与 STRICT-002 的交互）。
    const dedicatedWindowActive = this.dedicatedWindowEnabled && windowId === this.dedicatedWindowId;
    this.manualCompatibilityWindowId = dedicatedWindowActive ? null : windowId;
    if (!dedicatedWindowActive && !this.manualCompatibilitySavedWindows.has(windowId)) {
      this.manualCompatibilitySavedWindows.set(windowId, {
        windowId,
        bounds: { ...(info.bounds || {}) },
        targetId: this.target?.id || null,
        savedAt: Date.now()
      });
    }

    const current = info.bounds || {};
    const width = MANUAL_COMPATIBILITY_WINDOW_WIDTH;
    const height = MANUAL_COMPATIBILITY_WINDOW_HEIGHT;
    try {
      if (current.windowState && current.windowState !== 'normal') {
        await this.sendBrowser('Browser.setWindowBounds', {
          windowId,
          bounds: { windowState: 'normal' }
        }, { timeout: 7000 });
      }
      if (Math.abs((Number(current.width) || 0) - width) > 3 || Math.abs((Number(current.height) || 0) - height) > 3 || current.windowState !== 'normal') {
        const bounds = { width, height, windowState: 'normal' };
        if (Number.isFinite(current.left)) bounds.left = Math.round(current.left);
        if (Number.isFinite(current.top)) bounds.top = Math.round(current.top);
        await this.sendBrowser('Browser.setWindowBounds', { windowId, bounds }, { timeout: 7000 });
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
      return { windowId, width, height };
    } catch (error) {
      log('warn', '设置严格人工模式窗口尺寸失败；将继续使用当前真实 Edge 窗口', {
        windowId,
        error: error.message
      });
      return { windowId, width: Number(current.width) || 0, height: Number(current.height) || 0, error: error.message };
    }
  }

  async clearPageEmulationForManualCompatibility() {
    if (!this.isOpen()) return;
    await this.send('Emulation.clearDeviceMetricsOverride').catch((error) => {
      log('info', '清除设备尺寸仿真失败', { error: error.message });
    });
    const nativeTouch = Boolean(this.strictNativeTouchEnabled);
    await this.send('Emulation.setTouchEmulationEnabled', {
      enabled: nativeTouch,
      ...(nativeTouch ? { maxTouchPoints: 5 } : {})
    }).catch((error) => {
      log('info', `${nativeTouch ? '开启' : '关闭'}严格人工模式触摸事件失败`, { error: error.message });
    });
    await this.send('Emulation.setEmitTouchEventsForMouse', {
      enabled: false,
      configuration: 'desktop'
    }).catch(() => {});
    await this.send('Emulation.resetPageScaleFactor').catch(() => {});
  }

  async setStrictNativeTouch(enabled) {
    const next = Boolean(enabled);
    if (this.strictNativeTouchEnabled === next) return this.manualCompatibilityPayload();
    await this.releaseActiveInput('严格人工模式输入切换').catch(() => {});
    this.strictNativeTouchEnabled = next;
    if (this.manualCompatibilityActive && this.isOpen()) {
      await this.clearPageEmulationForManualCompatibility();
      this.layoutMetrics = null;
      this.layoutMetricsAt = 0;
      await this.refreshLayoutMetrics(true).catch(() => {});
      await this.captureSnapshot('strict-input-mode', true).catch(() => {});
    }
    this.publishManualCompatibility();
    this.publishCapabilities();
    hub.broadcastJson({
      type: 'status',
      level: 'info',
      message: next
        ? '严格人工模式已临时切换为原生触摸；网页可能观察到触摸能力。'
        : '严格人工模式已恢复为桌面鼠标与滚轮输入。'
    });
    return this.manualCompatibilityPayload();
  }

  async applyManualCompatibilityEnvironment(restart = true) {
    if (!this.isOpen()) return;
    if (restart) await this.stopScreencast();
    await this.clearPageEmulationForManualCompatibility();
    await this.ensureManualCompatibilityWindow();
    this.layoutMetrics = null;
    this.layoutMetricsAt = 0;
    this.layoutMetricsTargetId = null;
    this.layoutMetricsViewportRevision = 0;
    await this.refreshLayoutMetrics(true).catch(() => {});
    if (restart) {
      const sequenceAtStart = this.lastFrameSequence;
      await this.startScreencast(true);
      this.scheduleSnapshotIfStreamSilent('manual-compatibility-fallback', sequenceAtStart, 1000);
    }
    hub.broadcastJson({ type: 'viewport', ...this.viewport, mobile: false });
    this.publishManualCompatibility();
  }

  async prepareManualCompatibilityForSession(url = this.target?.url || '', reason = 'session-init') {
    const desired = this.resolveManualCompatibility(url);
    const wasActive = this.manualCompatibilityActive;
    const previousDomain = this.manualCompatibilityDomain;
    if (wasActive && !desired.active) await this.restoreAllManualCompatibilityWindows();
    if (!desired.active || desired.hostname !== previousDomain) {
      this.strictNativeTouchEnabled = STRICT_NATIVE_TOUCH_DEFAULT;
    }
    this.manualCompatibilityActive = desired.active;
    this.manualCompatibilityDomain = desired.hostname;
    this.manualCompatibilityReason = desired.reason;
    this.manualCompatibilityAudit = null;
    this.manualCompatibilityAuditAt = 0;
    log('info', '严格人工模式会话状态', {
      reason,
      active: desired.active,
      mode: desired.mode,
      hostname: desired.hostname || null
    });
  }

  async currentPageUrlWithoutRuntime(fallback = '') {
    if (!this.isOpen()) return String(fallback || this.target?.url || '');
    const history = await this.send('Page.getNavigationHistory', {}, { timeout: 4000 }).catch(() => null);
    const entry = history?.entries?.[history.currentIndex];
    return String(entry?.url || fallback || this.target?.url || '');
  }

  async refreshManualCompatibility(reason = 'refresh', force = false, urlHint = '') {
    if (this.manualCompatibilityApplyPromise) {
      this.scheduleManualCompatibilityRefresh(120, `${reason}-after-current`);
      return this.manualCompatibilityApplyPromise;
    }
    const promise = (async () => {
      let url = String(urlHint || this.target?.url || '');
      if (this.isOpen() && !urlHint) url = await this.currentPageUrlWithoutRuntime(url);
      const desired = this.resolveManualCompatibility(url);
      const changed = desired.active !== this.manualCompatibilityActive ||
        desired.hostname !== this.manualCompatibilityDomain ||
        desired.reason !== this.manualCompatibilityReason;
      if (!changed && !force) return this.manualCompatibilityPayload();

      const wasActive = this.manualCompatibilityActive;
      const previousDomain = this.manualCompatibilityDomain;
      if (this.isOpen()) {
        await this.releaseActiveInput('严格人工模式切换').catch(() => {});
        await this.stopScreencast().catch(() => {});
      }
      if (wasActive && !desired.active) await this.restoreAllManualCompatibilityWindows();

      if (!desired.active || desired.hostname !== previousDomain) {
        this.strictNativeTouchEnabled = STRICT_NATIVE_TOUCH_DEFAULT;
      }
      this.manualCompatibilityActive = desired.active;
      this.manualCompatibilityDomain = desired.hostname;
      this.manualCompatibilityReason = desired.reason;
      this.manualCompatibilityAudit = null;
      this.manualCompatibilityAuditAt = 0;

      if (this.isOpen()) {
        if (changed) this.bumpFrameEpoch('manual-compatibility');
        await this.configurePageDomainsForCurrentMode();
        if (desired.active) await this.applyManualCompatibilityEnvironment(false);
        else await this.applyViewport(false);
        await this.startScreencast(true);
        await this.captureSnapshot('manual-compatibility-change', true).catch(() => {});
      }
      this.publishCapabilities();
      this.publishManualCompatibility();
      log('info', '严格人工模式已更新', {
        reason,
        active: desired.active,
        mode: desired.mode,
        hostname: desired.hostname || null
      });
      return this.manualCompatibilityPayload();
    })().finally(() => {
      if (this.manualCompatibilityApplyPromise === promise) this.manualCompatibilityApplyPromise = null;
    });
    this.manualCompatibilityApplyPromise = promise;
    return promise;
  }

  async setManualCompatibilityMode(mode) {
    const normalized = ['auto', 'always', 'off'].includes(String(mode || '').toLowerCase())
      ? String(mode).toLowerCase()
      : 'auto';
    // 手机每次连接都会重放该偏好；值没变时不要强制整套重建显示环境
    // （停/启截屏流、重开截图），否则每次重连都产生一轮画面抖动与日志。
    const changed = normalized !== this.manualCompatibilityOverride;
    this.manualCompatibilityOverride = normalized;
    return this.refreshManualCompatibility('phone-setting', changed);
  }

  chooseTarget(targets, targetId = null) {
    if (!targets.length) throw new Error('Edge 没有可控制的网页标签页');
    if (targetId) {
      const requested = targets.find((item) => item.id === targetId);
      if (!requested) throw new Error('指定的 Edge 标签页已经不存在');
      if (!requested.controllable) throw new Error('该 Edge 内部页面不能通过手机控制器操作');
      return requested;
    }
    const controllable = targets.filter((item) => item.controllable);
    return controllable.find((item) => /^(https?|file):/i.test(item.url || '')) ||
      controllable.find((item) => !/^about:blank$/i.test(item.url || '')) ||
      controllable[0] ||
      (() => { throw new Error('当前只有 Edge 内部页面，请先在电脑 Edge 中打开一个普通网页。'); })();
  }

  async ensureConnected(targetId = null, options = {}) {
    if (this.isOpen() && (!targetId || this.target?.id === targetId)) return;
    if (this.connectPromise) {
      // 在途连接若目标不同，不能直接复用其结果——那会把用户显式选择的
      // 标签静默丢掉（selectTarget 返回 ok 却没切换）。等它结束后按请求
      // 的目标重新确保连接。
      if (!targetId || this.connectPromiseTargetId === targetId) return this.connectPromise;
      await this.connectPromise.catch(() => {});
      return this.ensureConnected(targetId, options);
    }
    const connectOptions = {
      activate: typeof options.activate === 'boolean' ? options.activate : !this.followDesktopTabs,
      reason: String(options.reason || (targetId ? 'target' : 'connect'))
    };
    const promise = this.lifecycleQueue.run(() => this.connect(targetId, connectOptions));
    this.connectPromise = promise;
    this.connectPromiseTargetId = targetId || null;
    try {
      return await promise;
    } finally {
      if (this.connectPromise === promise) {
        this.connectPromise = null;
        this.connectPromiseTargetId = null;
      }
      if (!this.isOpen()) this.scheduleReconnect();
    }
  }

  async connect(targetId = null, options = {}) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectDueAt = 0;
    const activate = typeof options.activate === 'boolean' ? options.activate : !this.followDesktopTabs;
    const reason = String(options.reason || 'target');
    const recoveringWithoutSession = !this.sessionId;
    await this.ensureTransport();
    const targets = await this.listTargets();
    let target;
    try {
      if (!targetId && this.followDesktopTabs) {
        if (this.desktopTabFollowStrategy === 'uia' && this.uiaState?.edgeForeground === true) {
          target = chooseTargetFromUia(targets, this.uiaState)?.target || null;
        } else if (this.desktopTabFollowStrategy === 'runtime' && (!this.manualCompatibilityActive || STRICT_RUNTIME_TAB_FALLBACK)) {
          target = await this.findForegroundTarget(targets, { preferredId: this.target?.id || null });
        }
      }
      if (!target) target = this.chooseTarget(targets, targetId);
    } catch (error) {
      if (!targetId || !recoveringWithoutSession || !/已经不存在/.test(error.message || '')) throw error;
      if (this.followDesktopTabs && this.desktopTabFollowStrategy === 'uia' && this.uiaState?.edgeForeground === true) {
        target = chooseTargetFromUia(targets, this.uiaState)?.target || null;
      } else if (this.followDesktopTabs && this.desktopTabFollowStrategy === 'runtime' && (!this.manualCompatibilityActive || STRICT_RUNTIME_TAB_FALLBACK)) {
        target = await this.findForegroundTarget(targets, { preferredId: null });
      } else {
        target = this.chooseTarget(targets, null);
      }
      if (!target) target = this.chooseTarget(targets, null);
      log('info', 'Edge 重启后原标签页 ID 已变化，已自动选择新的可控制标签页', {
        previousTargetId: targetId,
        newTargetId: target.id
      });
    }

    if (this.sessionId) {
      await this.releaseActiveInput('切换标签页').catch(() => {});
      this.invalidateFileChooser('target-switch');
      const oldSession = this.sessionId;
      this.sessionId = null;
      this.screencastRunning = false;
      await this.sendRaw('Page.stopScreencast', {}, oldSession).catch(() => {});
      await this.sendBrowser('Target.detachFromTarget', { sessionId: oldSession }).catch(() => {});
    }

    if (activate) await this.sendBrowser('Target.activateTarget', { targetId: target.id }).catch(() => {});
    const attached = await this.sendBrowser('Target.attachToTarget', { targetId: target.id, flatten: true });
    if (!attached.sessionId) throw new Error('Edge 没有返回标签页调试会话');

    this.target = target;
    this.sessionId = attached.sessionId;
    clearTimeout(this.fileChooserArmTimer);
    this.fileChooserArmTimer = null;
    this.fileChooserArmUntil = 0;
    this.fileChooserArmReason = '';
    this.runtimeDomainEnabled = false;
    this.domDomainEnabled = false;
    this.fileChooserInterceptionEnabled = false;
    this.lastConnectionActivatedTarget = activate;
    this.noteTargetActive(target.id, activate ? 'phone-activated' : reason);
    this.screencastRunning = false;
    this.screencastSupported = true;
    this.frameMode = 'initializing';
    this.layoutMetrics = null;
    this.layoutMetricsAt = 0;
    this.layoutMetricsTargetId = null;
    this.layoutMetricsViewportRevision = 0;
    this.invalidateFileChooser('target-connect');
    this.touchActive = false;
    this.activeTouchMode = null;
    this.activeGestureId = null;
    this.activeTouchStartedAt = 0;
    this.activeTouchStartPoint = null;
    this.consecutiveSnapshotFailures = 0;
    this.bumpFrameEpoch(reason === 'desktop-follow' ? 'desktop-tab-follow' : 'target');

    await this.initializePageSession({ activate });
  }

  async setRuntimeDomain(enabled) {
    const next = Boolean(enabled);
    if (this.runtimeDomainEnabled === next) return true;
    try {
      await this.send(next ? 'Runtime.enable' : 'Runtime.disable', {}, { timeout: 5000 });
      this.runtimeDomainEnabled = next;
      return true;
    } catch (error) {
      if (next) throw error;
      this.runtimeDomainEnabled = false;
      return false;
    }
  }

  async setDomDomain(enabled) {
    const next = Boolean(enabled);
    if (this.domDomainEnabled === next) return true;
    try {
      await this.send(next ? 'DOM.enable' : 'DOM.disable', {}, { timeout: 5000 });
      this.domDomainEnabled = next;
      return true;
    } catch (error) {
      if (next) throw error;
      this.domDomainEnabled = false;
      return false;
    }
  }

  async setFileChooserInterception(enabled, reason = 'setting') {
    const next = Boolean(enabled);
    if (this.fileChooserInterceptionEnabled === next) return true;
    try {
      await this.send('Page.setInterceptFileChooserDialog', { enabled: next }, { timeout: 5000 });
      this.fileChooserInterceptionEnabled = next;
      this.fileChooserSupported = true;
      log('info', next ? '已临时启用网页文件选择拦截' : '已关闭网页文件选择拦截', { reason });
      return true;
    } catch (error) {
      this.fileChooserSupported = false;
      this.fileChooserInterceptionEnabled = false;
      if (next) log('warn', '当前 Edge 不支持网页文件选择拦截', { reason, error: error.message });
      return false;
    }
  }

  async disarmFileChooserInterception(reason = 'timeout', force = false) {
    clearTimeout(this.fileChooserArmTimer);
    this.fileChooserArmTimer = null;
    this.fileChooserArmUntil = 0;
    this.fileChooserArmReason = '';
    if (this.pendingFileChooser && !force) return false;
    const disabled = await this.setFileChooserInterception(false, reason);
    this.publishManualCompatibility();
    return disabled;
  }

  async armFileChooserInterception(durationMs = FILE_CHOOSER_TRANSIENT_MS, reason = 'user-action') {
    if (!this.isOpen()) return false;
    const duration = Math.max(500, Math.min(180000, Math.round(Number(durationMs) || FILE_CHOOSER_TRANSIENT_MS)));
    const enabled = await this.setFileChooserInterception(true, reason);
    if (!enabled) return false;
    clearTimeout(this.fileChooserArmTimer);
    this.fileChooserArmUntil = Date.now() + duration;
    this.fileChooserArmReason = reason;
    this.fileChooserArmTimer = setTimeout(() => {
      this.fileChooserArmTimer = null;
      if (!this.pendingFileChooser) this.disarmFileChooserInterception('arm-expired').catch(() => {});
    }, duration);
    this.fileChooserArmTimer.unref?.();
    this.publishManualCompatibility();
    return true;
  }

  async configurePageDomainsForCurrentMode() {
    // Page and Input are enough for normal viewing and manual input. Runtime,
    // DOM and file chooser interception remain off while idle in every mode.
    // A user-requested audit, calibration or upload transaction enables only
    // the single capability it needs and returns to this minimal state.
    await this.setRuntimeDomain(false).catch(() => {});
    await this.setDomDomain(false).catch(() => {});
    await this.setFileChooserInterception(false, 'session-idle').catch(() => {});
    this.fileChooserSupported = true;
  }

  async initializePageSession(options = {}) {
    await this.prepareManualCompatibilityForSession(this.target?.url || '', 'session-init');
    // Idle browsing needs only Page for rendering/navigation and Input for the
    // user's actions. File chooser events are enabled later, only after the
    // user presses the controller's Upload button.
    await this.send('Page.enable');
    await this.configurePageDomainsForCurrentMode();
    if (options.activate) await this.send('Page.bringToFront').catch(() => {});
    await this.applyViewport(false);
    await this.publishState();
    await this.publishTabs();
    this.publishCapabilities();
    this.publishManualCompatibility();
    hub.broadcastJson({ type: 'viewport', ...this.viewport });
    await this.startScreencast(true);
    await this.captureSnapshot('initial', true).catch(() => {});
    hub.broadcastJson({ type: 'status', level: 'ok', message: '已连接 Windows Edge' });
    log('info', '已附加到 Edge 标签页', { title: this.target?.title, url: this.target?.url, targetId: this.target?.id });
  }

  publishCapabilities(onlyWs = null) {
    const payload = {
      type: 'capabilities',
      fileUpload: this.fileChooserSupported,
      computerFilePicker: true,
      computerFileSort: COMPUTER_FILE_SORT,
      browserHistory: true,
      browserHistoryMaxEntries: BROWSER_HISTORY_MAX_ENTRIES,
      maxComputerFiles: MAX_COMPUTER_FILES,
      inputModes: ['devtools', 'nativeTouch'],
      maxUploadBytes: MAX_UPLOAD_BYTES,
      maxUploadFiles: MAX_UPLOAD_FILES,
      uploadAckBytes: UPLOAD_ACK_BYTES,
      autoSwitchNewTabs: AUTO_SWITCH_NEW_TABS,
      followDesktopTabs: this.followDesktopTabs,
      desktopTabFollow: this.desktopTabFollowPayload(),
      desktopTabFollowStrategies: ['uia', 'manual', 'runtime'],
      desktopWidth: DEFAULT_DESKTOP_WIDTH,
      streamPresets: ['auto', 'economy', 'realtime', 'balanced', 'clear'],
      manualCompatibility: this.manualCompatibilityPayload()
    };
    if (onlyWs) sendJson(onlyWs, payload);
    else hub.broadcastJson(payload);
  }

  scheduleTabsPublish(delay = 120) {
    clearTimeout(this.tabsTimer);
    this.tabsTimer = setTimeout(() => this.publishTabs().catch(() => {}), delay);
    this.tabsTimer.unref?.();
  }

  async publishTabs(onlyWs = null) {
    const targets = await this.listTargets();
    const activeId = this.target?.id || null;
    // 专用窗口模式：标签面板只展示专用窗口内的标签；当前标签始终保留。
    const allowed = await this.dedicatedTargetIdSet(targets);
    const visibleTargets = allowed
      ? targets.filter((target) => allowed.has(target.id) || target.id === activeId)
      : targets;
    const tabs = visibleTargets.map((target) => ({
      id: target.id,
      title: target.title || '(无标题)',
      url: target.url || '',
      controllable: target.controllable,
      lastActiveAt: this.targetLastActiveAt.get(target.id) || 0
    })).sort((a, b) => {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
      return (b.lastActiveAt || 0) - (a.lastActiveAt || 0);
    });
    const payload = {
      type: 'tabs',
      activeId,
      followDesktopTabs: this.followDesktopTabs,
      dedicatedWindow: this.dedicatedWindowPayload(),
      tabs
    };
    if (onlyWs) sendJson(onlyWs, payload);
    else hub.broadcastJson(payload);
  }

  async publishState(onlyWs = null) {
    if (!this.isOpen()) return;
    let state = {
      url: this.target?.url || '',
      title: this.target?.title || '',
      visibilityState: '',
      focused: this.desktopEdgeFocused === true,
      canGoBack: false,
      canGoForward: false,
      history: { currentIndex: -1, startIndex: 0, entries: [] }
    };
    try {
      const history = await this.send('Page.getNavigationHistory').catch(() => null);
      if (history) {
        const entries = Array.isArray(history.entries) ? history.entries : [];
        const current = entries[history.currentIndex] || null;
        if (current) {
          state.url = current.url || state.url;
          state.title = current.title || state.title;
        }
        state.canGoBack = history.currentIndex > 0;
        state.canGoForward = history.currentIndex >= 0 && history.currentIndex < entries.length - 1;
        const total = entries.length;
        const startIndex = Math.max(0, Math.min(total, history.currentIndex - 35));
        const endIndex = Math.min(total, Math.max(history.currentIndex + 36, startIndex + 72));
        state.history = {
          currentIndex: history.currentIndex,
          startIndex,
          total,
          entries: entries.slice(startIndex, endIndex).map((entry, offset) => ({
            id: entry.id,
            index: startIndex + offset,
            url: entry.url || '',
            userTypedURL: entry.userTypedURL || '',
            title: entry.title || '',
            transitionType: entry.transitionType || '',
            current: startIndex + offset === history.currentIndex
          }))
        };
      }

      // Idle browsing deliberately does not execute page JavaScript merely
      // to refresh the address bar or determine focus. This compatibility branch
      // is retained only for an explicitly enabled non-strict Runtime fallback.
      if (!this.manualCompatibilityActive && this.runtimeDomainEnabled) {
        const runtime = await this.send('Runtime.evaluate', {
          expression: '({url: location.href, title: document.title, visibilityState: document.visibilityState, focused: document.hasFocus()})',
          returnByValue: true
        }, { timeout: 3500 }).catch(() => null);
        if (runtime?.result?.value) {
          state = { ...state, ...runtime.result.value };
          if (runtime.result.value.focused) this.noteTargetActive(this.target?.id, 'state-focused');
        }
      }
    } catch {}
    if (this.target) {
      this.target = {
        ...this.target,
        url: state.url || this.target.url || '',
        title: state.title || this.target.title || ''
      };
    }
    const desiredCompatibility = this.resolveManualCompatibility(state.url || this.target?.url || '');
    if (desiredCompatibility.active !== this.manualCompatibilityActive ||
        desiredCompatibility.hostname !== this.manualCompatibilityDomain ||
        desiredCompatibility.reason !== this.manualCompatibilityReason) {
      this.scheduleManualCompatibilityRefresh(30, 'page-state');
    }
    const payload = {
      type: 'pageState',
      ...state,
      targetId: this.target?.id || null,
      followDesktopTabs: this.followDesktopTabs,
      desktopTabFollow: this.desktopTabFollowPayload(),
      manualCompatibility: this.manualCompatibilityPayload()
    };
    if (onlyWs) sendJson(onlyWs, payload);
    else hub.broadcastJson(payload);
  }

  effectiveStreamSettings() {
    let presetName = this.viewport.streamPreset;
    if (presetName === 'auto') {
      // 自动模式下"当前生效档"只由 refreshAdaptiveStreamPreset（带稳定期与
      // 冷却的唯一升降路径）改变；这里只回读当前档。屏幕重启、换页等旁路
      // 调用本函数时绝不即兴跳档，否则一次瞬时压力采样就能绕过全部迟滞。
      presetName = this.viewport.effectiveStreamPreset;
    }
    if (!STREAM_PRESETS[presetName]) presetName = 'realtime';
    const base = { ...STREAM_PRESETS[presetName] };
    if (presetName === 'balanced') base.quality = Math.min(76, clampInt(this.viewport.quality, 30, 95, SCREENCAST_QUALITY));
    if (presetName === 'clear') base.quality = Math.max(82, clampInt(this.viewport.quality, 30, 95, SCREENCAST_QUALITY));
    if (presetName === 'realtime') base.quality = Math.min(62, clampInt(this.viewport.quality, 30, 95, base.quality));
    if (presetName === 'economy') base.quality = Math.min(base.quality, clampInt(this.viewport.quality, 30, 95, base.quality));
    return { name: presetName, ...base };
  }

  scheduleSnapshotIfStreamSilent(source, sequenceAtStart, delay = 1200) {
    clearTimeout(this.viewportFallbackTimer);
    this.viewportFallbackTimer = setTimeout(() => {
      if (!this.isOpen() || this.lastFrameSequence > sequenceAtStart) return;
      this.captureSnapshot(source, true).catch(() => {});
    }, delay);
    this.viewportFallbackTimer.unref?.();
  }

  // 自动档升降决策。压力取控制端（当前操作的手机）：整条画面流是全局单一
  // 质量，而每台手机各自有"最新帧优先"的独立限流（弱网只读端会被单独丢帧、
  // 不会拖累别人），所以全局质量应服务于正在操作的控制端——用最坏值会让
  // 一台卡住/半死的只读手机把整机压成幻灯片且再也升不回来。
  adaptiveLadderNext() {
    const pressure = hub.framePressure();
    const current = ['economy', 'realtime', 'balanced', 'clear'].includes(this.viewport.effectiveStreamPreset)
      ? this.viewport.effectiveStreamPreset
      : 'realtime';
    const severe = pressure.bufferedBytes > 900 * 1024 || pressure.renderMs > 210 || pressure.awaitingAckMs > FRAME_ACK_TIMEOUT_MS * 0.9;
    const mild = pressure.bufferedBytes > 220 * 1024 || pressure.renderMs > 92 || pressure.awaitingAckMs > 180;
    const recovered = pressure.bufferedBytes < 96 * 1024 && pressure.renderMs > 0 && pressure.renderMs < 58 && pressure.awaitingAckMs < 90;
    // 链路"优秀"才允许从均衡升到清晰档（2.5× 采集 + 高 JPEG 质量）：缓冲
    // 几乎清空、渲染与确认都很快，局域网直连通常满足。清晰档若因过载被降下
    // 来，clearProbeBlockedUntil 会压住一段时间再探测，避免"升清晰→过载→降
    // 均衡→又探清晰"每 20 秒一次的抖动（每次都要重启截图、画面闪一下）。
    const excellent = pressure.bufferedBytes < 48 * 1024 && pressure.renderMs > 0 && pressure.renderMs < 46 && pressure.awaitingAckMs < 70;
    const clearAllowed = excellent && Date.now() >= (this.clearProbeBlockedUntil || 0);
    if (current === 'economy') return recovered ? 'realtime' : 'economy';
    if (current === 'clear') return severe ? 'economy' : mild ? 'balanced' : 'clear';
    if (current === 'balanced') return severe ? 'economy' : mild ? 'realtime' : clearAllowed ? 'clear' : 'balanced';
    return severe ? 'economy' : recovered ? 'balanced' : 'realtime';
  }

  async refreshAdaptiveStreamPreset() {
    if (this.viewport.streamPreset !== 'auto' || !this.screencastRunning || !this.isOpen()) return;
    const now = Date.now();
    const next = this.adaptiveLadderNext();
    if (next === this.viewport.effectiveStreamPreset) {
      this.adaptiveCandidate = null;
      this.adaptiveCandidateSince = 0;
      return;
    }
    if (this.adaptiveCandidate !== next) {
      this.adaptiveCandidate = next;
      this.adaptiveCandidateSince = now;
      return;
    }
    // 快降慢升：降档时压力已经在伤害体验，2 秒稳定即可执行且不受 20 秒
    // 冷却/启动静默限制（否则升到清晰后的头 20 秒即使卡成幻灯片也降不
    // 下来）；升档保持 6 秒稳定 + 20 秒冷却 + 启动后 12 秒静默。
    const rank = { economy: 0, realtime: 1, balanced: 2, clear: 3 };
    const isDowngrade = (rank[next] ?? 1) < (rank[this.viewport.effectiveStreamPreset] ?? 1);
    if (now - this.adaptiveCandidateSince < (isDowngrade ? 2000 : 6000)) return;
    if (!isDowngrade && (now - this.lastAdaptiveSwitchAt < 20000 || now - this.lastScreencastStartAt < 12000)) return;

    const sequenceAtStart = this.lastFrameSequence;
    // 从清晰档因过载被降下来：压住清晰档探测 3 分钟，打断 20 秒周期的抖动。
    if (this.viewport.effectiveStreamPreset === 'clear' && isDowngrade) {
      this.clearProbeBlockedUntil = now + 180000;
    }
    this.viewport.effectiveStreamPreset = next;
    this.lastAdaptiveSwitchAt = now;
    this.adaptiveCandidate = null;
    this.adaptiveCandidateSince = 0;
    hub.broadcastJson({ type: 'viewport', ...this.viewport });
    await this.stopScreencast();
    await this.startScreencast(true);
    this.scheduleSnapshotIfStreamSilent(`adaptive-${next}`, sequenceAtStart, 1400);
  }

  async startScreencast(force = false) {
    if (!this.isOpen()) return false;
    if (force && this.screencastRunning) await this.stopScreencast();
    if (this.screencastRunning) return true;

    const stream = this.effectiveStreamSettings();
    this.viewport.effectiveStreamPreset = stream.name;
    const effectiveDpr = Math.min(this.viewport.dpr, stream.maxDpr);
    const maxWidth = Math.min(SCREENCAST_MAX_DIMENSION, Math.max(320, Math.round(this.viewport.width * effectiveDpr)));
    const maxHeight = Math.min(SCREENCAST_MAX_DIMENSION, Math.max(480, Math.round(this.viewport.height * effectiveDpr)));
    try {
      await this.send('Page.startScreencast', {
        format: 'jpeg',
        quality: clampInt(stream.quality, 30, 95, SCREENCAST_QUALITY),
        maxWidth,
        maxHeight,
        everyNthFrame: stream.everyNthFrame
      });
      this.screencastViewportRevision = Math.max(0, Number(this.viewport.revision) || 0);
      this.screencastRunning = true;
      this.screencastSupported = true;
      this.lastScreencastStartAt = Date.now();
      this.frameMode = 'screencast';
      return true;
    } catch (error) {
      this.screencastRunning = false;
      const firstFailure = this.screencastSupported !== false;
      this.screencastSupported = false;
      this.frameMode = 'snapshot';
      // 记录尝试时间，让看门狗按 15 秒节奏重试；否则失败后每秒重试一次，
      // 手机端也会每秒收到一条相同的警告提示。提示只在首次失败时广播。
      this.lastScreencastStartAt = Date.now();
      log('warn', 'Page.startScreencast 失败，将使用截图模式', { error: error.message });
      if (firstFailure) {
        hub.broadcastJson({ type: 'status', level: 'warn', message: '连续画面通道不可用，已切换到稳定截图模式。' });
      }
      return false;
    }
  }

  async stopScreencast() {
    if (!this.screencastRunning || !this.isOpen()) {
      this.screencastRunning = false;
      return;
    }
    await this.send('Page.stopScreencast').catch(() => {});
    this.screencastRunning = false;
  }

  async captureSnapshot(source = 'snapshot', force = false, options = {}) {
    if (!this.isOpen()) return false;
    const now = Date.now();
    if (!force && now - this.lastSnapshotAt < 120) return false;
    if (this.snapshotPromise) return this.snapshotPromise;
    const usePng = options.format === 'png';

    const captureStartedAt = Date.now();
    const sequenceAtStart = this.lastFrameSequence;
    const epochAtStart = this.frameEpoch;
    const viewportRevisionAtStart = Math.max(0, Number(this.viewport.revision) || 0);
    const targetIdAtStart = this.target?.id || null;

    this.snapshotPromise = (async () => {
      this.lastSnapshotAt = Date.now();
      try {
        if (force && !options.noActivate && !this.followDesktopTabs) {
          await this.sendBrowser('Target.activateTarget', { targetId: targetIdAtStart }).catch(() => {});
          await this.send('Page.bringToFront').catch(() => {});
        }
        await this.refreshLayoutMetrics(true).catch(() => {});
        const baseParams = {
          format: usePng ? 'png' : 'jpeg',
          ...(usePng ? {} : { quality: clampInt(this.effectiveStreamSettings().quality, 30, 95, SCREENCAST_QUALITY) }),
          fromSurface: true,
          captureBeyondViewport: false
        };
        let result;
        try {
          result = await this.send('Page.captureScreenshot', { ...baseParams, optimizeForSpeed: true }, { timeout: 15000 });
        } catch (error) {
          if (!/parameter|optimizeForSpeed|invalid/i.test(error.message || '')) throw error;
          result = await this.send('Page.captureScreenshot', baseParams, { timeout: 15000 });
        }
        if (!result.data) throw new Error('Edge 没有返回截图数据');

        // 截图请求可能比连续帧更早开始、却更晚返回。此时若继续发布，手机会在
        // “旧状态截图”和“新状态 screencast”之间来回闪。只保留仍属于当前标签页、
        // 当前画面代际，且请求期间没有更新连续帧的截图。
        if (this.target?.id !== targetIdAtStart || this.frameEpoch !== epochAtStart ||
            Math.max(0, Number(this.viewport.revision) || 0) !== viewportRevisionAtStart) {
          log('info', '丢弃跨标签页或跨画面代际返回的旧截图', {
            source,
            targetIdAtStart,
            currentTargetId: this.target?.id || null,
            epochAtStart,
            currentEpoch: this.frameEpoch
          });
          return false;
        }
        const newerScreencastArrived = this.screencastRunning &&
          this.lastScreencastFrameAt > captureStartedAt &&
          this.lastScreencastSequence > sequenceAtStart;
        if (newerScreencastArrived) {
          log('info', '丢弃被更新连续帧超越的截图', {
            source,
            sequenceAtStart,
            lastScreencastSequence: this.lastScreencastSequence
          });
          this.consecutiveSnapshotFailures = 0;
          this.lastSnapshotSuccessAt = Date.now();
          return false;
        }

        const currentVisualViewport = this.layoutMetricsTargetId === targetIdAtStart &&
          this.layoutMetricsViewportRevision === viewportRevisionAtStart
          ? this.layoutMetrics?.cssVisualViewport
          : null;
        const previousFrame = this.lastFrameMetadata?.targetId === targetIdAtStart &&
          Math.max(0, Number(this.lastFrameMetadata?.viewportRevision) || 0) === viewportRevisionAtStart
          ? this.lastFrameMetadata
          : null;
        const metadata = this.normalizeFrameMetadata({
          // Page.captureScreenshot already starts at the visual viewport origin.
          // Carrying over Page.screencastFrame.offsetTop made fallback screenshots
          // render lower than continuous frames and changed touch coordinates
          // whenever the source switched between screencast and snapshot.
          offsetTop: 0,
          pageScaleFactor: Number(currentVisualViewport?.scale) || Number(previousFrame?.pageScaleFactor) || 1,
          deviceWidth: this.viewport.width,
          deviceHeight: this.viewport.height,
          scrollOffsetX: Number(currentVisualViewport?.pageX) || 0,
          scrollOffsetY: Number(currentVisualViewport?.pageY) || 0,
          timestamp: Date.now() / 1000,
          viewportRevision: viewportRevisionAtStart
        }, source);
        metadata.snapshotBaseSequence = sequenceAtStart;
        metadata.captureStartedAt = captureStartedAt;
        metadata.captureFinishedAt = Date.now();
        if (source !== 'idle-sharpen') {
          this.frameMode = this.screencastRunning ? 'screencast+snapshot' : 'snapshot';
        }
        this.publishFrame(Buffer.from(result.data, 'base64'), metadata, usePng ? 'image/png' : 'image/jpeg');
        this.consecutiveSnapshotFailures = 0;
        this.lastSnapshotSuccessAt = Date.now();
        return true;
      } catch (error) {
        // 高清补拍是纯锦上添花：失败不得推动看门狗进入重启/重连恢复流程。
        if (options.cosmetic) this.lastIdleSharpenFailAt = Date.now();
        else this.consecutiveSnapshotFailures += 1;
        throw error;
      }
    })().finally(() => {
      this.snapshotPromise = null;
    });

    return this.snapshotPromise;
  }

  scheduleVisualRefresh(reason, delay = 180) {
    this.lastVisualDemandAt = Date.now();
    this.lastVisualDemandSequence = this.lastFrameSequence;
    clearTimeout(this.visualDemandTimer);
    this.visualDemandTimer = setTimeout(async () => {
      if (!this.isOpen() || hub.size === 0) return;
      if (this.lastFrameSequence > this.lastVisualDemandSequence) return;
      await this.captureSnapshot(`demand:${reason}`).catch(() => {});
    }, delay);
    this.visualDemandTimer.unref?.();
  }

  async recoverFrames(forceRestart = true) {
    if (this.frameRecoveryPromise) return this.frameRecoveryPromise;
    // ensureConnected 必须在 lifecycleQueue 之外执行：它内部会把 connect()
    // 排进同一队列，如果本函数体也在队列里运行，就会等待排在自己身后的
    // connect() 永远无法开始（可重入死锁），后续所有恢复与重连全部悬挂。
    this.frameRecoveryPromise = (async () => {
      await this.ensureConnected(this.target?.id, { activate: false, reason: 'frame-recovery' });
      await this.lifecycleQueue.run(async () => {
        if (!this.followDesktopTabs) {
          await this.sendBrowser('Target.activateTarget', { targetId: this.target?.id }).catch(() => {});
          await this.send('Page.bringToFront').catch(() => {});
        }
        if (forceRestart) {
          await this.stopScreencast();
          await this.startScreencast(true);
        } else if (!this.screencastRunning) {
          await this.startScreencast(false);
        }
        await this.captureSnapshot('manual-recovery', true);
      });
    })().finally(() => {
      this.frameRecoveryPromise = null;
    });
    return this.frameRecoveryPromise;
  }

  async watchdogTick() {
    if (hub.size === 0) return;
    if (!this.isOpen()) {
      if (!this.connectPromise && !this.transportPromise && !this.reconnectTimer) this.scheduleReconnect(180);
      return;
    }

    const now = Date.now();
    if (this.followDesktopTabs && now - this.lastDesktopTabProbeAt >= this.activeTabPollInterval()) {
      await this.probeDesktopActiveTab(false, 'watchdog').catch(() => {});
      if (!this.isOpen()) return;
    }
    const demandIsRecent = this.lastVisualDemandAt && now - this.lastVisualDemandAt < 12000;
    const demandStillUnmet = demandIsRecent && this.lastFrameSequence <= this.lastVisualDemandSequence;
    if (!this.latestFrame || demandStillUnmet) {
      await this.captureSnapshot(!this.latestFrame ? 'watchdog-first-frame' : 'watchdog-demand', true).catch(() => {});
    }

    // Do not run the destructive reattach/restart recovery loop while Edge is
    // behind another Windows application. Hidden screencast throttling is
    // expected there; retain the last frame and use non-activating snapshots on
    // demand. Once an Edge tab regains document focus, normal recovery resumes.
    const edgeApplicationInBackground = this.followDesktopTabs && this.desktopEdgeFocused === false;

    if (!this.screencastRunning && !edgeApplicationInBackground) {
      const interval = 1000 / SNAPSHOT_FALLBACK_FPS;
      if (now - this.lastSnapshotAt >= interval) {
        await this.captureSnapshot('snapshot-fallback').catch(() => {});
      }
      if (now - this.lastScreencastStartAt > 15000) {
        await this.startScreencast(true).catch(() => {});
      }
    }

    if (!edgeApplicationInBackground && this.consecutiveSnapshotFailures >= 2 && now - this.lastRecoveryActionAt > 5000) {
      this.lastRecoveryActionAt = now;
      if (this.consecutiveSnapshotFailures >= 5) {
        const targetId = this.target?.id;
        const staleSessionId = this.sessionId;
        this.sessionId = null;
        this.screencastRunning = false;
        // 先置空 sessionId 会让 connect() 跳过它的分离分支：旧会话必须在这里
        // 显式分离并作废文件选择拦截，否则每次重挂载都在浏览器连接上遗留一个
        // 附加会话（还可能挂着上传拦截，压住桌面的原生文件对话框）。
        if (staleSessionId) {
          this.invalidateFileChooser('watchdog-reattach');
          await this.sendBrowser('Target.detachFromTarget', { sessionId: staleSessionId }).catch(() => {});
        }
        this.bumpFrameEpoch('reattach');
        await this.ensureConnected(targetId, { activate: false, reason: 'watchdog-reattach' }).catch(() => {});
      } else {
        await this.stopScreencast().catch(() => {});
        await this.startScreencast(true).catch(() => {});
      }
    } else if (edgeApplicationInBackground && this.consecutiveSnapshotFailures > 2) {
      // Prevent a background Edge window from carrying a large failure counter
      // into the moment it returns to the foreground.
      this.consecutiveSnapshotFailures = 2;
    }

    await this.maybeIdleSharpen().catch(() => {});
    await this.refreshAdaptiveStreamPreset().catch(() => {});
  }

  // 静止画面高清化（UX-008）：页面持续无新帧、无输入达到阈值后，用一张无损 PNG
  // 替换最后一帧有损 JPEG，提升阅读清晰度。任何新帧或输入都会自然回到实时流。
  // 只使用 Page.captureScreenshot，不激活窗口，不触碰目标页面 DOM/Runtime。
  async maybeIdleSharpen() {
    if (!IDLE_SHARPEN_ENABLED || hub.size === 0 || !this.isOpen()) return false;
    if (!this.screencastRunning) return false;
    const metadata = this.lastFrameMetadata;
    if (!metadata || metadata.source === 'idle-sharpen') return false;
    if (metadata.targetId !== (this.target?.id || null)) return false;
    if (this.touchActive || this.snapshotPromise || this.frameRecoveryPromise) return false;
    const now = Date.now();
    if (this.lastIdleSharpenFailAt && now - this.lastIdleSharpenFailAt < 30000) return false;
    const lastActivity = Math.max(
      this.lastAnyFrameAt || 0,
      this.lastUserActivationAt || 0,
      this.lastVisualDemandAt || 0
    );
    if (!lastActivity || now - lastActivity < IDLE_SHARPEN_DELAY_MS) return false;
    return this.captureSnapshot('idle-sharpen', true, { format: 'png', noActivate: true, cosmetic: true });
  }

  async applyViewport(restart = true) {
    if (!this.isOpen()) return;
    if (this.manualCompatibilityActive) {
      await this.applyManualCompatibilityEnvironment(restart);
      return;
    }
    if (restart) await this.stopScreencast();
    const { width, height, dpr, mobile } = this.viewport;
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: dpr,
      mobile,
      screenWidth: width,
      screenHeight: height,
      screenOrientation: {
        type: width > height ? 'landscapePrimary' : 'portraitPrimary',
        angle: width > height ? 90 : 0
      }
    });
    await this.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 5
    });
    this.layoutMetrics = null;
    this.layoutMetricsAt = 0;
    this.layoutMetricsTargetId = null;
    this.layoutMetricsViewportRevision = 0;
    await this.refreshLayoutMetrics(true).catch(() => {});
    if (restart) {
      const sequenceAtStart = this.lastFrameSequence;
      await this.startScreencast(true);
      this.scheduleSnapshotIfStreamSilent('viewport-fallback', sequenceAtStart, 1200);
    }
    hub.broadcastJson({ type: 'viewport', ...this.viewport });
  }

  async setViewport(
    width,
    height,
    dpr,
    mobile = this.viewport.mobile,
    desktopWidth = this.viewport.desktopWidth,
    requestedRevision = 0,
    force = false
  ) {
    if (this.manualCompatibilityActive) {
      const currentRevision = Math.max(0, Number(this.viewport.revision) || 0);
      const clientRevision = Math.max(0, Number(requestedRevision) || 0);
      const revision = clientRevision > currentRevision ? clientRevision : (force ? currentRevision + 1 : currentRevision);
      // 严格模式期间只更新修订号，绝不把 mobile:false 写进存储的视口偏好：
      // 那会在退出严格模式后让 applyViewport 以桌面布局渲染手机宽度页面
      // （尺寸异常）。广播里的 mobile:false 仅是当前显示状态。
      this.viewport = { ...this.viewport, revision };
      // The phone may enter fullscreen or hide its address bar, but the strict-site page keeps
      // one stable real Edge window. Only acknowledge the phone geometry revision;
      // do not rewrite screen metrics or restart the page layout.
      this.screencastViewportRevision = revision;
      this.layoutMetricsViewportRevision = revision;
      hub.broadcastJson({ type: 'viewport', ...this.viewport, mobile: false });
      this.publishManualCompatibility();
      if (this.isOpen()) {
        this.scheduleLayoutMetricsRefresh(30);
        this.captureSnapshot('manual-compatibility-viewport-ack', true).catch(() => {});
      }
      return;
    }
    const next = {
      ...this.viewport,
      width: clampInt(width, 240, 2560, this.viewport.width),
      height: clampInt(height, 320, 2560, this.viewport.height),
      dpr: clamp(Number(dpr) || 1, 1, 2.5),
      mobile: Boolean(mobile),
      desktopWidth: clampInt(desktopWidth, 800, 2560, this.viewport.desktopWidth || DEFAULT_DESKTOP_WIDTH)
    };
    const changed = next.width !== this.viewport.width || next.height !== this.viewport.height ||
      next.mobile !== this.viewport.mobile || next.desktopWidth !== this.viewport.desktopWidth ||
      Math.abs(next.dpr - this.viewport.dpr) > 0.05;
    const currentRevision = Math.max(0, Number(this.viewport.revision) || 0);
    const clientRevision = Math.max(0, Number(requestedRevision) || 0);
    if (clientRevision > currentRevision) next.revision = clientRevision;
    else if (changed || force) next.revision = currentRevision + 1;
    else next.revision = currentRevision;

    this.viewport = next;
    if ((changed || force) && this.isOpen()) {
      this.bumpFrameEpoch('viewport');
      await this.lifecycleQueue.run(() => this.applyViewport(true));
    } else {
      hub.broadcastJson({ type: 'viewport', ...this.viewport });
    }
  }

  async setMobile(enabled) {
    if (this.manualCompatibilityActive) {
      // 同上：严格模式的桌面显示状态只进广播，不改写用户的手机/桌面偏好。
      hub.broadcastJson({ type: 'viewport', ...this.viewport, mobile: false });
      this.publishManualCompatibility();
      return;
    }
    await this.setViewport(this.viewport.width, this.viewport.height, this.viewport.dpr, Boolean(enabled), this.viewport.desktopWidth);
  }

  async setStreamPreset(preset) {
    const next = ['auto', 'economy', 'realtime', 'balanced', 'clear'].includes(String(preset)) ? String(preset) : 'auto';
    const changed = next !== this.viewport.streamPreset;
    this.viewport.streamPreset = next;
    this.viewport.effectiveStreamPreset = this.effectiveStreamSettings().name;
    hub.broadcastJson({ type: 'viewport', ...this.viewport });
    if (changed && this.isOpen()) await this.recoverFrames(true);
  }

  async setFrameQuality(quality) {
    this.viewport.quality = clampInt(quality, 30, 95, SCREENCAST_QUALITY);
    this.viewport.streamPreset = 'balanced';
    this.viewport.effectiveStreamPreset = 'balanced';
    hub.broadcastJson({ type: 'viewport', ...this.viewport });
    if (this.isOpen()) await this.recoverFrames(true);
  }

  async navigate(rawUrl) {
    const result = await this.send('Page.navigate', { url: normalizeUrl(rawUrl) });
    if (result.errorText) throw new Error(`网页导航失败：${result.errorText}`);
    this.scheduleVisualRefresh('navigate', 250);
  }

  async reload(ignoreCache = false) {
    await this.send('Page.reload', { ignoreCache: Boolean(ignoreCache) });
    this.scheduleVisualRefresh('reload', 250);
  }

  async navigateHistory(delta) {
    const history = await this.send('Page.getNavigationHistory');
    const nextIndex = history.currentIndex + Number(delta);
    if (nextIndex < 0 || nextIndex >= history.entries.length) return;
    await this.send('Page.navigateToHistoryEntry', { entryId: history.entries[nextIndex].id });
    this.scheduleVisualRefresh('history', 220);
  }

  async navigateHistoryEntry(entryId) {
    const id = Number(entryId);
    if (!Number.isInteger(id)) throw new Error('历史记录 ID 无效');
    const history = await this.send('Page.getNavigationHistory');
    const entry = (history.entries || []).find((item) => Number(item.id) === id);
    if (!entry) throw new Error('该条标签页历史记录已经失效');
    await this.send('Page.navigateToHistoryEntry', { entryId: id });
    this.scheduleLayoutMetricsRefresh(100);
    this.scheduleVisualRefresh('history-entry', 220);
    setTimeout(() => this.publishState().catch(() => {}), 120).unref?.();
  }

  // ---- 手机专用窗口（WIN-001）----------------------------------------------

  dedicatedWindowPayload() {
    return {
      enabled: Boolean(this.dedicatedWindowEnabled),
      windowId: this.dedicatedWindowId || null,
      width: MANUAL_COMPATIBILITY_WINDOW_WIDTH,
      height: MANUAL_COMPATIBILITY_WINDOW_HEIGHT
    };
  }

  async windowIdForTarget(targetId) {
    if (!targetId || !this.transportIsOpen()) return null;
    const cached = this.targetWindowIds.get(targetId);
    const now = Date.now();
    // 用户可能把标签拖出到新窗口，因此缓存只保留 30 秒。
    if (cached && now - cached.at < 30000) return cached.windowId;
    try {
      const info = await this.sendBrowser('Browser.getWindowForTarget', { targetId }, { timeout: 5000 });
      const windowId = Number(info?.windowId);
      if (Number.isInteger(windowId)) {
        this.targetWindowIds.set(targetId, { windowId, at: now });
        if (this.targetWindowIds.size > 200) {
          for (const key of [...this.targetWindowIds.keys()].slice(0, 100)) this.targetWindowIds.delete(key);
        }
        return windowId;
      }
    } catch {}
    return null;
  }

  // 专用窗口内所有可控标签的 ID 集合。模式关闭或窗口不存在时返回 null（不过滤）。
  // 窗口已被关闭或 Edge 重启导致 windowId 失效时清除记录并自愈：模式保持开启，
  // 下次需要时重新创建窗口。
  async dedicatedTargetIdSet(targets = null) {
    if (!this.dedicatedWindowEnabled || !this.dedicatedWindowId || !this.transportIsOpen()) return null;
    const list = targets || await this.listTargets().catch(() => []);
    const set = new Set();
    for (const target of list) {
      const windowId = await this.windowIdForTarget(target.id);
      if (windowId === this.dedicatedWindowId) set.add(target.id);
    }
    if (!set.size) {
      // 集合为空可能只是 Browser.getWindowForTarget 短暂超时（CDP 抖动），
      // 不等于窗口已关闭。先确认窗口确实不存在再清除记录，避免之后误创建
      // 第二个专用窗口。窗口确认仍在时返回空集合（区别于 null=不过滤）：
      // 消费方一律按"保守不动"处理——跟随不切换、面板只显示当前标签、
      // createTab 明确报错让用户重试，绝不把手机标签开进用户主窗口。
      const bounds = await this.sendBrowser('Browser.getWindowBounds', { windowId: this.dedicatedWindowId }, { timeout: 5000 }).catch(() => null);
      if (bounds) return set;
      this.dedicatedWindowId = null;
      return null;
    }
    return set;
  }

  async ensureDedicatedWindow(initialUrl = 'about:blank') {
    await this.ensureTransport();
    if (this.dedicatedWindowId) {
      const existing = await this.dedicatedTargetIdSet();
      if (existing && existing.size) return null;
      // dedicatedTargetIdSet 未清除记录，说明窗口仍然存在，只是暂时无法
      // 枚举其中的标签；此时不要再创建一个重复的专用窗口。
      if (this.dedicatedWindowId) return null;
    }
    const created = await this.sendBrowser('Target.createTarget', { url: initialUrl, newWindow: true });
    if (!created?.targetId) throw new Error('无法创建手机专用 Edge 窗口');
    const info = await this.sendBrowser('Browser.getWindowForTarget', { targetId: created.targetId }, { timeout: 6000 });
    const windowId = Number(info?.windowId);
    if (!Number.isInteger(windowId)) throw new Error('无法读取手机专用窗口标识');
    this.dedicatedWindowId = windowId;
    this.targetWindowIds.set(created.targetId, { windowId, at: Date.now() });
    await this.sendBrowser('Browser.setWindowBounds', {
      windowId,
      bounds: { width: MANUAL_COMPATIBILITY_WINDOW_WIDTH, height: MANUAL_COMPATIBILITY_WINDOW_HEIGHT, windowState: 'normal' }
    }, { timeout: 7000 }).catch((error) => {
      log('info', '设置手机专用窗口尺寸失败（继续使用默认尺寸）', { error: error.message });
    });
    log('info', '已创建手机专用 Edge 窗口', { windowId, targetId: created.targetId });
    return created.targetId;
  }

  async setDedicatedWindow(enabled, closeTabs = false) {
    if (enabled) {
      this.dedicatedWindowEnabled = true;
      const createdId = await this.ensureDedicatedWindow(EDGE_INITIAL_URL || 'about:blank');
      if (createdId) {
        await this.ensureConnected(createdId, { activate: true, reason: 'dedicated-window' });
        await this.recoverFrames(true).catch(() => {});
      } else {
        const set = await this.dedicatedTargetIdSet();
        if (set && set.size && (!this.target?.id || !set.has(this.target.id))) {
          await this.ensureConnected([...set][0], { activate: true, reason: 'dedicated-window' });
          await this.recoverFrames(true).catch(() => {});
        }
      }
    } else {
      const windowId = this.dedicatedWindowId;
      const set = closeTabs ? await this.dedicatedTargetIdSet() : null;
      this.dedicatedWindowEnabled = false;
      this.dedicatedWindowId = null;
      if (closeTabs && set && set.size) {
        for (const targetId of set) {
          await this.sendBrowser('Target.closeTarget', { targetId }).catch(() => {});
        }
        if (this.target?.id && set.has(this.target.id)) {
          this.sessionId = null;
          this.screencastRunning = false;
          setTimeout(() => this.ensureConnected().catch(() => {}), 350).unref?.();
        }
        log('info', '已关闭手机专用 Edge 窗口', { windowId, closedTabs: set.size });
      }
    }
    const payload = this.dedicatedWindowPayload();
    hub.broadcastJson({ type: 'dedicatedWindow', ...payload });
    this.scheduleTabsPublish();
    return payload;
  }

  async createTab(rawUrl = 'about:blank') {
    await this.ensureTransport();
    if (this.dedicatedWindowEnabled) {
      const set = await this.dedicatedTargetIdSet();
      if (!set) {
        // 专用窗口尚不存在：直接以目标网址创建它。
        const createdId = await this.ensureDedicatedWindow(normalizeUrl(rawUrl));
        if (createdId) {
          await this.ensureConnected(createdId, { activate: true, reason: 'new-tab' });
          await this.recoverFrames(true);
          return createdId;
        }
      } else if (!set.size) {
        // 窗口仍在但暂时无法枚举其中的标签（CDP 抖动）：宁可让用户稍后
        // 重试，也不能失去锚点后把手机标签开进用户的主 Edge 窗口。
        throw new Error('手机专用窗口状态暂时无法确认，请稍后重试。');
      } else {
        // 新标签应落在专用窗口：先激活其中一个标签，Edge 会把新标签开在活动窗口。
        const anchor = this.target?.id && set.has(this.target.id) ? this.target.id : [...set][0];
        await this.sendBrowser('Target.activateTarget', { targetId: anchor }).catch(() => {});
      }
    }
    const result = await this.sendBrowser('Target.createTarget', { url: normalizeUrl(rawUrl) });
    if (result.targetId) {
      await this.ensureConnected(result.targetId, { activate: true, reason: 'new-tab' });
      await this.recoverFrames(true);
    }
    return result.targetId || null;
  }

  async closeTab(targetId = null) {
    const id = targetId || this.target?.id;
    if (!id) return;
    await this.sendBrowser('Target.closeTarget', { targetId: id });
    if (id === this.target?.id) {
      this.sessionId = null;
      this.screencastRunning = false;
      await new Promise((resolve) => setTimeout(resolve, 250));
      const targets = await this.listTargets().catch(() => []);
      if (!targets.some((item) => item.controllable)) {
        const created = await this.sendBrowser('Target.createTarget', { url: 'about:blank' });
        await this.ensureConnected(created.targetId || null);
      } else {
        await this.ensureConnected();
      }
    }
  }

  calibrationTarget(index, mode = 'precision') {
    // The default three-point mode estimates translation only. Points stay away
    // from the extreme edges where browser scrollbars, safe areas and a small
    // aiming error can dominate the result. Five-point mode remains available
    // for the rarer case where the centre is accurate but error grows at edges.
    const normalizedMode = mode === 'offset' ? 'offset' : 'precision';
    const points = normalizedMode === 'offset'
      ? [[0.5, 0.28], [0.28, 0.68], [0.72, 0.68]]
      : [[0.16, 0.16], [0.84, 0.16], [0.16, 0.84], [0.84, 0.84], [0.5, 0.5]];
    const safeIndex = clampInt(index, 0, points.length - 1, 0);
    const [u, v] = points[safeIndex];
    return { index: safeIndex, total: points.length, u, v, mode: normalizedMode };
  }

  async showCalibrationMarker(index = -1, mode = 'precision') {
    if (Number(index) < 0) {
      return { removed: true, localOnly: true, frameSequence: this.lastFrameSequence };
    }
    const target = this.calibrationTarget(index, mode);
    return {
      ...target,
      localOnly: true,
      targetId: this.target?.id || null,
      viewportRevision: Math.max(0, Number(this.viewport.revision) || 0),
      frameEpoch: this.frameEpoch,
      frameSequence: this.lastFrameSequence
    };
  }

  async showCalibrationProbe(message = {}) {
    if (message.remove) {
      return { removed: true, localOnly: true, frameSequence: this.lastFrameSequence };
    }
    const context = this.coordinateContext(message.context || {});
    if (context.targetId && this.target?.id && context.targetId !== this.target.id) {
      throw new Error('测试触点属于旧标签页，请重新点一次。');
    }
    const serverRevision = Math.max(0, Number(this.viewport.revision) || 0);
    if (context.viewportRevision && serverRevision && context.viewportRevision !== serverRevision) {
      throw new Error('测试触点属于旧画面尺寸，请等待新画面后再点。');
    }
    const resolved = this.cssPointForInput(message.x, message.y, context, message.u, message.v);
    const normalizedU = hasFiniteOptionalNumber(message.u) ? clamp(Number(message.u), 0, 1) : null;
    const normalizedV = hasFiniteOptionalNumber(message.v) ? clamp(Number(message.v), 0, 1) : null;
    return {
      localOnly: true,
      cssX: resolved.point.x,
      cssY: resolved.point.y,
      u: normalizedU,
      v: normalizedV,
      source: resolved.hasNormalized ? 'normalized' : 'dip',
      targetId: this.target?.id || null,
      viewportRevision: serverRevision,
      frameEpoch: this.frameEpoch,
      frameSequence: this.lastFrameSequence
    };
  }

  markUserActivation() {
    this.userActivationSerial += 1;
    this.lastUserActivationAt = Date.now();
    return this.userActivationSerial;
  }

  coordinateContext(rawContext = {}) {
    const frame = this.lastFrameMetadata || {};
    const visual = rawContext.cssVisualViewport || frame.cssVisualViewport || this.layoutMetrics?.cssVisualViewport || {};
    const layout = rawContext.cssLayoutViewport || frame.cssLayoutViewport || this.layoutMetrics?.cssLayoutViewport || {};
    const hasRawDeviceWidth = hasFiniteOptionalNumber(rawContext.deviceWidth);
    const hasRawDeviceHeight = hasFiniteOptionalNumber(rawContext.deviceHeight);
    const rawOffsetTop = hasFiniteOptionalNumber(rawContext.offsetTop) ? Number(rawContext.offsetTop) : 0;
    return normalizeCoordinateContext({
      pageScaleFactor: rawContext.pageScaleFactor ?? frame.pageScaleFactor ?? visual.scale ?? 1,
      deviceWidth: rawContext.deviceWidth ?? frame.deviceWidth ?? this.viewport.width,
      deviceHeight: rawContext.deviceHeight ?? frame.deviceHeight ?? this.viewport.height,
      // A caller-provided device size belongs to the same frozen frame as the input.
      // Do not mix it with content dimensions from a newer server-side frame.
      contentDipWidth: rawContext.contentDipWidth ??
        (hasRawDeviceWidth ? Number(rawContext.deviceWidth) : undefined) ??
        frame.contentDipWidth ?? frame.deviceWidth ?? this.viewport.width,
      contentDipHeight: rawContext.contentDipHeight ??
        (hasRawDeviceHeight ? Math.max(1, Number(rawContext.deviceHeight) - rawOffsetTop) : undefined) ??
        frame.contentDipHeight ??
        Math.max(1, Number(frame.deviceHeight ?? this.viewport.height) - Number(frame.offsetTop ?? 0)),
      imageWidth: rawContext.imageWidth ?? frame.imageWidth ?? 0,
      imageHeight: rawContext.imageHeight ?? frame.imageHeight ?? 0,
      offsetTop: rawContext.offsetTop ?? frame.offsetTop ?? 0,
      frameSequence: rawContext.frameSequence ?? rawContext.sequence ?? frame.sequence ?? 0,
      frameEpoch: rawContext.frameEpoch ?? rawContext.epoch ?? frame.epoch ?? this.frameEpoch,
      viewportRevision: rawContext.viewportRevision ?? frame.viewportRevision ?? this.viewport.revision ?? 0,
      metricsViewportRevision: rawContext.metricsViewportRevision ?? frame.metricsViewportRevision ?? this.layoutMetricsViewportRevision ?? 0,
      targetId: rawContext.targetId ?? frame.targetId ?? this.target?.id ?? '',
      nativeScaleX: rawContext.nativeScaleX ?? frame.nativeScaleX ?? 0,
      nativeScaleY: rawContext.nativeScaleY ?? frame.nativeScaleY ?? 0,
      cssVisualViewport: visual,
      cssLayoutViewport: layout
    });
  }

  // 点击测试探针（用户当次显式点击触发，一次性、只读、不注入 DOM——与
  // 环境审计同一边界；严格人工模式下同样仅限用户点击的那一刻执行一次）。
  // 返回"服务端将要点击的位置"下方的元素链与视口状态，用于诊断"本地
  // 校准显示无偏移、但真实点击不生效"一类问题（透明遮罩、元素禁用、
  // 焦点丢失、视口缩放不一致等本地标记看不见的原因）。
  async probeTapPoint(point) {
    this.markUserActivation();
    const px = Math.round(Number(point.x) || 0);
    const py = Math.round(Number(point.y) || 0);
    const expression = `(() => {
      const x = ${px}, y = ${py};
      const el = document.elementFromPoint(x, y);
      const chain = [];
      let node = el;
      for (let i = 0; node && i < 4; i += 1) {
        const r = node.getBoundingClientRect();
        chain.push({
          tag: node.tagName,
          id: node.id || '',
          cls: String(node.className && node.className.baseVal !== undefined ? node.className.baseVal : node.className || '').slice(0, 120),
          role: node.getAttribute ? (node.getAttribute('role') || '') : '',
          aria: node.getAttribute ? String(node.getAttribute('aria-label') || '').slice(0, 80) : '',
          disabled: Boolean(node.disabled),
          pointerEvents: getComputedStyle(node).pointerEvents,
          rect: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
        });
        node = node.parentElement;
      }
      return {
        point: { x, y },
        hasFocus: document.hasFocus(),
        activeElement: document.activeElement ? document.activeElement.tagName : '',
        innerWidth,
        innerHeight,
        devicePixelRatio,
        visualViewport: window.visualViewport ? {
          width: Math.round(visualViewport.width), height: Math.round(visualViewport.height),
          scale: visualViewport.scale, offsetTop: Math.round(visualViewport.offsetTop), offsetLeft: Math.round(visualViewport.offsetLeft)
        } : null,
        maxTouchPoints: navigator.maxTouchPoints,
        chain
      };
    })()`;
    const probe = await this.runUserProbe(expression, '用户触发点击测试探针（一次性只读检查）', { x: px, y: py });
    return { point: { x: px, y: py }, probe };
  }

  // "一次性只读检查"的共同边界（tapProbe / 取回输入框文本共用）：只在
  // 用户显式点击的那一刻执行一次 Runtime.evaluate、returnByValue、5 秒
  // 超时、按严格模式标记记入日志，绝不轮询或常驻。
  async runUserProbe(expression, logMessage, logDetails = {}) {
    this.markUserActivation();
    const evaluated = await this.send('Runtime.evaluate', { expression, returnByValue: true }, { timeout: 5000 });
    log('info', logMessage, { ...logDetails, strict: this.manualCompatibilityActive });
    return evaluated?.result?.value ?? null;
  }

  // 取回远程网页里聚焦输入框的现有文本。写回方向（手机端"实时同步"）走
  // 纯 Input 通道（退格 + insertText），不产生任何页面信号。
  async pullEditableText() {
    const expression = `(() => {
      const el = document.activeElement;
      const isField = Boolean(el && el.matches && el.matches('input, textarea'));
      const editable = isField || Boolean(el && el.isContentEditable);
      if (!editable) {
        return { ok: false, reason: 'no-editable-focus', activeTag: el ? el.tagName : '' };
      }
      const raw = isField ? String(el.value ?? '') : String(el.innerText ?? '');
      const limit = 20000;
      return {
        ok: true,
        kind: isField ? 'field' : 'contenteditable',
        tag: el.tagName,
        truncated: raw.length > limit,
        length: raw.length,
        text: raw.slice(0, limit)
      };
    })()`;
    const value = await this.runUserProbe(expression, '用户触发取回输入框文本（一次性只读检查）');
    return value || { ok: false, reason: 'no-result' };
  }

  // CDP 输入接口的坐标单位并不相同：Input.dispatchMouseEvent 与
  // Input.dispatchTouchEvent 接收 CSS 像素；Input.emulateTouchFromMouseEvent
  // （dev 仿真直通路径）接收 DIP。帧推导基准 contentDip ÷ pageScaleFactor
  // 只除得掉捏合缩放，除不掉浏览器缩放（Ctrl +/-、按站点记忆，缩放时
  // pageScaleFactor 仍是 1）——严格模式的真实窗口上 DIP 与 CSS 因此可能
  // 不同，把 DIP 值当 CSS 用会整体偏移、底部溢出视口（elementFromPoint
  // 返回 null、ChatGPT 底部按钮一排全灭）。CSS 像素的唯一可靠来源是服务端
  // 实时 Page.getLayoutMetrics；此处返回新鲜且属于当前标签页的实时视口。
  liveCssViewport() {
    const metrics = this.layoutMetrics;
    if (!metrics?.cssVisualViewport?.clientWidth || !metrics?.cssVisualViewport?.clientHeight) return null;
    if (this.layoutMetricsTargetId && this.target?.id && this.layoutMetricsTargetId !== this.target.id) return null;
    if (Date.now() - (this.layoutMetricsAt || 0) > 6000) return null;
    return metrics.cssVisualViewport;
  }

  cssPointForInput(x, y, rawContext = {}, u = null, v = null) {
    const context = this.coordinateContext(rawContext);
    const hasNormalized = hasFiniteOptionalNumber(u) && hasFiniteOptionalNumber(v);
    // 归一化坐标是"帧的比例"，与单位无关；乘以实时 CSS 视口得到的就是
    // dispatchMouseEvent/dispatchTouchEvent 需要的 CSS 像素——对捏合缩放、
    // 浏览器缩放、仿真页面一律正确。帧上下文换算仅作实时指标不可用时的回退。
    const live = this.liveCssViewport();
    if (hasNormalized && live) {
      const nu = clamp(Number(u), 0, 1);
      const nv = clamp(Number(v), 0, 1);
      return {
        point: {
          x: clampInsideViewport(nu * live.clientWidth, live.clientWidth),
          y: clampInsideViewport(nv * live.clientHeight, live.clientHeight)
        },
        context,
        hasNormalized
      };
    }
    const point = hasNormalized
      ? normalizedToCssPoint(Number(u), Number(v), context)
      : dipToCssPoint(x, y, context);
    return { point, context, hasNormalized };
  }

  enqueueTouch(eventType, x, y, inputMode = 'nativeTouch', context = {}, gestureId = null, eventSequence = 0, u = null, v = null) {
    if (!['start', 'move', 'end', 'cancel'].includes(eventType)) return;
    if (eventType === 'start') this.markUserActivation();
    const normalizedGestureId = String(gestureId || '').slice(0, 80) || null;
    const command = {
      eventType,
      x,
      y,
      u: hasFiniteOptionalNumber(u) ? Number(u) : null,
      v: hasFiniteOptionalNumber(v) ? Number(v) : null,
      inputMode,
      context: this.coordinateContext(context),
      gestureId: normalizedGestureId,
      eventSequence: clampInt(eventSequence, 0, Number.MAX_SAFE_INTEGER, 0)
    };
    const last = this.touchQueue.at(-1);
    if (eventType === 'move' && last?.eventType === 'move' && (!normalizedGestureId || last.gestureId === normalizedGestureId)) {
      this.touchQueue[this.touchQueue.length - 1] = command;
    } else {
      this.touchQueue.push(command);
    }

    while (this.touchQueue.length > 48) {
      const removableMove = this.touchQueue.findIndex((item, index) => index > 0 && item.eventType === 'move');
      if (removableMove >= 0) this.touchQueue.splice(removableMove, 1);
      else {
        this.touchQueue.length = 0;
        this.touchQueue.push({
          eventType: 'cancel',
          x: this.lastTouchPoint.x,
          y: this.lastTouchPoint.y,
          u: this.lastTouchPoint.u ?? null,
          v: this.lastTouchPoint.v ?? null,
          inputMode: this.activeTouchMode || inputMode,
          context: this.lastTouchPoint.context || command.context,
          gestureId: this.activeGestureId,
          eventSequence: command.eventSequence
        });
        break;
      }
    }
    this.pumpTouchQueue();
  }

  async releaseActiveInput(reason = 'release') {
    this.touchQueue.length = 0;
    if (!this.touchActive || !this.isOpen()) {
      this.touchActive = false;
      this.activeTouchMode = null;
      this.activeGestureId = null;
      this.activeTouchStartedAt = 0;
      this.activeTouchStartPoint = null;
      return;
    }
    const point = this.lastTouchPoint || { x: 0, y: 0, u: null, v: null, context: this.coordinateContext() };
    try {
      if (this.activeTouchMode === 'nativeTouch') {
        await this.dispatchNativeTouch('cancel', point.x, point.y, point.context, {}, point.u, point.v);
      } else if (this.activeTouchMode === 'mouse') {
        await this.dispatchMousePointer('cancel', point.x, point.y, point.context, {}, point.u, point.v);
      } else {
        await this.send('Input.emulateTouchFromMouseEvent', {
          type: 'mouseReleased', x: point.x, y: point.y, button: 'left', modifiers: 0, clickCount: 0
        });
      }
    } catch (error) {
      log('warn', '释放远程触摸状态失败', { reason, error: error.message });
    } finally {
      this.touchActive = false;
      this.activeTouchMode = null;
      this.activeGestureId = null;
      this.activeTouchStartedAt = 0;
      this.activeTouchStartPoint = null;
    }
  }

  async pumpTouchQueue() {
    if (this.touchPumpRunning) return;
    this.touchPumpRunning = true;
    try {
      while (this.touchQueue.length) {
        const command = this.touchQueue.shift();
        await this.ensureConnected(null, { activate: false, reason: 'input' });
        // 手势起点决定整段手势的坐标基准；开始前确保布局指标新鲜。
        if (command.eventType === 'start') await this.refreshLayoutMetrics(false).catch(() => {});
        await this.touch(
          command.eventType,
          command.x,
          command.y,
          command.inputMode,
          command.context,
          command.gestureId,
          command.eventSequence,
          command.u,
          command.v
        );
      }
    } catch (error) {
      log('warn', '远程触摸队列执行失败', { error: error.message });
      hub.broadcastJson({ type: 'status', level: 'error', message: `触摸发送失败：${error.message}` });
      this.touchQueue.length = 0;
      this.touchActive = false;
      this.activeTouchMode = null;
      this.activeGestureId = null;
      this.activeTouchStartedAt = 0;
      this.activeTouchStartPoint = null;
    } finally {
      this.touchPumpRunning = false;
      if (this.touchQueue.length) this.pumpTouchQueue();
    }
  }

  async dispatchFileInputMouseClick(point) {
    // 模拟真实用户点击：先有悬停进入，再按下并保持几十毫秒后抬起。
    // 零时长、无悬停的按下-抬起序列是真实鼠标不可能产生的输入，
    // ChatGPT 输入区的 "+"/模型选择器这类基于 pointer 事件时序的菜单
    // 触发器会把它丢弃或"打开后又立刻关闭"，表现为按钮点不动。
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: point.x, y: point.y, button: 'none', buttons: 0,
      modifiers: 0, pointerType: 'mouse'
    });
    await new Promise((resolve) => setTimeout(resolve, 12));
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1,
      clickCount: 1, modifiers: 0, pointerType: 'mouse'
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0,
      clickCount: 1, modifiers: 0, pointerType: 'mouse'
    });
  }


  async dispatchMousePointer(eventType, x, y, rawContext = {}, options = {}, u = null, v = null) {
    const typeMap = { start: 'mousePressed', move: 'mouseMoved', end: 'mouseReleased', cancel: 'mouseReleased' };
    const type = typeMap[eventType];
    if (!type) return null;
    const resolved = this.cssPointForInput(x, y, rawContext, u, v);
    const point = resolved.point;
    const pressed = type === 'mousePressed' || (type === 'mouseMoved' && this.touchActive);
    await this.send('Input.dispatchMouseEvent', {
      type,
      x: point.x,
      y: point.y,
      button: type === 'mouseMoved' && !pressed ? 'none' : 'left',
      buttons: pressed ? 1 : 0,
      modifiers: 0,
      clickCount: eventType === 'start' || eventType === 'end' ? 1 : 0,
      pointerType: 'mouse'
    }, { noWait: Boolean(options.noWait) });
    return { point, context: resolved.context };
  }

  async touch(eventType, x, y, inputMode = 'nativeTouch', rawContext = {}, gestureId = null, eventSequence = 0, u = null, v = null) {
    const context = this.coordinateContext(rawContext);
    if (context.targetId && this.target?.id && context.targetId !== this.target.id) {
      if (eventType === 'end' || eventType === 'cancel') await this.releaseActiveInput('旧标签页触摸事件').catch(() => {});
      return;
    }
    const serverRevision = Math.max(0, Number(this.viewport.revision) || 0);
    if (context.viewportRevision && serverRevision && context.viewportRevision !== serverRevision) {
      if (eventType === 'end' || eventType === 'cancel') await this.releaseActiveInput('不同尺寸版本的触摸事件').catch(() => {});
      return;
    }
    if (context.frameEpoch && this.frameEpoch && context.frameEpoch < this.frameEpoch) {
      if (eventType === 'end' || eventType === 'cancel') await this.releaseActiveInput('旧页面画面的触摸事件').catch(() => {});
      return;
    }
    if ((eventType === 'end' || eventType === 'cancel') && !this.touchActive) {
      this.activeTouchMode = null;
      this.activeGestureId = null;
      this.activeTouchStartedAt = 0;
      this.activeTouchStartPoint = null;
      return;
    }
    const normalizedGestureId = String(gestureId || '').slice(0, 80) || null;
    const normalizedU = hasFiniteOptionalNumber(u) ? clamp(Number(u), 0, 1) : null;
    const normalizedV = hasFiniteOptionalNumber(v) ? clamp(Number(v), 0, 1) : null;
    if (eventType === 'start') {
      if (this.touchActive) await this.releaseActiveInput('新手势开始').catch(() => {});
      this.activeGestureId = normalizedGestureId;
      this.activeTouchStartedAt = Date.now();
      this.activeTouchStartPoint = { x: Number(x) || 0, y: Number(y) || 0, u: normalizedU, v: normalizedV, context };
    } else if (this.activeGestureId && normalizedGestureId && this.activeGestureId !== normalizedGestureId) {
      return;
    }

    const eventMap = {
      start: 'mousePressed',
      move: 'mouseMoved',
      end: 'mouseReleased',
      cancel: 'mouseReleased'
    };
    const type = eventMap[eventType];
    if (!type) return;

    const strictForcesMouse = this.manualCompatibilityActive && !this.strictNativeTouchEnabled;
    const requestedMode = strictForcesMouse || inputMode === 'mouse'
      ? 'mouse'
      : (inputMode === 'devtools' ? 'devtools' : 'nativeTouch');
    if (eventType === 'start' || !this.activeTouchMode) this.activeTouchMode = requestedMode;
    const mode = this.activeTouchMode;
    const fallbackPoint = eventType === 'cancel' ? this.lastTouchPoint : null;
    const maxWidth = Math.max(1, Number(context.contentDipWidth) || Number(context.deviceWidth) || this.viewport.width);
    const maxHeight = Math.max(1, Number(context.contentDipHeight) || Number(context.deviceHeight) || this.viewport.height);
    const px = fallbackPoint ? fallbackPoint.x : clamp(Number(x) || 0, 0, maxWidth);
    const py = fallbackPoint ? fallbackPoint.y : clamp(Number(y) || 0, 0, maxHeight);
    const pu = fallbackPoint ? fallbackPoint.u : normalizedU;
    const pv = fallbackPoint ? fallbackPoint.v : normalizedV;
    const pointContext = fallbackPoint?.context || context;
    const noWait = eventType === 'move';


    if (mode === 'mouse') {
      await this.dispatchMousePointer(eventType, px, py, pointContext, { noWait }, pu, pv);
    } else if (mode === 'devtools') {
      try {
        await this.send('Input.emulateTouchFromMouseEvent', {
          type,
          x: Math.round(px),
          y: Math.round(py),
          button: type === 'mouseMoved' && !this.touchActive ? 'none' : 'left',
          modifiers: 0,
          clickCount: eventType === 'start' || eventType === 'end' ? 1 : 0
        }, { noWait });
      } catch (error) {
        if (eventType !== 'start') throw error;
        log('warn', 'DevTools 触摸仿真起始失败，本次手势改用原生触摸事件', { error: error.message });
        this.activeTouchMode = 'nativeTouch';
        await this.dispatchNativeTouch(eventType, px, py, pointContext, { noWait }, pu, pv);
      }
    } else {
      await this.dispatchNativeTouch(eventType, px, py, pointContext, { noWait }, pu, pv);
    }

    if (eventType === 'start' || eventType === 'move') {
      this.touchActive = true;
      this.lastTouchPoint = { x: px, y: py, u: pu, v: pv, context: pointContext, gestureId: normalizedGestureId, eventSequence };
    } else if (eventType === 'end' || eventType === 'cancel') {
      this.touchActive = false;
      this.activeTouchMode = null;
      this.activeGestureId = null;
      this.activeTouchStartedAt = 0;
      this.activeTouchStartPoint = null;
      this.lastTouchPoint = { x: px, y: py, u: pu, v: pv, context: pointContext, gestureId: normalizedGestureId, eventSequence };
      this.scheduleVisualRefresh('touch-end', 100);
    }
    if (!this.screencastRunning && eventType === 'move') this.scheduleVisualRefresh('touch-move', 70);
  }

  async dispatchNativeTouch(eventType, x, y, rawContext = {}, options = {}, u = null, v = null) {
    const typeMap = { start: 'touchStart', move: 'touchMove', end: 'touchEnd', cancel: 'touchCancel' };
    const type = typeMap[eventType];
    if (!type) return;
    const resolved = this.cssPointForInput(x, y, rawContext, u, v);
    const point = resolved.point;
    const touchPoints = (type === 'touchEnd' || type === 'touchCancel') ? [] : [{
      x: point.x,
      y: point.y,
      radiusX: 1,
      radiusY: 1,
      force: 1,
      id: 1
    }];
    await this.send('Input.dispatchTouchEvent', {
      type,
      touchPoints,
      timestamp: Date.now() / 1000
    }, { noWait: Boolean(options.noWait) });
  }

  async tap(x, y, inputMode = 'nativeTouch', rawContext = {}, u = null, v = null) {
    this.markUserActivation();
    await this.releaseActiveInput('轻点');
    // 保证换算基准新鲜（内部有 900ms 缓存与单飞，代价极小）。
    await this.refreshLayoutMetrics(false).catch(() => {});
    const context = this.coordinateContext(rawContext);
    if (context.targetId && this.target?.id && context.targetId !== this.target.id) return;
    const serverRevision = Math.max(0, Number(this.viewport.revision) || 0);
    if (context.viewportRevision && serverRevision && context.viewportRevision !== serverRevision) return;
    if (context.frameEpoch && this.frameEpoch && context.frameEpoch < this.frameEpoch) return;
    const maxWidth = Math.max(1, Number(context.contentDipWidth) || Number(context.deviceWidth) || this.viewport.width);
    const maxHeight = Math.max(1, Number(context.contentDipHeight) || Number(context.deviceHeight) || this.viewport.height);
    const px = clamp(Number(x) || 0, 0, maxWidth);
    const py = clamp(Number(y) || 0, 0, maxHeight);
    const normalizedU = hasFiniteOptionalNumber(u) ? clamp(Number(u), 0, 1) : null;
    const normalizedV = hasFiniteOptionalNumber(v) ? clamp(Number(v), 0, 1) : null;
    const strictForcesMouse = this.manualCompatibilityActive && !this.strictNativeTouchEnabled;
    if (strictForcesMouse || inputMode === 'mouse') {
      const resolved = this.cssPointForInput(px, py, context, normalizedU, normalizedV);
      await this.dispatchFileInputMouseClick(resolved.point);
    } else if (inputMode !== 'devtools') {
      await this.dispatchNativeTouch('start', px, py, context, {}, normalizedU, normalizedV);
      // 真实手指轻点的接触时长约 50-120ms；过短的合成轻点会被部分组件的
      // pointer 时序逻辑忽略（与上方鼠标路径同理）。
      await new Promise((resolve) => setTimeout(resolve, 60));
      await this.dispatchNativeTouch('end', px, py, context, {}, normalizedU, normalizedV);
    } else {
      await this.send('Input.emulateTouchFromMouseEvent', {
        type: 'mousePressed', x: Math.round(px), y: Math.round(py), button: 'left', modifiers: 0, clickCount: 1
      });
      await new Promise((resolve) => setTimeout(resolve, 16));
      await this.send('Input.emulateTouchFromMouseEvent', {
        type: 'mouseReleased', x: Math.round(px), y: Math.round(py), button: 'left', modifiers: 0, clickCount: 1
      });
    }
    this.lastTouchPoint = { x: px, y: py, u: normalizedU, v: normalizedV, context };
    this.scheduleVisualRefresh('tap', 80);
  }

  async wheel(
    x,
    y,
    deltaX,
    deltaY,
    clearSelection = false,
    rawContext = {},
    u = null,
    v = null,
    deltaU = null,
    deltaV = null
  ) {
    // 与 tap/手势起点一致：换算基准需新鲜（内部 900ms 缓存与单飞）。
    await this.refreshLayoutMetrics(false).catch(() => {});
    if (clearSelection) {
      await this.send('Runtime.evaluate', {
        expression: `(() => {
          const active = document.activeElement;
          const editable = active && (active.matches?.('input, textarea') || active.isContentEditable);
          if (editable) return false;
          const selection = globalThis.getSelection?.();
          if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
          selection.removeAllRanges();
          return true;
        })()`,
        returnByValue: true
      }).catch(() => {});
    }
    const context = this.coordinateContext(rawContext);
    if (context.targetId && this.target?.id && context.targetId !== this.target.id) return;
    const serverRevision = Math.max(0, Number(this.viewport.revision) || 0);
    if (context.viewportRevision && serverRevision && context.viewportRevision !== serverRevision) return;
    if (context.frameEpoch && this.frameEpoch && context.frameEpoch < this.frameEpoch) return;
    // 与 cssPointForInput 同一基准：滚轮的落点与位移都必须是 CSS 像素。
    const live = this.liveCssViewport();
    const hasNormalizedPoint = hasFiniteOptionalNumber(u) && hasFiniteOptionalNumber(v);
    const point = hasNormalizedPoint && live
      ? {
        x: clampInsideViewport(clamp(Number(u), 0, 1) * live.clientWidth, live.clientWidth),
        y: clampInsideViewport(clamp(Number(v), 0, 1) * live.clientHeight, live.clientHeight)
      }
      : (hasNormalizedPoint
        ? normalizedToCssPoint(Number(u), Number(v), context)
        : dipToCssPoint(x, y, context));
    const hasNormalizedDelta = hasFiniteOptionalNumber(deltaU) && hasFiniteOptionalNumber(deltaV);
    const delta = hasNormalizedDelta && live
      ? { deltaX: Number(deltaU) * live.clientWidth, deltaY: Number(deltaV) * live.clientHeight }
      : (hasNormalizedDelta
        ? normalizedDeltaToCss(Number(deltaU), Number(deltaV), context)
        : dipDeltaToCss(deltaX, deltaY, context));
    const params = {
      type: 'mouseWheel',
      x: point.x,
      y: point.y,
      button: 'none',
      deltaX: delta.deltaX,
      deltaY: delta.deltaY,
      modifiers: 0,
      clickCount: 0,
      pointerType: 'mouse'
    };
    try {
      await this.send('Input.dispatchMouseEvent', params, { noWait: true });
    } catch (error) {
      log('warn', '标准滚轮注入失败，改用 DevTools 触摸仿真滚轮', { error: error.message });
      await this.send('Input.emulateTouchFromMouseEvent', {
        type: 'mouseWheel',
        x: Math.round(clamp(Number(x) || 0, 0, context.contentDipWidth || context.deviceWidth)),
        y: Math.round(clamp(Number(y) || 0, 0, context.contentDipHeight || context.deviceHeight)),
        button: 'none',
        deltaX: Number(deltaX) || 0,
        deltaY: Number(deltaY) || 0,
        modifiers: 0,
        clickCount: 0
      }, { noWait: true });
    }
    this.scheduleVisualRefresh('wheel', 80);
  }

  async insertText(text) {
    await this.send('Input.insertText', { text: String(text || '') });
    this.scheduleVisualRefresh('text', 100);
  }

  async pressKey(name, modifiers = 0, count = 1) {
    const keys = {
      Enter: { key: 'Enter', code: 'Enter', vk: 13 },
      Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
      Delete: { key: 'Delete', code: 'Delete', vk: 46 },
      Tab: { key: 'Tab', code: 'Tab', vk: 9 },
      Escape: { key: 'Escape', code: 'Escape', vk: 27 },
      ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
      ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
      ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
      ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
      Home: { key: 'Home', code: 'Home', vk: 36 },
      End: { key: 'End', code: 'End', vk: 35 }
    };
    const item = keys[name];
    if (!item) return;
    const common = {
      key: item.key,
      code: item.code,
      windowsVirtualKeyCode: item.vk,
      nativeVirtualKeyCode: item.vk,
      modifiers: clampInt(modifiers, 0, 15, 0)
    };
    // 批量（实时同步的差量退格）按物理键盘自动重复的节奏注入：键间
    // 24-42ms 抖动间隔，不是零间隔的机器连发；上限 40 与手机端差量
    // 阈值一致（更大的改动走 全选+整段替换）。
    const repeat = clampInt(count, 1, 40, 1);
    for (let i = 0; i < repeat; i += 1) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 24 + Math.floor(Math.random() * 19)));
      await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...common });
      await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
    }
    this.scheduleVisualRefresh('key', 100);
  }

  async selectAll() {
    await this.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'a',
      code: 'KeyA',
      windowsVirtualKeyCode: 65,
      nativeVirtualKeyCode: 65,
      modifiers: 2,
      commands: ['SelectAll']
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'a',
      code: 'KeyA',
      windowsVirtualKeyCode: 65,
      nativeVirtualKeyCode: 65,
      modifiers: 2
    });
  }

  fileChooserFingerprint(info) {
    if (!info) return '';
    return [
      info.targetId || '',
      info.frameId || '',
      Number(info.backendNodeId) || 0,
      info.mode || 'selectSingle'
    ].join('|');
  }

  async handleFileChooserOpened(params) {
    clearTimeout(this.fileChooserArmTimer);
    this.fileChooserArmTimer = null;
    this.fileChooserArmUntil = 0;
    this.fileChooserArmReason = 'chooser-open';
    // 文件选择器常由一次远程点击触发；如果浏览器在弹窗出现后吞掉了 pointerup，
    // 旧版可能把远程页面留在“仍按住”的状态，继而触发文字选择或长按。
    await this.releaseActiveInput('文件选择器打开').catch(() => {});

    const backendNodeId = params.backendNodeId;
    if (!backendNodeId) {
      this.invalidateFileChooser('unsupported-chooser');
      await this.disarmFileChooserInterception('unsupported-chooser').catch(() => {});
      hub.broadcastJson({ type: 'status', level: 'error', message: '该网站使用的不是普通文件上传框，暂时无法从手机选择文件。' });
      return;
    }

    const baseInfo = {
      backendNodeId,
      frameId: params.frameId || null,
      mode: params.mode || 'selectSingle',
      targetId: this.target?.id || null
    };
    const fingerprint = this.fileChooserFingerprint(baseInfo);
    const now = Date.now();

    // Chromium/网页脚本有时会为同一次点击重复发出 fileChooserOpened。
    // 保留同一个事务 ID，不重置手机文件浏览器，也不反复开关上传面板。
    if (this.pendingFileChooser && this.fileChooserFingerprint(this.pendingFileChooser) === fingerprint) {
      this.pendingFileChooser.lastSeenAt = now;
      return;
    }

    // 已经完成或取消的同一选择器，短时间内可能还有一条迟到事件；丢弃它，
    // 但窗口很短，不妨碍用户稍后再次主动点击同一个上传框。
    const resolved = this.lastResolvedFileChooser;
    const hasNewUserActivation = resolved && this.userActivationSerial > Number(resolved.activationSerial || 0);
    if (resolved?.fingerprint === fingerprint && now - resolved.at < 5000 && !hasNewUserActivation) {
      log('info', '忽略已完成文件选择事务的迟到重复事件', { fingerprint });
      return;
    }

    // 若网站在旧事务未结束前打开另一个输入框，先明确结束旧事务，防止两个
    // chooser 状态互相覆盖。失败不会阻止接管新的输入框。
    const previous = this.pendingFileChooser;
    if (previous?.backendNodeId) {
      await this.send('DOM.setFileInputFiles', { files: [], backendNodeId: previous.backendNodeId }).catch(() => {});
      if (this.pendingFileChooser?.id === previous.id) this.pendingFileChooser = null;
      this.rememberResolvedChooser(previous, 'superseded');
      hub.broadcastJson({ type: 'uploadCancelled', chooserId: previous.id, targetId: previous.targetId, reason: 'superseded' });
    }

    const info = {
      id: crypto.randomUUID(),
      ...baseInfo,
      fingerprint,
      openedAt: now,
      lastSeenAt: now,
      accept: '',
      multiple: params.mode === 'selectMultiple',
      directory: false,
      state: 'open',
      activationSerial: this.userActivationSerial
    };

    try {
      // Read only the file-input attributes through the DOM protocol. This does
      // not execute JavaScript in the target page and does not require DOM.enable.
      const described = await this.send('DOM.describeNode', { backendNodeId, depth: 0, pierce: false }, { timeout: 5000 });
      const attributes = Array.isArray(described?.node?.attributes) ? described.node.attributes : [];
      const attributeMap = new Map();
      for (let index = 0; index + 1 < attributes.length; index += 2) {
        attributeMap.set(String(attributes[index] || '').toLowerCase(), String(attributes[index + 1] || ''));
      }
      info.accept = attributeMap.get('accept') || '';
      info.multiple = info.mode === 'selectMultiple' || attributeMap.has('multiple');
      info.directory = attributeMap.has('webkitdirectory') || attributeMap.has('directory');
    } catch {}

    this.pendingFileChooser = info;
    this.fileChooserBroadcastAt = now;
    hub.broadcastJson({
      type: 'fileChooser',
      id: info.id,
      targetId: info.targetId,
      mode: info.mode,
      multiple: Boolean(info.multiple),
      accept: info.accept || '',
      directory: Boolean(info.directory)
    });
  }

  invalidateFileChooser(reason = 'invalidated') {
    const chooser = this.pendingFileChooser;
    if (!chooser) return null;
    this.pendingFileChooser = null;
    this.rememberResolvedChooser(chooser, reason);
    if (chooser.backendNodeId && this.isOpen()) {
      this.send('DOM.setFileInputFiles', { files: [], backendNodeId: chooser.backendNodeId }).catch(() => {});
    }
    hub.broadcastJson({
      type: 'uploadCancelled',
      chooserId: chooser.id,
      targetId: chooser.targetId,
      reason
    });
    setImmediate(() => this.disarmFileChooserInterception(`chooser-${reason}`).catch(() => {}));
    return chooser;
  }

  chooserMatches(expected, actual = this.pendingFileChooser) {
    if (!expected || !actual) return false;
    return expected.id === actual.id && expected.backendNodeId === actual.backendNodeId && expected.targetId === actual.targetId;
  }

  getPendingChooser(expectedId = null) {
    if (this.pendingFileChooser && Date.now() - this.pendingFileChooser.openedAt > 5 * 60 * 1000) {
      this.invalidateFileChooser('expired');
    }
    if (expectedId && this.pendingFileChooser?.id !== expectedId) return null;
    return this.pendingFileChooser;
  }

  rememberResolvedChooser(chooser, outcome) {
    if (!chooser) return;
    this.lastResolvedFileChooser = {
      id: chooser.id,
      fingerprint: chooser.fingerprint || this.fileChooserFingerprint(chooser),
      outcome,
      // 记录“事务结束时”已经发生过的用户激活。只有结束之后出现的新点击，
      // 才能把同一个 input 识别为用户主动再次打开，而不是迟到的重复事件。
      activationSerial: this.userActivationSerial,
      at: Date.now()
    };
  }

  async setUploadedFiles(files, expectedChooser) {
    const chooser = this.getPendingChooser(expectedChooser?.id || null);
    if (!chooser?.backendNodeId || !this.chooserMatches(expectedChooser, chooser)) {
      throw new Error('网页文件上传框已经变化或失效，请重新点击网页上传按钮。');
    }
    if (chooser.targetId && chooser.targetId !== this.target?.id) throw new Error('上传框所属标签页已经切换，请重新点击网页上传按钮。');
    chooser.state = 'committing';
    await this.send('DOM.setFileInputFiles', { files, backendNodeId: chooser.backendNodeId });
    if (this.pendingFileChooser?.id === chooser.id) this.pendingFileChooser = null;
    this.rememberResolvedChooser(chooser, 'complete');
    hub.broadcastJson({ type: 'uploadComplete', chooserId: chooser.id, targetId: chooser.targetId, count: files.length });
    await this.disarmFileChooserInterception('upload-complete').catch(() => {});
    this.scheduleVisualRefresh('upload', 120);
  }

  async cancelFileChooser(expectedId = null) {
    const chooser = this.getPendingChooser(expectedId || null);
    if (!chooser) return false;
    chooser.state = 'cancelling';
    if (chooser.backendNodeId) {
      await this.send('DOM.setFileInputFiles', { files: [], backendNodeId: chooser.backendNodeId }).catch(() => {});
    }
    if (this.pendingFileChooser?.id === chooser.id) this.pendingFileChooser = null;
    this.rememberResolvedChooser(chooser, 'cancel');
    hub.broadcastJson({ type: 'uploadCancelled', chooserId: chooser.id, targetId: chooser.targetId });
    await this.disarmFileChooserInterception('upload-cancel').catch(() => {});
    return true;
  }

  async handleDialog(accept, promptText = '') {
    await this.send('Page.handleJavaScriptDialog', {
      accept: Boolean(accept),
      promptText: String(promptText || '')
    });
    this.scheduleVisualRefresh('dialog', 120);
  }

  status() {
    return {
      version: VERSION,
      cdpConnected: this.isOpen(),
      endpoint: this.endpoint,
      attemptedEndpoint: this.lastEndpointInfo?.endpoint || null,
      lastConnectError: this.lastConnectError ? {
        message: this.lastConnectError.message,
        code: this.lastConnectError.code,
        ageMs: Date.now() - this.lastConnectError.at
      } : null,
      reconnectDueInMs: this.reconnectDueAt ? Math.max(0, this.reconnectDueAt - Date.now()) : null,
      edgeRuntime: edgeRuntime.status(),
      target: this.target ? { id: this.target.id, title: this.target.title, url: this.target.url } : null,
      viewport: this.viewport,
      followDesktopTabs: this.followDesktopTabs,
      desktopEdgeFocused: this.desktopEdgeFocused,
      desktopEdgeFocusAgeMs: this.desktopEdgeFocusAt ? Date.now() - this.desktopEdgeFocusAt : null,
      screencastVisible: this.screencastVisible,
      activeTabPollMs: this.activeTabPollInterval(),
      manualCompatibility: this.manualCompatibilityPayload(),
      layoutMetrics: this.layoutMetrics,
      layoutMetricsAgeMs: this.layoutMetricsAt ? Date.now() - this.layoutMetricsAt : null,
      frameMode: this.frameMode,
      screencastRunning: this.screencastRunning,
      lastScreencastFrameAgeMs: this.lastScreencastFrameAt ? Date.now() - this.lastScreencastFrameAt : null,
      lastAnyFrameAgeMs: this.lastAnyFrameAt ? Date.now() - this.lastAnyFrameAt : null,
      lastFrameSequence: this.lastFrameSequence,
      frameEpoch: this.frameEpoch,
      lastSnapshotSuccessAgeMs: this.lastSnapshotSuccessAt ? Date.now() - this.lastSnapshotSuccessAt : null,
      consecutiveSnapshotFailures: this.consecutiveSnapshotFailures,
      framePressure: hub.framePressure(),
      pendingFileChooser: Boolean(this.getPendingChooser()),
      connectedPhones: hub.size,
      controllerClientId: hub.controllerClientId,
      phones: hub.status()
    };
  }
}

const cdp = new CdpController();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

const WS_TOKEN_PROTOCOL_PREFIX = 'epc.token.';
const WS_ACK_PROTOCOL = 'epc.v1';

// 浏览器无法为 WebSocket 设置 Authorization 头，因此手机页把令牌放在
// Sec-WebSocket-Protocol 子协议里（base64url 编码），令牌不再出现在 URL 中，
// 也就不会进入访问日志、浏览器历史或 Referer。仍保留 ?token= 和 Bearer 作为
// 兼容回退（HTTP API、旧客户端与测试）。
function tokenFromWebSocketProtocol(req) {
  const header = String(req.headers['sec-websocket-protocol'] || '');
  if (!header) return '';
  for (const raw of header.split(',')) {
    const item = raw.trim();
    if (item.startsWith(WS_TOKEN_PROTOCOL_PREFIX)) {
      try { return Buffer.from(item.slice(WS_TOKEN_PROTOCOL_PREFIX.length), 'base64url').toString('utf8'); } catch { return ''; }
    }
  }
  return '';
}

function tokenFromRequest(requestUrl, req) {
  const protoToken = tokenFromWebSocketProtocol(req);
  if (protoToken) return protoToken;
  const queryToken = requestUrl.searchParams.get('token');
  if (queryToken) return queryToken;
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return '';
}

function isAuthorized(requestUrl, req) {
  const supplied = Buffer.from(tokenFromRequest(requestUrl, req));
  const expected = Buffer.from(ACCESS_TOKEN);
  return supplied.length === expected.length && supplied.length > 0 && crypto.timingSafeEqual(supplied, expected);
}

function securityHeaders(contentType = '') {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Resource-Policy': 'same-origin'
  };
  if (contentType.startsWith('text/html')) {
    headers['Content-Security-Policy'] = "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
  }
  return headers;
}

function sendJsonResponse(res, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    ...securityHeaders('application/json')
  });
  res.end(body);
}

async function serveLatestFrame(req, res, requestUrl) {
  if (!isAuthorized(requestUrl, req)) {
    sendJsonResponse(res, 401, { ok: false, error: 'Unauthorized' });
    return;
  }

  const fresh = requestUrl.searchParams.get('fresh') === '1';
  if (fresh || !cdp.latestFrame) {
    try {
      await cdp.ensureConnected();
      await cdp.captureSnapshot('http-fallback', true);
    } catch (error) {
      sendJsonResponse(res, 503, { ok: false, error: error.message });
      return;
    }
  }

  const frame = cdp.latestFrame;
  if (!frame) {
    sendJsonResponse(res, 503, { ok: false, error: 'No frame available' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': frame.contentType,
    'Content-Length': frame.buffer.length,
    'X-EPC-Sequence': String(frame.sequence),
    'X-EPC-Metadata': base64urlJson(frame.metadata),
    ...securityHeaders(frame.contentType)
  });
  res.end(frame.buffer);
}

const server = http.createServer(async (req, res) => {
  let requestUrl;
  try {
    requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  } catch {
    sendJsonResponse(res, 400, { ok: false, error: 'Bad Request' });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJsonResponse(res, 405, { ok: false, error: 'Method Not Allowed' });
    return;
  }

  if (requestUrl.pathname === '/health') {
    // /health 无需令牌，因此只返回存活性所需的最小字段。进程 PID、连接数、
    // Edge 进程与重启状态、重连计时等运行拓扑信息移到令牌保护的 /api/status，
    // 避免未认证方探测本机状态。
    sendJsonResponse(res, 200, {
      ok: true,
      service: SERVICE_ID,
      version: VERSION,
      uptimeSeconds: Math.round(process.uptime())
    });
    return;
  }

  if (requestUrl.pathname === '/api/status') {
    if (!isAuthorized(requestUrl, req)) {
      sendJsonResponse(res, 401, { ok: false, error: 'Unauthorized' });
      return;
    }
    sendJsonResponse(res, 200, { ok: true, ...cdp.status() });
    return;
  }

  if (requestUrl.pathname === '/api/logs') {
    if (!isAuthorized(requestUrl, req)) {
      sendJsonResponse(res, 401, { ok: false, error: 'Unauthorized' });
      return;
    }
    sendJsonResponse(res, 200, { ok: true, logs: recentLogs });
    return;
  }

  if (requestUrl.pathname === '/api/frame.jpg') {
    await serveLatestFrame(req, res, requestUrl);
    return;
  }

  let relativePath;
  try {
    relativePath = requestUrl.pathname === '/' ? 'index.html' : decodeURIComponent(requestUrl.pathname.slice(1));
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders('text/plain') });
    res.end('Bad request');
    return;
  }
  const resolvedPublic = path.resolve(PUBLIC_DIR);
  let filePath = path.resolve(PUBLIC_DIR, relativePath);
  if (filePath !== resolvedPublic && !filePath.startsWith(`${resolvedPublic}${path.sep}`)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders('text/plain') });
    res.end('Not found');
    return;
  }
  // 词法包含检查之外还要按真实路径复查一次：public 内若被放入指向外部的
  // 符号链接，词法检查会放行而 realpath 不会。
  try {
    const realPublic = fs.realpathSync.native ? fs.realpathSync.native(resolvedPublic) : fs.realpathSync(resolvedPublic);
    const realFile = fs.realpathSync.native ? fs.realpathSync.native(filePath) : fs.realpathSync(filePath);
    if (realFile !== realPublic && !realFile.startsWith(`${realPublic}${path.sep}`)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders('text/plain') });
      res.end('Not found');
      return;
    }
    filePath = realFile;
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders('text/plain') });
    res.end('Not found');
    return;
  }

  let stat;
  try { stat = fs.statSync(filePath); } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders('text/plain') });
    res.end('Not found');
    return;
  }
  if (!stat.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders('text/plain') });
    res.end('Not found');
    return;
  }

  const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    ...securityHeaders(contentType)
  });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(filePath).pipe(res);
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 70000;
server.requestTimeout = 30000;

const wss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: false,
  // 上限必须容纳最坏情况的合法输入：剪贴板允许 100 万个 JS 字符，
  // CJK/表情经 UTF-8+JSON 编码可达 3-4 MB；1 MiB 会在剪贴板校验之前
  // 直接断开连接。8 MiB 覆盖最坏合法输入（连接已通过令牌认证）。
  maxPayload: 8 * 1024 * 1024,
  clientTracking: false,
  // 只回选非机密的 epc.v1 应答子协议，令牌子协议永不出现在响应头里。
  handleProtocols: (protocols) => (protocols.has(WS_ACK_PROTOCOL) ? WS_ACK_PROTOCOL : false)
});

const authFailures = new Map();
function authBlocked(address) {
  const now = Date.now();
  if (authFailures.size > 256) {
    for (const [key, value] of authFailures) {
      if (now - value.startedAt > 5 * 60 * 1000) authFailures.delete(key);
    }
  }
  const item = authFailures.get(address);
  if (!item || now - item.startedAt > 60000) {
    authFailures.set(address, { startedAt: now, count: 0 });
    return false;
  }
  return item.count >= 20;
}
function recordAuthFailure(address) {
  const now = Date.now();
  const item = authFailures.get(address);
  if (!item || now - item.startedAt > 60000) authFailures.set(address, { startedAt: now, count: 1 });
  else item.count += 1;
}

server.on('upgrade', (req, socket, head) => {
  let requestUrl;
  try { requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`); } catch {
    socket.destroy();
    return;
  }
  const address = req.socket.remoteAddress || 'unknown';
  const origin = req.headers.origin;
  const originOk = !origin || (() => {
    try { return new URL(origin).host === requestUrl.host; } catch { return false; }
  })();

  if (authBlocked(address) || requestUrl.pathname !== '/control' || !isAuthorized(requestUrl, req) || !originOk) {
    recordAuthFailure(address);
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const clientId = String(requestUrl.searchParams.get('clientId') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || crypto.randomUUID();
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, { clientId, remoteAddress: address });
  });
});

const controllerOnlyTypes = new Set([
  'viewport', 'navigate', 'back', 'forward', 'reload', 'touch', 'tap', 'wheel', 'text', 'key', 'selectAll',
  'mobile', 'streamPreset', 'followDesktopTabs', 'manualCompatibility', 'strictNativeTouch', 'manualCompatibilityAudit', 'selectTarget', 'newTab', 'closeTab', 'navigateHistoryEntry', 'dialog', 'recoverFrame', 'frameQuality', 'frameProblem', 'calibrationMarker', 'calibrationProbe', 'tapProbe', 'pullEditableText',
  'requestUpload', 'cancelUpload', 'computerRoots', 'computerList', 'computerCommit', 'uploadBegin', 'uploadFileBegin', 'uploadChunkAck', 'uploadFileEnd', 'uploadCommit',
  // 浏览历史与电脑文件/剪贴板同属"屏幕画面之外的本机数据"，只读端不可见。
  'browserHistory',
  'clipboardGet', 'clipboardSet', 'dedicatedWindow', 'rotateToken'
]);

// 认证代数：连接建立时盖上当前代，令牌轮换时代数自增并关闭所有旧代连接。
// 只改全局令牌字符串是不够的——那只挡得住"新建连接"，已认证的旧会话仍能
// claimControl 并继续注入输入/读取剪贴板，与"轮换即撤销"的界面承诺不符。
let authEpoch = 1;

function reply(ws, requestId, result = {}) {
  if (!requestId) return;
  sendJson(ws, { type: 'reply', requestId, ok: true, result });
}

function replyError(ws, requestId, error) {
  if (!requestId) {
    sendJson(ws, { type: 'status', level: 'error', message: error.message || String(error) });
    return;
  }
  sendJson(ws, { type: 'reply', requestId, ok: false, error: error.message || String(error) });
}

wss.on('connection', (ws, req, info) => {
  const state = hub.add(ws, info);
  state.authEpoch = authEpoch;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  if (state.replacedExisting) {
    cdp.releaseActiveInput('同一手机页面重新连接').catch(() => {});
  }
  log('info', '手机连接控制器', { clientId: state.clientId, address: state.remoteAddress, replacedExisting: state.replacedExisting });
  sendJson(ws, {
    type: 'hello',
    version: VERSION,
    clientId: state.clientId,
    tokenRequired: true,
    limits: {
      maxUploadBytes: MAX_UPLOAD_BYTES,
      maxUploadFiles: MAX_UPLOAD_FILES,
      maxComputerFiles: MAX_COMPUTER_FILES,
      computerFilePicker: true,
      clipboardBridge: CLIPBOARD_BRIDGE_ENABLED && clipboardBridge.available(),
      clipboardMaxChars: CLIPBOARD_MAX_CHARS,
      tokenRotatable: !ACCESS_TOKEN_PINNED,
      dedicatedWindow: cdp.dedicatedWindowPayload(),
      uploadAckBytes: UPLOAD_ACK_BYTES,
      desktopWidth: DEFAULT_DESKTOP_WIDTH,
      streamPresets: ['auto', 'economy', 'realtime', 'balanced', 'clear'],
      followDesktopTabs: cdp.followDesktopTabs,
      desktopTabFollow: cdp.desktopTabFollowPayload(),
      manualCompatibility: cdp.manualCompatibilityPayload()
    }
  });
  sendJson(ws, { type: 'status', level: 'info', message: '手机已连接控制服务，正在连接 Edge…' });

  cdp.ensureConnected().then(async () => {
    await cdp.publishState(ws);
    await cdp.publishTabs(ws);
    sendJson(ws, { type: 'viewport', ...cdp.viewport });
    cdp.publishCapabilities(ws);
    cdp.publishManualCompatibility(ws);
    sendJson(ws, { type: 'frameEpoch', epoch: cdp.frameEpoch, reason: 'new-client', targetId: cdp.target?.id || null });
    if (cdp.latestFrame?.metadata?.epoch === cdp.frameEpoch && cdp.latestFrame?.metadata?.targetId === cdp.target?.id) {
      hub.queueFrame(cdp.latestFrame, ws);
    } else {
      await cdp.captureSnapshot('new-client', true).catch(() => {});
    }
  }).catch((error) => {
    if (Date.now() - cdp.lastConnectNoticeAt > 1800) {
      sendJson(ws, {
        type: 'status',
        level: 'warn',
        message: EDGE_MANAGED_SESSION
          ? 'Edge 暂时不可用，控制器正在检查进程、动态端口并自动恢复。'
          : `暂时无法连接 Edge：${error.message}`
      });
    }
  });

  let messageQueue = Promise.resolve();

  async function cleanupUpload(removeFiles = true) {
    const upload = state.uploadState;
    state.uploadState = null;
    if (!upload) return;
    if (upload.stream) {
      try { upload.stream.destroy(); } catch {}
    }
    if (removeFiles && upload.dir) {
      try { fs.rmSync(upload.dir, { recursive: true, force: true }); } catch {}
    }
  }

  async function handleBinaryUpload(raw) {
    // 文本命令在 handleCommand 里统一做控制者校验；二进制分块也必须校验，
    // 否则控制权被他人接管后，旧控制者仍能继续把文件写进电脑。
    if (!hub.isController(ws)) {
      await cleanupUpload(true);
      throw new Error('当前手机处于只读状态，文件数据已拒绝。');
    }
    const upload = state.uploadState;
    if (!upload?.stream || upload.currentIndex === null) throw new Error('收到文件数据，但上传会话没有开始。');
    if (upload.streamError) throw upload.streamError;
    if (!cdp.chooserMatches(upload.chooser, cdp.getPendingChooser(upload.chooser.id))) {
      throw new Error('网页文件上传框已变化，请重新选择文件。');
    }
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    upload.totalBytes += chunk.length;
    upload.currentBytes += chunk.length;
    if (upload.totalBytes > MAX_UPLOAD_BYTES) throw new Error(`上传总大小超过限制：${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`);
    const declaredSize = Math.max(0, Number(upload.files[upload.currentIndex]?.size) || 0);
    if (upload.currentBytes > declaredSize) {
      throw new Error(`当前文件收到的数据超过声明大小：${upload.currentBytes} > ${declaredSize} 字节`);
    }
    if (!upload.stream.write(chunk)) await waitForStreamDrain(upload.stream);
    if (upload.streamError) throw upload.streamError;
  }

  async function handleCommand(message) {
    const requestId = message.requestId;
    try {
      // 认证代数检查先于一切命令（包括 claimControl）：令牌轮换后旧代连接
      // 不得再产生任何副作用，即使关闭帧尚未到达对端。
      if (state.authEpoch !== authEpoch) {
        throw new Error('访问令牌已轮换，本连接已失效，请使用新链接重新连接。');
      }
      if (message.type === 'claimControl') {
        if (hub.controllerClientId && hub.controllerClientId !== state.clientId) {
          await cdp.releaseActiveInput('控制权切换');
          // 被接管的控制者若有进行中的上传，立即终止并清理半截文件，
          // 不能让旧控制者的传输在降权后继续落盘。
          for (const [otherWs, otherState] of hub.clients) {
            if (otherWs === ws || !otherState.uploadState) continue;
            const upload = otherState.uploadState;
            otherState.uploadState = null;
            try { upload.stream?.destroy(); } catch {}
            if (upload.dir) { try { fs.rmSync(upload.dir, { recursive: true, force: true }); } catch {} }
            sendJson(otherWs, { type: 'status', level: 'warn', message: '控制权已被其他手机接管，你的文件上传已取消。' });
          }
        }
        const claim = hub.claim(ws);
        reply(ws, requestId, { role: 'controller', changed: claim.changed });
        return;
      }
      if (controllerOnlyTypes.has(message.type) && !hub.isController(ws)) {
        throw new Error('当前手机处于只读状态，请先点“接管控制”。');
      }
      if (message.type === 'ping') {
        reply(ws, requestId, { serverTime: Date.now(), frameSequence: cdp.lastFrameSequence, cdpConnected: cdp.isOpen() });
        return;
      }
      if (message.type === 'status') {
        reply(ws, requestId, cdp.status());
        return;
      }
      if (message.type === 'clipboardGet') {
        // CLIP-001：仅响应用户当次显式点击；无轮询、无自动同步、不落盘。
        if (!CLIPBOARD_BRIDGE_ENABLED) throw new Error('剪贴板桥已在配置中关闭。');
        const result = await clipboardBridge.read();
        log('info', '用户读取电脑剪贴板', { chars: result.chars });
        reply(ws, requestId, { text: result.text, chars: result.chars });
        return;
      }
      if (message.type === 'clipboardSet') {
        if (!CLIPBOARD_BRIDGE_ENABLED) throw new Error('剪贴板桥已在配置中关闭。');
        const result = await clipboardBridge.write(message.text);
        log('info', '用户写入电脑剪贴板', { chars: result.chars });
        reply(ws, requestId, { chars: result.chars });
        return;
      }
      if (message.type === 'rotateToken') {
        // 令牌轮换只能由已认证的控制端手机触发。轮换 = 撤销：发起连接保留
        // （新令牌已回给它），其余已认证连接一律提升认证代数后以 4003 关闭
        // ——只广播提示是不够的，已建立的会话不受令牌字符串变化影响，仍能
        // claimControl 并继续注入命令。
        const rotated = rotateAccessToken();
        authEpoch += 1;
        state.authEpoch = authEpoch;
        log('warn', '用户轮换了访问令牌并撤销其余连接', { revoked: Math.max(0, hub.clients.size - 1) });
        printAccessUrls('令牌已轮换，请在手机上使用新地址：');
        reply(ws, requestId, { token: rotated });
        for (const [otherWs] of hub.clients) {
          if (otherWs === ws) continue;
          sendJson(otherWs, { type: 'status', level: 'warn', message: '访问令牌已在电脑上轮换，本连接即将断开，请用新链接重新连接。' });
          try { otherWs.close(4003, 'token-rotated'); } catch {}
        }
        return;
      }
      if (message.type === 'browserHistory') {
        // Reading the local Edge History database does not require an active CDP
        // page session, so it continues to work while Edge is temporarily in the
        // background or reconnecting.
        const result = edgeHistory.query({
          query: message.query,
          offset: message.offset,
          limit: message.limit
        });
        reply(ws, requestId, result);
        return;
      }

      // closeTab 是浏览器级调用，不需要先附加到目标标签；否则关闭后台标签
      // 会先把手机会话切到即将关闭的标签上，随后又落到任意其他标签。
      const preconnectTargetId = (message.type === 'selectTarget' || message.type === 'closeTab')
        ? null
        : (message.targetId || null);
      await cdp.ensureConnected(preconnectTargetId, { activate: false, reason: 'phone-command' });
      let result = {};
      switch (message.type) {
        case 'viewport':
          await cdp.setViewport(message.width, message.height, message.dpr, message.mobile, message.desktopWidth, message.revision, message.force);
          break;
        case 'navigate':
          await cdp.navigate(message.url);
          break;
        case 'back':
          await cdp.navigateHistory(-1);
          break;
        case 'forward':
          await cdp.navigateHistory(1);
          break;
        case 'reload':
          await cdp.reload(message.ignoreCache);
          break;
        case 'tap':
          await cdp.tap(message.x, message.y, message.inputMode, message.context || {}, message.u, message.v);
          break;
        case 'text':
          await cdp.insertText(message.text);
          break;
        case 'key':
          // count 供实时同步的批量退格使用（差量删除），普通按键仍为 1。
          await cdp.pressKey(message.key, message.modifiers, message.count);
          break;
        case 'selectAll':
          await cdp.selectAll();
          break;
        case 'wheel':
          await cdp.wheel(message.x, message.y, message.deltaX, message.deltaY, message.clearSelection, message.context || {}, message.u, message.v, message.deltaU, message.deltaV);
          break;
        case 'mobile':
          await cdp.setMobile(message.enabled);
          break;
        case 'streamPreset':
          await cdp.setStreamPreset(message.preset);
          break;
        case 'followDesktopTabs':
          result = await cdp.setFollowDesktopTabs(message.enabled);
          break;
        case 'manualCompatibility':
          result = await cdp.setManualCompatibilityMode(message.mode);
          break;
        case 'strictNativeTouch':
          result = await cdp.setStrictNativeTouch(message.enabled);
          break;
        case 'manualCompatibilityAudit':
          result = {
            compatibility: cdp.manualCompatibilityPayload(),
            audit: await cdp.readPageEnvironment(Boolean(message.force))
          };
          cdp.publishManualCompatibility();
          break;
        case 'frameQuality':
          await cdp.setFrameQuality(message.quality);
          break;
        case 'calibrationMarker':
          result = await cdp.showCalibrationMarker(message.index, message.mode);
          break;
        case 'calibrationProbe':
          result = await cdp.showCalibrationProbe(message);
          break;
        case 'tapProbe': {
          const resolved = cdp.cssPointForInput(message.x, message.y, message.context || {}, message.u, message.v);
          result = await cdp.probeTapPoint(resolved.point);
          break;
        }
        case 'pullEditableText':
          result = await cdp.pullEditableText();
          break;
        case 'tabs':
          await cdp.publishTabs(ws);
          break;
        case 'selectTarget':
          if (cdp.target?.id === message.targetId && cdp.isOpen()) {
            await cdp.releaseActiveInput('手机选择标签页').catch(() => {});
            await cdp.sendBrowser('Target.activateTarget', { targetId: message.targetId }).catch(() => {});
            await cdp.send('Page.bringToFront').catch(() => {});
            cdp.noteTargetActive(message.targetId, 'phone-tab-select');
            await cdp.publishState();
            await cdp.publishTabs();
          } else {
            await cdp.ensureConnected(message.targetId, { activate: true, reason: 'phone-tab-select' });
          }
          await cdp.recoverFrames(true);
          break;
        case 'navigateHistoryEntry':
          await cdp.navigateHistoryEntry(message.entryId);
          break;
        case 'newTab':
          result.targetId = await cdp.createTab(message.url || 'about:blank');
          break;
        case 'dedicatedWindow':
          result.dedicatedWindow = await cdp.setDedicatedWindow(Boolean(message.enabled), Boolean(message.close));
          break;
        case 'closeTab':
          await cdp.closeTab(message.targetId);
          break;
        case 'dialog':
          await cdp.handleDialog(message.accept, message.promptText);
          break;
        case 'reloadState':
          await cdp.publishState(ws);
          if (cdp.latestFrame) hub.queueFrame(cdp.latestFrame, ws);
          break;
        case 'recoverFrame':
          await cdp.recoverFrames(true);
          break;
        case 'frameProblem': {
          const now = Date.now();
          if (now - state.lastFrameProblemAt < 750) break;
          state.lastFrameProblemAt = now;
          const severe = Number(message.failures) >= 3 || /black|decode|stale/i.test(String(message.reason || ''));
          if (severe) await cdp.recoverFrames(false);
          else await cdp.captureSnapshot(`client-problem:${String(message.reason || 'unknown').slice(0, 80)}`, true);
          break;
        }
        case 'requestUpload': {
          const chooser = cdp.getPendingChooser();
          if (!chooser) {
            const armed = await cdp.armFileChooserInterception(FILE_CHOOSER_TOOLBAR_ARM_MS, 'phone-upload-button');
            if (!armed) throw new Error('当前 Edge 无法临时接管网页文件选择器。');
            result = { armed: true, expiresAt: cdp.fileChooserArmUntil };
            hub.broadcastJson({
              type: 'status',
              level: 'info',
              message: `上传已准备：请在 ${Math.round(FILE_CHOOSER_TOOLBAR_ARM_MS / 1000)} 秒内点击网页里的“上传/选择文件”按钮。`
            });
            break;
          }
          sendJson(ws, {
            type: 'fileChooser',
            id: chooser.id,
            targetId: chooser.targetId,
            mode: chooser.mode,
            multiple: Boolean(chooser.multiple),
            accept: chooser.accept || '',
            directory: Boolean(chooser.directory)
          });
          result = { armed: false, chooserId: chooser.id };
          break;
        }
        case 'computerRoots': {
          const chooser = cdp.getPendingChooser(message.chooserId || null);
          if (!chooser) throw new Error('网页文件上传框已经失效，请重新点击网页上传按钮。');
          result = { roots: computerFiles.listRoots() };
          break;
        }
        case 'computerList': {
          const chooser = cdp.getPendingChooser(message.chooserId || null);
          if (!chooser) throw new Error('网页文件上传框已经失效，请重新点击网页上传按钮。');
          result = computerFiles.listDirectory(message.path, { sort: message.sort || COMPUTER_FILE_SORT });
          break;
        }
        case 'computerCommit': {
          await cleanupUpload(true);
          const chooser = cdp.getPendingChooser(message.chooserId || null);
          if (!chooser) throw new Error('网页文件上传框已经失效，请重新点击网页上传按钮。');
          const selection = computerFiles.validateSelection(message.paths, {
            multiple: Boolean(chooser.multiple),
            directory: Boolean(chooser.directory),
            maxFiles: MAX_COMPUTER_FILES
          });
          const selectedPaths = selection.map((item) => item.path);
          await cdp.setUploadedFiles(selectedPaths, chooser);
          result = {
            count: selectedPaths.length,
            totalBytes: selection.reduce((sum, item) => sum + item.size, 0),
            files: selection.map(({ name, size, kind }) => ({ name, size, kind }))
          };
          break;
        }
        case 'cancelUpload':
          await cleanupUpload(true);
          result.cancelled = await cdp.cancelFileChooser(message.chooserId || null);
          break;
        case 'uploadBegin': {
          await cleanupUpload(true);
          const chooser = cdp.getPendingChooser(message.chooserId || null);
          if (!chooser) throw new Error('网页文件上传框已经失效，请重新点击网页上传按钮。');
          const rawFiles = Array.isArray(message.files) ? message.files : [];
          if (!rawFiles.length) throw new Error('没有选择文件。');
          if (rawFiles.length > MAX_UPLOAD_FILES) throw new Error(`一次最多上传 ${MAX_UPLOAD_FILES} 个文件。`);
          if (!chooser.multiple && !chooser.directory && rawFiles.length > 1) throw new Error('该网页上传框只允许选择一个文件。');
          const files = rawFiles.map((file, index) => {
            const size = Number(file?.size);
            if (!Number.isSafeInteger(size) || size < 0 || size > MAX_UPLOAD_BYTES) {
              throw new Error(`第 ${index + 1} 个文件的大小声明无效。`);
            }
            return {
              name: String(file?.name || `file-${index + 1}`).slice(0, 1000),
              size,
              type: String(file?.type || '').slice(0, 255),
              lastModified: Number.isFinite(Number(file?.lastModified)) ? Number(file.lastModified) : 0
            };
          });
          const declaredTotal = files.reduce((sum, file) => sum + file.size, 0);
          if (!Number.isSafeInteger(declaredTotal) || declaredTotal > MAX_UPLOAD_BYTES) {
            throw new Error(`上传总大小超过限制：${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`);
          }
          try {
            const disk = fs.statfsSync(UPLOAD_ROOT);
            const available = Number(disk.bavail) * Number(disk.bsize);
            if (Number.isFinite(available) && available < declaredTotal + UPLOAD_FREE_SPACE_RESERVE_BYTES) {
              throw new Error(`Windows 临时目录空间不足：至少还需 ${Math.ceil((declaredTotal + UPLOAD_FREE_SPACE_RESERVE_BYTES - available) / 1024 / 1024)} MB。`);
            }
          } catch (error) {
            if (/空间不足/.test(error.message || '')) throw error;
            log('warn', '无法读取临时目录剩余空间，继续使用上传大小校验', { error: error.message });
          }
          const uploadId = crypto.randomUUID();
          const dir = path.join(UPLOAD_ROOT, uploadId);
          fs.mkdirSync(dir, { recursive: true });
          state.uploadState = {
            id: uploadId,
            dir,
            files,
            chooser: { ...chooser },
            paths: new Array(files.length),
            currentIndex: null,
            currentBytes: 0,
            totalBytes: 0,
            declaredTotal,
            stream: null,
            streamError: null
          };
          result = { uploadId };
          break;
        }
        case 'uploadFileBegin': {
          const upload = state.uploadState;
          if (!upload) throw new Error('上传会话不存在。');
          if (upload.stream) throw new Error('上一个文件还没有结束。');
          if (!cdp.chooserMatches(upload.chooser, cdp.getPendingChooser(upload.chooser.id))) {
            throw new Error('网页文件上传框已变化，请重新点击网页上传按钮。');
          }
          const index = Number(message.index);
          if (!Number.isInteger(index) || index < 0 || index >= upload.files.length) throw new Error('文件序号无效。');
          if (upload.paths[index]) throw new Error('该文件已经开始或完成上传。');
          const relativeName = safeUploadRelativePath(upload.files[index].name, Boolean(upload.chooser.directory));
          const relativePath = upload.chooser.directory
            ? relativeName
            : path.join(String(index + 1).padStart(3, '0'), relativeName);
          const filePath = path.resolve(upload.dir, relativePath);
          const resolvedDir = path.resolve(upload.dir);
          if (filePath !== resolvedDir && !filePath.startsWith(`${resolvedDir}${path.sep}`)) throw new Error('文件路径无效。');
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          const fd = fs.openSync(filePath, 'wx');
          upload.currentIndex = index;
          upload.currentBytes = 0;
          upload.paths[index] = filePath;
          upload.streamError = null;
          upload.stream = fs.createWriteStream(filePath, { fd, autoClose: true });
          upload.stream.on('error', (error) => { upload.streamError = error; });
          break;
        }
        case 'uploadChunkAck': {
          const upload = state.uploadState;
          if (!upload?.stream || upload.currentIndex === null) throw new Error('当前没有正在接收的文件。');
          if (upload.streamError) throw upload.streamError;
          const index = Number(message.index);
          if (!Number.isInteger(index) || index !== upload.currentIndex) throw new Error('上传分块所属文件不一致。');
          const expectedBytes = Number(message.expectedBytes);
          if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0) throw new Error('上传分块确认字节数无效。');
          if (expectedBytes !== upload.currentBytes) {
            throw new Error(`上传分块确认失败：电脑已收到 ${upload.currentBytes} 字节，手机期望 ${expectedBytes} 字节。`);
          }
          result = { currentBytes: upload.currentBytes, totalBytes: upload.totalBytes };
          break;
        }
        case 'uploadFileEnd': {
          const upload = state.uploadState;
          if (!upload?.stream) throw new Error('当前没有正在接收的文件。');
          const index = Number(message.index);
          if (!Number.isInteger(index) || index !== upload.currentIndex) throw new Error('结束的文件序号与当前文件不一致。');
          const expected = upload.files[upload.currentIndex].size;
          const stream = upload.stream;
          try {
            if (upload.streamError) throw upload.streamError;
            await new Promise((resolve, reject) => {
              const onFinish = () => { cleanup(); resolve(); };
              const onError = (error) => { cleanup(); reject(error); };
              // 断线清理会 destroy() 流,此时只触发 'close'（无 finish/error）,
              // 不监听它的话本 Promise 与整条消息队列会永久悬挂并泄漏。
              const onClose = () => { cleanup(); reject(new Error('上传文件流已关闭')); };
              const cleanup = () => {
                stream.off('finish', onFinish);
                stream.off('error', onError);
                stream.off('close', onClose);
              };
              stream.once('finish', onFinish);
              stream.once('error', onError);
              stream.once('close', onClose);
              stream.end();
            });
            if (upload.streamError) throw upload.streamError;
          } finally {
            upload.stream = null;
          }
          if (expected !== upload.currentBytes) throw new Error(`文件大小不匹配：收到 ${upload.currentBytes} 字节，预期 ${expected} 字节。`);
          upload.currentIndex = null;
          upload.currentBytes = 0;
          upload.streamError = null;
          break;
        }
        case 'uploadCommit': {
          const upload = state.uploadState;
          if (!upload || upload.stream) throw new Error('文件尚未全部接收完成。');
          if (!cdp.chooserMatches(upload.chooser, cdp.getPendingChooser(upload.chooser.id))) {
            throw new Error('网页文件上传框已变化，请重新点击网页上传按钮。');
          }
          if (upload.paths.some((item) => !item)) throw new Error('有文件没有上传完成。');
          if (upload.totalBytes !== upload.declaredTotal) {
            throw new Error(`上传总大小不匹配：收到 ${upload.totalBytes} 字节，预期 ${upload.declaredTotal} 字节。`);
          }
          const paths = [...upload.paths];
          await cdp.setUploadedFiles(paths, upload.chooser);
          state.uploadState = null;
          scheduleUploadCleanup(upload.dir);
          result = { count: paths.length };
          break;
        }
        default:
          throw new Error(`未知控制命令：${message.type || '(空)'}`);
      }
      reply(ws, requestId, result);
    } catch (error) {
      log('warn', '手机命令执行失败', { type: message.type, error: error.message });
      replyError(ws, requestId, error);
      if (state.uploadState && /^upload/.test(message.type || '')) await cleanupUpload(true);
    }
  }

  ws.on('message', (raw, isBinary) => {
    state.lastSeenAt = Date.now();
    // 旧认证代的连接：丢弃一切入站数据（文本命令、触摸、二进制上传块）。
    // 关闭帧已发出，但到达前的在途消息不得再产生副作用。
    if (state.authEpoch !== authEpoch) return;
    if (isBinary) {
      messageQueue = messageQueue.then(() => handleBinaryUpload(raw)).catch(async (error) => {
        replyError(ws, null, error);
        await cleanupUpload(true);
      });
      return;
    }

    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }

    if (message.type === 'touch') {
      if (!hub.isController(ws)) return;
      cdp.enqueueTouch(
        message.event,
        message.x,
        message.y,
        message.inputMode,
        message.context || {},
        message.gestureId || null,
        message.eventSequence || 0,
        message.u,
        message.v
      );
      return;
    }

    if (message.type === 'frameAck') {
      hub.ackFrame(state, message);
      return;
    }

    messageQueue = messageQueue.then(() => handleCommand(message)).catch((error) => {
      replyError(ws, message.requestId, error);
    });
  });

  let connectionCleaned = false;
  const cleanupConnection = () => {
    if (connectionCleaned) return;
    connectionCleaned = true;
    const wasController = hub.isController(ws);
    hub.remove(ws);
    cleanupUpload(true).catch(() => {});
    if (wasController) cdp.releaseActiveInput('控制手机断开').catch(() => {});
    log('info', '手机断开控制器', { clientId: state.clientId, address: state.remoteAddress });
  };
  ws.once('close', cleanupConnection);
  ws.once('error', cleanupConnection);
});

const heartbeat = setInterval(() => {
  for (const state of hub.clients.values()) {
    const ws = state.ws;
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch {}
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 20000);
heartbeat.unref?.();

function ipv4Addresses() {
  const rows = [];
  const virtualPattern = /(vEthernet|VMware|VirtualBox|Tailscale|ZeroTier|Wintun|WireGuard|Hyper-V|Docker|Loopback|Npcap)/i;
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const item of entries || []) {
      if (item.family !== 'IPv4' || item.internal || /^169\.254\./.test(item.address)) continue;
      const privateAddress = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address);
      rows.push({ name, address: item.address, privateAddress, virtual: virtualPattern.test(name) });
    }
  }
  return rows.sort((a, b) =>
    Number(a.virtual) - Number(b.virtual) ||
    Number(b.privateAddress) - Number(a.privateAddress) ||
    a.name.localeCompare(b.name)
  );
}

function printAccessUrls(heading = ' 手机打开以下地址之一：') {
  console.log('');
  console.log(` 访问令牌：${ACCESS_TOKEN}`);
  console.log(heading);
  const addresses = ipv4Addresses();
  if (!addresses.length) console.log(` http://电脑IP:${HTTP_PORT}/#token=${encodeURIComponent(ACCESS_TOKEN)}`);
  for (const item of addresses) {
    console.log(` http://${item.address}:${HTTP_PORT}/#token=${encodeURIComponent(ACCESS_TOKEN)}  [${item.name}${item.virtual ? '，虚拟网卡候选' : item.privateAddress ? '' : '，非私网地址'}]`);
  }
  console.log('');
}

server.listen(HTTP_PORT, LISTEN_HOST, () => {
  console.log('');
  console.log('============================================================');
  console.log(` Edge 手机 CDP 控制器 v${VERSION} 已启动`);
  console.log(` 监听地址：${LISTEN_HOST}:${HTTP_PORT}`);
  console.log(` 令牌文件：${TOKEN_PATH}`);
  printAccessUrls();
  console.log(` 本机健康检查：http://127.0.0.1:${HTTP_PORT}/health`);
  console.log(` 日志文件：${LOG_PATH}`);
  console.log(' 不要开放或转发 Edge 调试端口到公网。');
  console.log('============================================================');
  console.log('');
  log('info', 'HTTP/WebSocket 控制服务开始监听', { host: LISTEN_HOST, port: HTTP_PORT });
});

server.on('error', (error) => {
  log('error', '控制服务启动失败', { error: error.message, code: error.code });
  console.error(`控制器无法监听端口 ${HTTP_PORT}：${error.message}`);
  setTimeout(() => process.exit(1), 80).unref?.();
});

async function shutdown(signal) {
  log('info', '正在停止控制器', { signal });
  clearInterval(heartbeat);
  clearInterval(cdp.watchdog);
  clearTimeout(cdp.reconnectTimer);
  clearTimeout(cdp.viewportFallbackTimer);
  clearTimeout(cdp.visualDemandTimer);
  clearTimeout(cdp.manualCompatibilityRefreshTimer);
  clearTimeout(cdp.fileChooserArmTimer);
  // 这些定时器若在关停窗口内触发,会经 listTargets→ensureTransport 重新拨号
  // 一条全新的 Edge WebSocket。
  clearTimeout(cdp.tabsTimer);
  clearTimeout(cdp.layoutRefreshTimer);
  clearTimeout(cdp.desktopTabProbeTimer);
  clearTimeout(hub.releaseTimer);
  cdp.uiaMonitor?.stop();
  for (const state of hub.clients.values()) {
    try { state.ws.close(1001, '服务器停止'); } catch {}
  }
  try { await cdp.releaseActiveInput('控制器停止'); } catch {}
  try { await cdp.stopScreencast(); } catch {}
  try { await cdp.disarmFileChooserInterception('controller-stop', true); } catch {}
  try { await cdp.restoreAllManualCompatibilityWindows(); } catch {}
  try { cdp.connectingSocket?.terminate(); } catch {}
  try { cdp.ws?.close(); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref?.();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  log('error', '未捕获异常', { error: error.stack || error.message });
});
process.on('unhandledRejection', (error) => {
  log('error', '未处理 Promise 拒绝', { error: error?.stack || String(error) });
});
