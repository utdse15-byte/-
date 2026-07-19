'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const config = JSON.parse(read('config.json'));
const lock = JSON.parse(read('package-lock.json'));
const installedLock = JSON.parse(read(path.join('node_modules', '.package-lock.json')));
const server = read('server.js');
const app = read(path.join('public', 'app.js'));
const html = read(path.join('public', 'index.html'));
const css = read(path.join('public', 'styles.css'));
const readme = read('README-中文.md');
const packageVersion = String(JSON.parse(read('package.json')).version);
const notes = read(`更新说明-v${packageVersion}.md`);
const report = read('发布验证报告.md');
const computerFiles = read(path.join('lib', 'computer-files.js'));
const edgeHistory = read(path.join('lib', 'edge-history.js'));
const inputCoordinates = read(path.join('lib', 'input-coordinates.js'));
const windowsUia = read(path.join('lib', 'windows-edge-uia.js'));
const windowsUiaHelper = read(path.join('helpers', 'edge-uia-monitor.ps1'));
const startupScript = read('2-启动Edge和控制器.ps1');
const versionText = read('VERSION.txt').trim();
const bundledWs = JSON.parse(read(path.join('node_modules', 'ws', 'package.json')));
const libGeometry = fs.readFileSync(path.join(root, 'lib', 'geometry.js'));
const publicGeometry = fs.readFileSync(path.join(root, 'public', 'geometry.js'));
const geometryText = libGeometry.toString('utf8');

// 版本号以 package.json 为唯一来源；其余文件必须与它一致。
assert.ok(/^6\.\d+\.\d+$/.test(packageVersion));
assert.strictEqual(lock.version, packageVersion);
assert.strictEqual(lock.packages[''].version, packageVersion);
assert.strictEqual(installedLock.version, packageVersion);
assert.strictEqual(versionText, packageVersion);
assert.ok(readme.startsWith(`# Edge 手机 CDP 控制器 v${packageVersion}`));
assert.ok(notes.startsWith(`# v${packageVersion} 更新说明`));
assert.ok(report.startsWith(`# Edge 手机 CDP 控制器 v${packageVersion} 发布验证报告`));
assert.ok(server.includes(`const VERSION = '${packageVersion}'`));
assert.strictEqual(packageJson.dependencies.ws, '8.21.1');
assert.strictEqual(bundledWs.version, '8.21.1');
assert.strictEqual(packageJson.engines.node, '>=22.16.0');
assert.ok(packageJson.scripts.test.includes('input-coordinates.test.js'));
assert.ok(packageJson.scripts.test.includes('edge-history.test.js'));
assert.ok(packageJson.scripts.test.includes('manual-compatibility.test.js'));
assert.ok(packageJson.scripts.test.includes('windows-edge-uia.test.js'));
assert.ok(packageJson.scripts['test:all'].includes('test:browser') && packageJson.scripts['test:all'].includes('test:real'));

assert.strictEqual(config.proxyServer, 'http://127.0.0.1:7897');
assert.strictEqual(config.hostResolverRules, 'MAP * 0.0.0.0, EXCLUDE 127.0.0.1');
assert.strictEqual(config.listenHost, '0.0.0.0');
assert.strictEqual(config.followDesktopTabs, true);
assert.strictEqual(config.autoRestartEdge, true);
assert.strictEqual(config.computerFileSort, 'modified-desc');
assert.ok(config.browserHistoryMaxEntries >= 20 && config.browserHistoryMaxEntries <= 500);
assert.ok(Array.isArray(config.computerFileRoots));
assert.strictEqual(config.manualCompatibilityMode, 'auto');
assert.ok(config.manualCompatibilityDomains.includes('chatgpt.com'));
assert.ok(config.manualCompatibilityDomains.includes('chat.openai.com'));
assert.ok(config.manualCompatibilityDomains.includes('auth.openai.com'));
assert.ok(!config.manualCompatibilityDomains.includes('openai.com'), '不要把整个 openai.com 域泛化为严格站点');
assert.ok(config.manualCompatibilityDomains.includes('claude.ai'));
assert.ok(config.manualCompatibilityDomains.includes('claude.com'));
assert.ok(!config.manualCompatibilityDomains.includes('anthropic.com'), '不要把整个 anthropic.com 域泛化为严格站点');
assert.strictEqual(config.desktopTabFollowStrategy, 'uia');
assert.strictEqual(config.strictRuntimeTabFallback, false);
assert.strictEqual(config.strictNativeTouchDefault, false);
assert.ok(config.activeTabPollMs >= 2500);
assert.ok(config.manualCompatibilityAuditMinutes >= 1);
assert.ok(config.fileChooserTransientMs >= 800);
assert.ok(config.fileChooserToolbarArmMs >= 10000);

// v6.7 严格人工模式：ChatGPT / Claude 默认使用真实桌面 Edge，且不做反检测伪装。
assert.ok(server.includes('Emulation.clearDeviceMetricsOverride'));
assert.ok(server.includes('const nativeTouch = Boolean(this.strictNativeTouchEnabled)'));
assert.ok(server.includes("'desktop-native-touch'"));
assert.ok(server.includes("'desktop-mouse-wheel'"));
assert.ok(server.includes('async setStrictNativeTouch'));
assert.ok(server.includes('Browser.setWindowBounds'));
assert.ok(server.includes('Page.frameRequestedNavigation'));
assert.ok(server.includes('frame-requested-navigation'));
assert.ok(server.includes('auditAutomatic: false'));
assert.ok(server.includes("idleCdpDomains: ['Target', 'Page', 'Input']"));
assert.ok(server.includes('configurePageDomainsForCurrentMode'));
assert.ok(server.includes("setRuntimeDomain(false)"));
assert.ok(server.includes("setDomDomain(false)"));
assert.ok(server.includes("setFileChooserInterception(false, 'session-idle')"));
assert.ok(app.includes("effectiveGestureMode() === 'smart' && !state.manualCompatibility?.active"));
assert.ok(server.includes('FILE_CHOOSER_TOOLBAR_ARM_MS'));
assert.ok(server.includes("armFileChooserInterception(FILE_CHOOSER_TOOLBAR_ARM_MS, 'phone-upload-button')"));
assert.ok(server.includes('localOnly: true'));
assert.ok(html.includes('id="manualCompatibilitySelect"'));
assert.ok(html.includes('严格人工模式（ChatGPT / Claude）'));
assert.ok(html.includes('id="strictNativeTouchButton"'));
assert.ok(html.includes('id="fsStrictInputButton"'));
assert.ok(app.includes("request('manualCompatibility'"));
assert.ok(app.includes("request('strictNativeTouch'"));
assert.ok(app.includes("edgePhoneFollowDesktopTabsV67', 'true'"));
assert.ok(app.includes('function effectiveInputMode'));
assert.ok(app.includes('function effectiveGestureMode'));
assert.ok(app.includes('opening settings must not execute JavaScript in ChatGPT/Claude'));
assert.ok(!/settingsButton'[\s\S]{0,500}manualCompatibilityAudit/.test(app), '打开设置不得自动运行环境审计');
for (const forbidden of ['Emulation.setUserAgentOverride', 'Network.setUserAgentOverride', 'Emulation.setAutomationOverride', '--enable-automation', '--headless']) {
  assert.ok(!server.includes(forbidden), `服务端不得包含反检测或无头参数：${forbidden}`);
  assert.ok(!startupScript.includes(forbidden), `启动脚本不得包含反检测或无头参数：${forbidden}`);
}
assert.ok(!/navigator\.webdriver\s*=(?!=)/.test(server));
assert.ok(server.includes('控制器不会修改 User-Agent、navigator.webdriver、平台或请求标头'));

// 标签同步默认开启，并且只使用 Windows UI Automation；切到其他应用时保持当前标签。
assert.ok(server.includes("desktopTabFollowStrategy === 'uia'"));
assert.ok(html.includes('默认开启：使用 Windows UI Automation'));
assert.ok(app.includes("edgePhoneFollowDesktopTabsV67', 'true'"));
assert.ok(server.includes('new EdgeUiaMonitor'));
assert.ok(server.includes('result = await cdp.setFollowDesktopTabs(message.enabled)'));
assert.ok(windowsUia.includes('chooseTargetFromUia'));
assert.ok(windowsUia.includes("process.platform !== 'win32'"));
assert.ok(windowsUiaHelper.includes('GetForegroundWindow'));
assert.ok(windowsUiaHelper.includes("ProcessName -ieq 'msedge'"));
assert.ok(windowsUiaHelper.includes('Get-SelectedEdgeTab'));

// 原 Edge 配置、代理和动态调试恢复。
assert.ok(startupScript.includes('$env:EDGE_EXECUTABLE = $Edge'));
assert.ok(startupScript.includes('$env:EDGE_PROXY_SERVER = $ProxyServer'));
assert.ok(startupScript.includes('$env:EDGE_HOST_RESOLVER_RULES = $HostResolverRules'));
assert.ok(startupScript.includes('$env:EDGE_MANAGED_SESSION = "1"'));
assert.ok(server.includes('readBrowserWebSocketInfo'));
assert.ok(server.includes('DevToolsActivePort 属于上一次已退出的 Edge'));
assert.ok(server.includes("spawn(EDGE_EXECUTABLE, this.launchArguments(false)"));
assert.ok(server.includes('Edge 重启后原标签页 ID 已变化'));
assert.ok(server.includes('if (this.isOpen() || this.reconnectTimer) return;'));

// v6.5 同帧归一化触摸坐标基础必须继续保留。
assert.ok(app.includes('Geometry.cssPointToFrameNormalized'));
assert.ok(app.includes('u: point.u') && app.includes('v: point.v'));
assert.ok(app.includes('coordinateContextFromGeometry'));
assert.ok(app.includes('gestureId') && app.includes('eventSequence'));
assert.ok(server.includes('normalizedToCssPoint'));
assert.ok(server.includes('context.viewportRevision !== serverRevision'));
assert.ok(server.includes('context.frameEpoch && this.frameEpoch && context.frameEpoch < this.frameEpoch'));
assert.ok(inputCoordinates.includes("source = 'frame-metadata'"));
assert.ok(inputCoordinates.includes('context.contentDipWidth / scale'));
assert.ok(inputCoordinates.includes('clampInsideViewport'));
assert.ok(inputCoordinates.includes('const inset = Math.min(0.5'));
assert.ok(!inputCoordinates.includes("source = 'visual-width'"));
assert.ok(geometryText.includes("source.startsWith('screencast')"));
assert.ok(geometryText.includes("unit: 'normalized'"));
assert.ok(geometryText.includes('cssPointToFrameNormalized'));
assert.ok(geometryText.includes('finite(cssX, 0) * pageScaleFactor / contentDipWidth'));
assert.deepStrictEqual(publicGeometry, libGeometry, '浏览器端与 Node 端坐标算法必须完全一致');

// v6.6 四套独立校准、旧值迁移和物理方向判断。
assert.ok(app.includes("const CALIBRATION_STORAGE_KEY = 'edgePhoneCalibrationProfilesV67'"));
assert.ok(app.includes("const CALIBRATION_LEGACY_KEY = 'edgePhoneCalibrationV65'"));
for (const key of ['windowed-portrait', 'windowed-landscape', 'fullscreen-portrait', 'fullscreen-landscape']) {
  assert.ok(app.includes(`'${key}'`), `缺少校准配置 ${key}`);
}
assert.ok(app.includes('function physicalOrientation'));
assert.ok(app.includes('globalThis.screen?.orientation?.type'));
assert.ok(app.includes('globalThis.screen?.width'));
assert.ok(app.includes('return calibrationProfileKeyFor(Boolean(document.fullscreenElement), window.innerWidth, window.innerHeight)'));
assert.ok(app.includes('saveCurrentCalibrationProfile'));
assert.ok(app.includes('copyCalibrationProfile'));
assert.ok(app.includes('resetAllCalibrations'));
assert.ok(html.includes('id="calibrationProfileLabel"'));
assert.ok(html.includes('id="copyCalibrationProfileButton"'));
assert.ok(html.includes('id="resetAllCalibrationButton"'));

// v6.6 默认三点只拟合偏移，五点比例校准为高级实验功能。
assert.ok(geometryText.includes('function fitOffsetCalibration'));
assert.ok(geometryText.includes('const rawOffsetX = median'));
assert.ok(geometryText.includes('scaleX: current.scaleX'));
assert.ok(app.includes("Geometry.fitOffsetCalibration(wizard.samples, wizard.baseCalibration)"));
assert.ok(app.includes("startAutoCalibration('offset')"));
assert.ok(app.includes("startAutoCalibration('precision')"));
assert.ok(html.includes('三点快速校准'));
assert.ok(html.includes('五点边缘校准（实验）'));
assert.ok(html.indexOf('三点快速校准') < html.indexOf('五点边缘校准（实验）'));

// 蓝色手机触点 + 红色命中点都只画在控制器页面，不能注入目标网页 DOM。
assert.ok(html.includes('id="calibrationLocalMarker"'));
assert.ok(html.includes('id="calibrationTargetMarker"'));
assert.ok(html.includes('id="calibrationRemoteMarker"'));
assert.ok(html.includes('id="calibrationTestButton"'));
assert.ok(css.includes('#calibrationLocalMarker'));
assert.ok(app.includes('Geometry.frameNormalizedToLocal'));
assert.ok(app.includes('function calibrationTargets'));
assert.ok(app.includes('此测试完全在手机控制页绘制'));
assert.ok(!app.includes("request('calibrationMarker'"));
assert.ok(!app.includes("request('calibrationProbe'"));
assert.ok(!server.includes('__edge_phone_cdp_calibration_probe__'));
assert.ok(!server.includes('__edge_phone_cdp_calibration_marker__'));
assert.ok(!server.includes("document.createElement('div')"), '校准不得向目标页面插入 DOM');

// 全屏工具必须为固定悬浮层，不参与 app 网格，也不能因系统 pointercancel 误展开。
for (const id of ['fullscreenDock', 'fullscreenDockHandle', 'fullscreenDockPanel', 'fullscreenCalibrationPanel',
  'fsBackButton', 'fsForwardButton', 'fsReloadButton', 'fsTabsButton', 'fsKeyboardButton', 'fsUploadButton',
  'fsStrictInputButton', 'fsCalibrationButton', 'fsSettingsButton', 'fsExitButton']) {
  assert.ok(html.includes(`id="${id}"`), `缺少全屏控件 ${id}`);
}
assert.ok(css.includes('#fullscreenDock { display: none; position: fixed'));
assert.ok(css.includes('flex-direction: row-reverse'));
assert.ok(css.includes('body.immersive-fullscreen #keyboardPanel.open'));
assert.ok(css.includes('body.immersive-fullscreen #stage { grid-row: 1; width: 100%; height: 100%; }'));
assert.ok(app.includes('function bindFullscreenDockDrag'));
assert.ok(app.includes('A system gesture or browser interruption must not be treated as a tap'));
assert.ok(app.includes('openFullscreenCalibrationPanel'));
assert.ok(app.includes('已进入沉浸全屏；点右侧“⋮”'));

// 画面来源与尺寸修订必须绑定；截图不能继承连续帧 offsetTop。
assert.ok(server.includes('this.screencastViewportRevision'));
assert.ok(server.includes('viewportRevision: this.screencastViewportRevision'));
assert.ok(server.includes('metricsViewportRevision'));
assert.ok(server.includes('offsetTop: 0'));
assert.ok(app.includes("acknowledgeDiscardedFrame(metadata, 'old-viewport')"));
assert.ok(app.includes('state.viewportSyncPending'));
assert.ok(app.includes('state.requestedViewportRevision'));
assert.ok(app.includes('renderedViewportRevision >= state.requestedViewportRevision'));

// 全屏/浏览器栏尺寸变化：等待稳定后只建立一个新修订，旧画面保留但不可触摸。
assert.ok(html.includes('id="syncViewportButton"'));
assert.ok(app.includes('function settleViewport'));
assert.ok(app.includes('stableSamples >= 3 || elapsed >= 1450'));
assert.ok(app.includes('state.resizeSettling = true'));
assert.ok(app.includes('state.resizeSettling = false'));
assert.ok(app.includes("settleViewport(active ? 'fullscreen-enter' : 'fullscreen-exit')"));
assert.ok(app.includes('画面尺寸正在同步，请看到新画面后再触摸'));
assert.ok(app.includes('cancelAutoCalibration({ silent: true })'));
assert.ok(geometryText.includes('const screenZoom'));
assert.ok(!geometryText.includes('drawScaleX'), '远程画面不能横纵独立拉伸');

// 原生直接触摸仍为默认，智能滚动作为长按选字兼容模式。
assert.ok(app.includes("storageGet('edgePhoneGestureModeV64', 'direct')"));
assert.ok(app.includes("storageGet('edgePhoneInputModeV64', 'nativeTouch')"));
assert.ok(server.includes('async dispatchNativeTouch(eventType'));
assert.ok(server.includes('Input.dispatchTouchEvent'));
assert.ok(app.includes('智能模式在判断出“轻点”或“滚动”之前，不向 Edge 发送按下事件'));

// 真正的 Edge 全局浏览历史，而非仅当前标签页会话历史。
assert.ok(html.includes('id="browserHistoryModeButton"'));
assert.ok(html.includes('id="browserHistoryList"'));
assert.ok(app.includes("request('browserHistory'"));
assert.ok(app.includes('renderBrowserHistory'));
assert.ok(server.includes("message.type === 'browserHistory'"));
assert.ok(server.includes('new EdgeHistoryService'));
assert.ok(edgeHistory.includes('FROM visits AS v'));
assert.ok(edgeHistory.includes('ORDER BY v.visit_time DESC'));
assert.ok(edgeHistory.includes("require('node:sqlite')"));

// 电脑文件默认按更改时间排序，并保持路径边界。
assert.ok(html.includes('id="computerSortSelect"'));
assert.ok(html.indexOf('value="modified-desc"') < html.indexOf('value="modified-asc"'));
assert.ok(app.includes('edgePhoneComputerSortV64'));
assert.ok(server.includes("computerFiles.listDirectory(message.path, { sort: message.sort || COMPUTER_FILE_SORT })"));
assert.ok(computerFiles.includes("defaultSort = normalizeSort(options.defaultSort || 'modified-desc')"));
assert.ok(computerFiles.includes("case 'modified-desc'"));
assert.ok(computerFiles.includes('resolveAllowed'));

// 电脑切到其他 Windows 应用时，不得把 visible 页面误判为新标签。
assert.ok(server.includes('requireFocused: true'));
assert.ok(server.includes('this.desktopEdgeFocused = false'));
assert.ok(server.includes('edgeApplicationInBackground'));
assert.ok(server.includes('if (state.edgeForeground !== true)'));
assert.ok(server.includes('if (options.requireFocused) return null;'));
assert.ok(!/if \(currentVisible\) this\.noteTargetActive\(this\.target\.id, 'desktop-visible'\)/.test(server));
assert.ok(server.includes("activate: false, reason: 'desktop-follow-uia'"));
assert.ok(server.includes("activate: false, reason: 'desktop-follow-runtime'"));
assert.ok(server.includes('Page.screencastVisibilityChanged'));

// 帧追赶、黑屏恢复和文件上传事务继续保留。
assert.ok(server.includes('awaitingFrameAck') && server.includes('pendingFrame'));
assert.ok(app.includes("type: 'frameAck'"));
assert.ok(server.includes('snapshotBaseSequence'));
assert.ok(server.includes('newerScreencastArrived'));
assert.ok(app.includes('expectedFrameEpoch > state.displayedFrameEpoch'));
assert.ok(server.includes('frameEpoch'));
assert.ok(app.includes("request('computerCommit'"));
assert.ok(server.includes("case 'computerCommit'"));
assert.ok(server.includes('userActivationSerial'));
assert.ok(app.includes("imageBuffer: $('screenImageBuffer')"));
assert.ok(app.includes('ensureBackCanvas'));
assert.ok(!app.includes('desynchronized: true'));
assert.ok(!app.includes("visualViewport?.addEventListener('scroll'"));

// 手机 WebSocket 不能形成重复连接风暴。
assert.ok(app.includes('function wsIsActive()'));
assert.ok(app.includes('connectionGeneration'));
assert.ok(app.includes('if (!force && wsIsActive()) return;'));

function walkPowerShell(directory, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const rel = path.join(prefix, entry.name);
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...walkPowerShell(full, rel));
    else if (entry.name.endsWith('.ps1')) out.push(rel);
  }
  return out;
}
const ps1Files = walkPowerShell(root);
assert.ok(ps1Files.length >= 7);
for (const name of ps1Files) {
  const bytes = fs.readFileSync(path.join(root, name));
  assert.deepStrictEqual([...bytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF], `${name} 必须是 UTF-8 BOM`);
  const text = bytes.toString('utf8');
  assert.ok(!/[\u2018\u2019\u201C\u201D]/.test(text), `${name} 不能包含弯引号`);
  assert.ok(!/(^|[^\r])\n/.test(text.replace(/^\uFEFF/, '')), `${name} 必须使用 CRLF 换行`);
}

const cmdFiles = fs.readdirSync(root).filter((name) => name.endsWith('.cmd'));
for (const name of cmdFiles) {
  const text = fs.readFileSync(path.join(root, name), 'utf8');
  assert.ok(/ExecutionPolicy Bypass/i.test(text), `${name} 必须只对本次启动绕过签名限制`);
}

console.log(`project-integrity.test.js: OK (${ps1Files.length} 个 PowerShell 脚本，${cmdFiles.length} 个 CMD 启动器)`);
